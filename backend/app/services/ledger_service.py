"""Append-only account ledgers (Phase 4).

Two books share one shape and one rule set:

* ``customer_ledger_entries`` — receivable. Debit = the customer owes MORE
  (credit sale), credit = the customer owes LESS (khata payment).
* ``supplier_ledger_entries`` — payable (mirror image). Credit = we owe the
  supplier MORE (purchase), debit = we owe the supplier LESS (payment made).

RULES enforced here:
  * rows are only ever INSERTed — no application path updates or deletes them.
    Corrections are expressed as REVERSAL entries (reserved; a later phase
    exposes the reversal UI).
  * the outstanding balance exists ONLY as the sum of ledger rows; there is no
    cached balance column on ``customers`` / ``suppliers``.
  * ``balance_after_paise`` is stamped on every row at insert time so a
    filtered ledger page still shows the true running balance.
  * every write happens inside the caller's transaction (never commits).
"""

from __future__ import annotations

import sqlite3
from typing import Any

from ..errors import ApiError
from .auth_service import utcnow_iso
from ..utils.ids import new_id

# account -> (table, entity column, signed direction of the balance)
ACCOUNTS: dict[str, dict[str, str]] = {
    "customer": {
        "table": "customer_ledger_entries",
        "column": "customer_id",
        # receivable: outstanding = debits - credits
        "expression": "COALESCE(SUM(debit_paise - credit_paise), 0)",
    },
    "supplier": {
        "table": "supplier_ledger_entries",
        "column": "supplier_id",
        # payable: outstanding = credits - debits
        "expression": "COALESCE(SUM(credit_paise - debit_paise), 0)",
    },
}

ENTRY_TYPES: dict[str, tuple[str, ...]] = {
    "customer": ("CREDIT_SALE", "PAYMENT", "ADJUSTMENT", "REVERSAL"),
    "supplier": ("PURCHASE", "PAYMENT", "ADJUSTMENT", "REVERSAL"),
}

LEDGER_COLUMNS = """
    id, {column} AS account_id, entry_type, reference_type, reference_id,
    debit_paise, credit_paise, balance_after_paise, description,
    idempotency_key, created_at, created_by
"""


def _account(account: str) -> dict[str, str]:
    try:
        return ACCOUNTS[account]
    except KeyError:  # pragma: no cover - programming error
        raise ApiError(500, f"Unknown ledger account: {account}") from None


def outstanding_paise(conn: sqlite3.Connection, account: str, account_id: str) -> int:
    """Current balance of an account, derived from its ledger rows only."""
    spec = _account(account)
    row = conn.execute(
        f"SELECT {spec['expression']} FROM {spec['table']} WHERE {spec['column']} = ?",
        (account_id,),
    ).fetchone()
    return int(row[0])


def balance_after(
    conn: sqlite3.Connection, account: str, account_id: str, delta: int
) -> int:
    """Balance that results from applying `delta` to the current balance.

    `delta` is signed from the ACCOUNT's point of view: positive = customer
    owes more / we owe the supplier more.
    """
    after = outstanding_paise(conn, account, account_id) + delta
    if after < 0:
        raise ApiError(
            400,
            "Amount exceeds the outstanding balance",
            code="PAYMENT_EXCEEDS_OUTSTANDING",
        )
    return after


def append_entry(
    conn: sqlite3.Connection,
    account: str,
    *,
    account_id: str,
    entry_type: str,
    debit_paise: int = 0,
    credit_paise: int = 0,
    reference_type: str | None = None,
    reference_id: str | None = None,
    description: str = "",
    idempotency_key: str | None = None,
    created_by: str | None = None,
) -> dict[str, Any]:
    """Insert one ledger row and stamp the running balance.

    Must be called inside the caller's transaction; never commits.
    """
    spec = _account(account)
    if entry_type not in ENTRY_TYPES[account]:
        raise ApiError(400, f"Invalid ledger entry type: {entry_type}", code="VALIDATION_ERROR")
    debit_paise = int(debit_paise)
    credit_paise = int(credit_paise)
    if debit_paise < 0 or credit_paise < 0:
        raise ApiError(400, "Ledger amounts cannot be negative", code="VALIDATION_ERROR")
    if debit_paise == 0 and credit_paise == 0:
        raise ApiError(
            400, "Ledger entry must move the balance", code="INVALID_LEDGER_ENTRY"
        )

    # Signed movement from the account's point of view.
    delta = debit_paise - credit_paise if account == "customer" else credit_paise - debit_paise
    after = balance_after(conn, account, account_id, delta)

    entry_id = new_id()
    now = utcnow_iso()
    conn.execute(
        f"""
        INSERT INTO {spec['table']}(id, {spec['column']}, entry_type, reference_type,
                                    reference_id, debit_paise, credit_paise,
                                    balance_after_paise, description, idempotency_key,
                                    created_at, created_by)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
        """,
        (
            entry_id,
            account_id,
            entry_type,
            reference_type,
            reference_id,
            debit_paise,
            credit_paise,
            after,
            description or "",
            idempotency_key,
            now,
            created_by,
        ),
    )
    return {
        "id": entry_id,
        "account_id": account_id,
        "entry_type": entry_type,
        "reference_type": reference_type,
        "reference_id": reference_id,
        "debit_paise": debit_paise,
        "credit_paise": credit_paise,
        "balance_after_paise": after,
        "description": description or "",
        "idempotency_key": idempotency_key,
        "created_at": now,
        "created_by": created_by,
    }


def find_by_idempotency_key(
    conn: sqlite3.Connection, account: str, key: str
) -> dict[str, Any] | None:
    spec = _account(account)
    row = conn.execute(
        f"SELECT {LEDGER_COLUMNS.format(column=spec['column'])} "
        f"FROM {spec['table']} WHERE idempotency_key = ?",
        (key,),
    ).fetchone()
    return _row_to_dict(row) if row is not None else None


def _row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {k: row[k] for k in row.keys()}


def _date_bound(value: str | None, field: str) -> str | None:
    """Validate a YYYY-MM-DD bound (compared against the UTC `created_at`)."""
    if value is None or str(value).strip() == "":
        return None
    from datetime import datetime

    text = str(value).strip()
    try:
        datetime.strptime(text, "%Y-%m-%d")
    except ValueError:
        raise ApiError(
            400, f"Invalid {field} (expected YYYY-MM-DD)", code="VALIDATION_ERROR"
        ) from None
    if len(text) != 10:
        raise ApiError(
            400, f"Invalid {field} (expected YYYY-MM-DD)", code="VALIDATION_ERROR"
        )
    return text


def list_entries(
    conn: sqlite3.Connection,
    account: str,
    account_id: str,
    *,
    page: int = 1,
    page_size: int = 50,
    date_from: str | None = None,
    date_to: str | None = None,
    entry_type: str | None = None,
) -> dict[str, Any]:
    """Paginated ledger, newest first, with the stored running balance."""
    spec = _account(account)
    page = max(1, page)
    page_size = max(1, min(page_size, 500))

    where = [f"{spec['column']} = ?"]
    params: list[Any] = [account_id]
    day_from = _date_bound(date_from, "date_from")
    if day_from:
        where.append("substr(created_at, 1, 10) >= ?")
        params.append(day_from)
    day_to = _date_bound(date_to, "date_to")
    if day_to:
        where.append("substr(created_at, 1, 10) <= ?")
        params.append(day_to)
    if entry_type:
        if entry_type not in ENTRY_TYPES[account]:
            raise ApiError(
                400, f"Invalid entry_type: {entry_type}", code="VALIDATION_ERROR"
            )
        where.append("entry_type = ?")
        params.append(entry_type)
    clause = " WHERE " + " AND ".join(where)

    total = int(
        conn.execute(
            f"SELECT COUNT(*) FROM {spec['table']}{clause}", params
        ).fetchone()[0]
    )
    rows = conn.execute(
        f"""
        SELECT {LEDGER_COLUMNS.format(column=spec['column'])}
        FROM {spec['table']}
        {clause}
        ORDER BY created_at DESC, rowid DESC
        LIMIT ? OFFSET ?
        """,
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    return {
        "items": [_row_to_dict(r) for r in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, -(-total // page_size)),
        "outstanding_paise": outstanding_paise(conn, account, account_id),
    }
