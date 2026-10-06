"""Customer directory + khata (credit) ledger service — Phase 4.

Invariants (documented in PHASE4.md):
  * all money is INTEGER paise end-to-end (`utils.money` for conversions);
  * the outstanding balance exists ONLY as `SUM(debit) - SUM(credit)` over
    `customer_ledger_entries` — there is no cached balance column;
  * ledger rows are append-only: this module never UPDATEs or DELETEs them;
  * credit sales post a DEBIT entry, khata payments post a CREDIT entry, both
    inside the caller's transaction (sale + ledger + outbox + audit commit or
    roll back together);
  * customers with financial history are never hard-deleted — the API has no
    DELETE route at all; the UI deactivates them (`PATCH is_active=false`),
    which blocks new credit sales but keeps dues collectable.
"""

from __future__ import annotations

import math
import sqlite3
from typing import Any

from ..database import transaction
from ..errors import ApiError
from ..utils.ids import new_id
from ..utils.money import to_paise
from .audit_service import record as audit
from .auth_service import utcnow_iso
from .ledger_service import append_entry, list_entries, outstanding_paise
from .outbox_service import enqueue
from .sequence_service import next_code

CUSTOMER_COLUMNS = """
    c.id, c.code, c.name, c.phone, c.email, c.address, c.gstin,
    c.credit_limit_paise, c.is_active, c.notes,
    c.created_at, c.updated_at, c.created_by, c.updated_by
"""

# One aggregate join powers list + detail, so a customer's balance and totals
# always come from the same query (no stale second read).
_AGG_JOIN = """
    LEFT JOIN (
        SELECT customer_id,
               SUM(debit_paise) AS debit_total,
               SUM(credit_paise) AS credit_total,
               SUM(CASE WHEN entry_type = 'CREDIT_SALE'
                        THEN debit_paise ELSE 0 END) AS credit_sales_total,
               SUM(CASE WHEN entry_type = 'PAYMENT'
                        THEN credit_paise ELSE 0 END) AS payments_total
        FROM customer_ledger_entries
        GROUP BY customer_id
    ) agg ON agg.customer_id = c.id
    LEFT JOIN (
        SELECT customer_id,
               COUNT(*) AS sale_count,
               SUM(total_paise) AS billed_total,
               MAX(created_at) AS last_sale_at
        FROM sales
        WHERE customer_id IS NOT NULL AND status = 'COMPLETED'
        GROUP BY customer_id
    ) sl ON sl.customer_id = c.id
"""

_SELECT = f"""
    SELECT {CUSTOMER_COLUMNS},
           COALESCE(agg.debit_total, 0) - COALESCE(agg.credit_total, 0)
               AS outstanding_paise,
           COALESCE(agg.credit_sales_total, 0) AS total_credit_sales_paise,
           COALESCE(agg.payments_total, 0) AS total_payments_paise,
           COALESCE(sl.sale_count, 0) AS sale_count,
           COALESCE(sl.billed_total, 0) AS total_billed_paise,
           sl.last_sale_at AS last_sale_at
    FROM customers c
    {_AGG_JOIN}
"""


def _rupees(paise: int) -> float:
    return paise / 100.0


def validate_customer_payload(
    data: dict[str, Any], *, partial: bool = False
) -> dict[str, Any]:
    out: dict[str, Any] = {}

    if not partial or "name" in data:
        name = str(data.get("name") or "").strip()
        if not name:
            raise ApiError(400, "Customer name is required", code="INVALID_NAME")
        if len(name) > 200:
            raise ApiError(400, "Customer name is too long", code="INVALID_NAME")
        out["name"] = name

    if not partial or "phone" in data:
        phone = str(data.get("phone") or "").strip()
        if not phone:
            raise ApiError(400, "Phone number is required", code="INVALID_PHONE")
        digits = sum(ch.isdigit() for ch in phone)
        if digits < 7 or digits > 15:
            raise ApiError(
                400, "Phone number must contain 7-15 digits", code="INVALID_PHONE"
            )
        out["phone"] = phone

    if "email" in data:
        email = str(data.get("email") or "").strip()
        if email and "@" not in email:
            raise ApiError(400, "Email looks invalid", code="INVALID_EMAIL")
        out["email"] = email

    if "address" in data:
        out["address"] = str(data.get("address") or "").strip()
    if "gstin" in data:
        out["gstin"] = str(data.get("gstin") or "").strip().upper()
        if out["gstin"] and len(out["gstin"]) > 20:
            raise ApiError(400, "GSTIN is too long", code="INVALID_GSTIN")
    if "notes" in data:
        out["notes"] = str(data.get("notes") or "").strip()

    # Accept INTEGER paise (preferred) or a rupee amount, like the product API.
    if "credit_limit_paise" in data or "credit_limit" in data:
        raw = data.get("credit_limit_paise", data.get("credit_limit"))
        if raw is not None:
            try:
                paise = int(raw) if isinstance(raw, int) and not isinstance(raw, bool) else to_paise(raw)
            except (ValueError, TypeError):
                raise ApiError(
                    400, "Invalid credit limit", code="INVALID_CREDIT_LIMIT"
                ) from None
            if paise < 0:
                raise ApiError(
                    400, "Credit limit cannot be negative", code="INVALID_CREDIT_LIMIT"
                )
            out["credit_limit_paise"] = paise

    if "is_active" in data and data["is_active"] is not None:
        out["is_active"] = 1 if data["is_active"] else 0

    return out


def _dup_error(exc: sqlite3.IntegrityError) -> ApiError:
    message = str(exc).lower()
    if "customers.code" in message or "code" in message:
        return ApiError(
            409, "A customer with this code already exists", code="DUPLICATE_CUSTOMER_CODE"
        )
    return ApiError(409, "Customer already exists", code="DUPLICATE_CUSTOMER_CODE")


def _snapshot(data: dict[str, Any]) -> dict[str, Any]:
    keys = (
        "code", "name", "phone", "email", "address", "gstin",
        "credit_limit_paise", "is_active", "notes",
    )
    return {k: data[k] for k in keys if k in data}


def _decorate(item: dict[str, Any]) -> dict[str, Any]:
    outstanding = int(item.get("outstanding_paise") or 0)
    limit = int(item.get("credit_limit_paise") or 0)
    item["outstanding_paise"] = outstanding
    item["credit_limit_paise"] = limit
    item["available_credit_paise"] = max(0, limit - outstanding)
    item["sale_count"] = int(item.get("sale_count") or 0)
    item["total_billed_paise"] = int(item.get("total_billed_paise") or 0)
    item["is_active"] = bool(item.get("is_active"))
    return item


def get_customer(conn: sqlite3.Connection, customer_id: str) -> dict[str, Any]:
    row = conn.execute(f"{_SELECT} WHERE c.id = ?", (customer_id,)).fetchone()
    if row is None:
        raise ApiError(404, "Customer not found", code="CUSTOMER_NOT_FOUND")
    item = _decorate({k: row[k] for k in row.keys()})
    item["recent_sales"] = list_customer_sales(
        conn, customer_id, page=1, page_size=10
    )["items"]
    item["recent_ledger"] = list_customer_ledger(
        conn, customer_id, page=1, page_size=10
    )["items"]
    return item


def _build_where(
    *,
    q: str | None,
    active: bool | None,
    has_dues: bool,
) -> tuple[str, list[Any]]:
    where: list[str] = []
    params: list[Any] = []
    if active is not None:
        where.append("c.is_active = ?")
        params.append(1 if active else 0)
    if q:
        like = f"%{q.strip()}%"
        where.append(
            "(c.name LIKE ? OR c.phone LIKE ? OR c.code LIKE ? OR c.gstin LIKE ?"
            " OR c.email LIKE ?)"
        )
        params += [like, like, like, like, like]
    if has_dues:
        where.append(
            "(COALESCE(agg.debit_total, 0) - COALESCE(agg.credit_total, 0)) > 0"
        )
    clause = (" WHERE " + " AND ".join(where)) if where else ""
    return clause, params


def list_customers(
    conn: sqlite3.Connection,
    *,
    q: str | None = None,
    page: int = 1,
    page_size: int = 50,
    active: bool | None = None,
    has_dues: bool = False,
) -> dict[str, Any]:
    page = max(1, page)
    page_size = max(1, min(page_size, 500))
    clause, params = _build_where(q=q, active=active, has_dues=has_dues)

    total = int(
        conn.execute(
            f"SELECT COUNT(*) FROM customers c {_AGG_JOIN}{clause}", params
        ).fetchone()[0]
    )
    rows = conn.execute(
        f"{_SELECT}{clause} ORDER BY c.name COLLATE NOCASE LIMIT ? OFFSET ?",
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    items = [_decorate({k: r[k] for k in r.keys()}) for r in rows]
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, math.ceil(total / page_size)) if total else 1,
    }


def customers_summary(conn: sqlite3.Connection) -> dict[str, int]:
    """Book-wide receivable totals, computed by SQL over every ledger row.

    Never derived from a page of results: the UI total stays correct no
    matter how many debtors exist (page_size caps only limit rows shown).
    A customer with a zero balance is settled, so it counts towards neither
    `debtor_count` nor `total_receivables_paise`.
    """
    row = conn.execute(
        """
        SELECT COALESCE(SUM(balance_paise), 0) AS total_receivables_paise,
               COALESCE(SUM(CASE WHEN balance_paise > 0 THEN 1 ELSE 0 END), 0)
                   AS debtor_count
        FROM (
            SELECT customer_id,
                   SUM(debit_paise) - SUM(credit_paise) AS balance_paise
            FROM customer_ledger_entries
            GROUP BY customer_id
        )
        """
    ).fetchone()
    return {
        "total_receivables_paise": int(row["total_receivables_paise"]),
        "debtor_count": int(row["debtor_count"]),
    }


def create_customer(
    conn: sqlite3.Connection,
    data: dict[str, Any],
    *,
    actor_id: str,
    device_id: str | None = None,
) -> dict[str, Any]:
    payload = validate_customer_payload(data, partial=False)
    payload.setdefault("email", "")
    payload.setdefault("address", "")
    payload.setdefault("gstin", "")
    payload.setdefault("credit_limit_paise", 0)
    payload.setdefault("notes", "")
    payload.setdefault("is_active", 1)

    customer_id = new_id()
    now = utcnow_iso()

    with transaction(conn):
        code = next_code(conn, "customer", "CUST")
        try:
            conn.execute(
                """
                INSERT INTO customers(id, code, name, phone, email, address, gstin,
                                      credit_limit_paise, is_active, notes,
                                      created_at, updated_at, created_by, updated_by)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    customer_id, code, payload["name"], payload["phone"],
                    payload["email"], payload["address"], payload["gstin"],
                    payload["credit_limit_paise"], payload["is_active"],
                    payload["notes"], now, now, actor_id, actor_id,
                ),
            )
        except sqlite3.IntegrityError as exc:
            raise _dup_error(exc) from exc

        after = _snapshot({**payload, "code": code})
        audit(
            conn,
            actor_user_id=actor_id,
            action="CUSTOMER_CREATE",
            entity_type="customer",
            entity_id=customer_id,
            after=after,
            device_id=device_id,
        )
        enqueue(
            conn,
            entity_type="customer",
            entity_id=customer_id,
            operation="CREATE",
            payload={
                "customer_id": customer_id,
                "code": code,
                "name": payload["name"],
                "phone": payload["phone"],
                "credit_limit_paise": payload["credit_limit_paise"],
            },
        )

    return get_customer(conn, customer_id)


def update_customer(
    conn: sqlite3.Connection,
    customer_id: str,
    data: dict[str, Any],
    *,
    actor_id: str,
    device_id: str | None = None,
) -> dict[str, Any]:
    before = conn.execute(
        "SELECT * FROM customers WHERE id = ?", (customer_id,)
    ).fetchone()
    if before is None:
        raise ApiError(404, "Customer not found", code="CUSTOMER_NOT_FOUND")

    payload = validate_customer_payload(data, partial=True)
    if not payload:
        raise ApiError(400, "No valid fields to update", code="NO_FIELDS")
    payload["updated_at"] = utcnow_iso()
    payload["updated_by"] = actor_id
    changed_keys = sorted(k for k in payload if k not in ("updated_at", "updated_by"))

    with transaction(conn):
        sets = ", ".join(f"{k} = ?" for k in payload)
        try:
            conn.execute(
                f"UPDATE customers SET {sets} WHERE id = ?",
                [*payload.values(), customer_id],
            )
        except sqlite3.IntegrityError as exc:
            raise _dup_error(exc) from exc

        audit(
            conn,
            actor_user_id=actor_id,
            action="CUSTOMER_UPDATE",
            entity_type="customer",
            entity_id=customer_id,
            before=_snapshot({k: before[k] for k in before.keys()}),
            after=_snapshot(payload),
            device_id=device_id,
        )
        enqueue(
            conn,
            entity_type="customer",
            entity_id=customer_id,
            operation="UPDATE",
            payload={"customer_id": customer_id, "changed": changed_keys},
        )

    return get_customer(conn, customer_id)


# ------------------------------------------------------------ credit sale

def validate_credit_sale(
    conn: sqlite3.Connection, customer_id: str, *, total_paise: int
) -> dict[str, Any]:
    """Server-authoritative gate for a CREDIT (khata) sale.

    Raises `CUSTOMER_NOT_FOUND` / `CUSTOMER_INACTIVE` /
    `CUSTOMER_CREDIT_LIMIT_EXCEEDED` — a credit limit of 0 means credit is
    disabled for that customer (any positive total exceeds it).
    """
    row = conn.execute(
        "SELECT id, code, name, phone, is_active, credit_limit_paise"
        " FROM customers WHERE id = ?",
        (customer_id,),
    ).fetchone()
    if row is None:
        raise ApiError(404, "Customer not found", code="CUSTOMER_NOT_FOUND")
    if not row["is_active"]:
        raise ApiError(
            400,
            f"Customer {row['name']} is inactive and cannot take credit sales",
            code="CUSTOMER_INACTIVE",
        )

    outstanding = outstanding_paise(conn, "customer", customer_id)
    limit = int(row["credit_limit_paise"])
    if outstanding + int(total_paise) > limit:
        raise ApiError(
            409,
            (
                f"Credit limit exceeded for {row['name']}: "
                f"limit ₹{_rupees(limit):,.2f}, outstanding ₹{_rupees(outstanding):,.2f}, "
                f"sale ₹{_rupees(total_paise):,.2f}"
            ),
            code="CUSTOMER_CREDIT_LIMIT_EXCEEDED",
        )
    return {
        "id": row["id"],
        "code": row["code"],
        "name": row["name"],
        "phone": row["phone"],
        "credit_limit_paise": limit,
        "outstanding_paise": outstanding,
    }


def post_credit_sale(
    conn: sqlite3.Connection,
    customer_id: str,
    *,
    sale_id: str,
    bill_no: str,
    total_paise: int,
    actor_id: str,
    device_id: str | None = None,
) -> dict[str, Any]:
    """Append the DEBIT ledger entry for a completed credit sale.

    Called inside the sale's transaction: if the sale rolls back, so does the
    entry (and vice versa).
    """
    entry = append_entry(
        conn,
        "customer",
        account_id=customer_id,
        entry_type="CREDIT_SALE",
        debit_paise=int(total_paise),
        reference_type="SALE",
        reference_id=sale_id,
        description=f"Credit sale {bill_no}",
        created_by=actor_id,
    )
    audit(
        conn,
        actor_user_id=actor_id,
        action="CUSTOMER_CREDIT_SALE",
        entity_type="customer",
        entity_id=customer_id,
        after={
            "sale_id": sale_id,
            "bill_no": bill_no,
            "debit_paise": int(total_paise),
            "balance_after_paise": entry["balance_after_paise"],
        },
        device_id=device_id,
    )
    enqueue(
        conn,
        entity_type="customer",
        entity_id=customer_id,
        operation="UPDATE",
        payload={
            "event": "CUSTOMER_CREDIT_SALE",
            "customer_id": customer_id,
            "sale_id": sale_id,
            "bill_no": bill_no,
            "debit_paise": int(total_paise),
            "outstanding_paise": entry["balance_after_paise"],
        },
    )
    return entry


# ---------------------------------------------------------------- payments

def _payment_payload(data: dict[str, Any]) -> dict[str, Any]:
    # `amount_paise` is authoritative; `amount` is the rupee alias (normally
    # already normalised by the request model). `.get(key, default)` would not
    # fall back here: a present-but-None `amount_paise` must still reach it.
    raw = data.get("amount_paise")
    if raw is None:
        raw = data.get("amount")
    if raw is None:
        raise ApiError(
            400, "Payment amount is required", code="INVALID_PAYMENT_AMOUNT"
        )
    try:
        amount = int(raw) if isinstance(raw, int) and not isinstance(raw, bool) else to_paise(raw)
    except (ValueError, TypeError):
        raise ApiError(
            400, "Invalid payment amount", code="INVALID_PAYMENT_AMOUNT"
        ) from None
    if amount <= 0:
        raise ApiError(
            400, "Payment amount must be greater than zero", code="INVALID_PAYMENT_AMOUNT"
        )

    method = str(data.get("payment_method") or "CASH").upper().strip()
    if method not in ("CASH", "UPI", "CARD"):
        raise ApiError(400, "Invalid payment method", code="INVALID_PAYMENT_METHOD")

    key = data.get("idempotency_key")
    key = str(key).strip() if key else None
    if key and len(key) > 64:
        raise ApiError(
            400, "idempotency_key is too long", code="VALIDATION_ERROR"
        )
    return {
        "amount_paise": amount,
        "payment_method": method,
        "reference": str(data.get("reference") or "").strip(),
        "notes": str(data.get("notes") or "").strip(),
        "idempotency_key": key,
    }


def _payment_response(
    payment: dict[str, Any], outstanding: int, *, idempotent: bool
) -> dict[str, Any]:
    return {
        **payment,
        "outstanding_paise": outstanding,
        "balance_after_paise": outstanding,
        "idempotent": idempotent,
    }


def collect_payment(
    conn: sqlite3.Connection,
    customer_id: str,
    data: dict[str, Any],
    *,
    actor_id: str,
    device_id: str | None = None,
) -> dict[str, Any]:
    """Record a khata payment (CREDIT ledger entry) against a customer.

    Idempotency: replaying the same `idempotency_key` with the same payload
    on the SAME customer returns the original payment (`idempotent: true`) and
    posts nothing; the same key with a different payload - or against a
    different customer - is a client bug -> `409 DUPLICATE_IDEMPOTENCY_KEY`.
    Inactive customers can still pay down existing dues.
    """
    payload = _payment_payload(data)

    customer = conn.execute(
        "SELECT id, name FROM customers WHERE id = ?", (customer_id,)
    ).fetchone()
    if customer is None:
        raise ApiError(404, "Customer not found", code="CUSTOMER_NOT_FOUND")

    def _replay(existing: sqlite3.Row) -> dict[str, Any]:
        # The key is globally UNIQUE, so it must belong to this customer too:
        # otherwise a replay against another party would hand back their
        # payment and silently record nothing for this one.
        if str(existing["customer_id"]) != str(customer_id):
            raise ApiError(
                409,
                "This idempotency key was already used for a different customer",
                code="DUPLICATE_IDEMPOTENCY_KEY",
            )
        if (
            int(existing["amount_paise"]) != payload["amount_paise"]
            or existing["payment_method"] != payload["payment_method"]
            or (existing["reference"] or "") != payload["reference"]
        ):
            raise ApiError(
                409,
                "This idempotency key was already used with a different payment",
                code="DUPLICATE_IDEMPOTENCY_KEY",
            )
        outstanding = outstanding_paise(conn, "customer", customer_id)
        return _payment_response(
            {k: existing[k] for k in existing.keys()}, outstanding, idempotent=True
        )

    now = utcnow_iso()
    with transaction(conn):
        # Idempotency is re-checked INSIDE `BEGIN IMMEDIATE`: a replay that
        # races the original waits for the lock, then sees the committed row
        # and returns it instead of double-posting.
        if payload["idempotency_key"]:
            existing = conn.execute(
                "SELECT * FROM customer_payments WHERE idempotency_key = ?",
                (payload["idempotency_key"],),
            ).fetchone()
            if existing is not None:
                return _replay(existing)

        # Re-read the balance INSIDE the write transaction: two terminals
        # collecting at once must not both pass the over-payment check.
        outstanding = outstanding_paise(conn, "customer", customer_id)
        if payload["amount_paise"] > outstanding:
            raise ApiError(
                400,
                (
                    f"Payment ₹{_rupees(payload['amount_paise']):,.2f} exceeds "
                    f"outstanding ₹{_rupees(outstanding):,.2f}"
                ),
                code="PAYMENT_EXCEEDS_OUTSTANDING",
            )

        balance_after = outstanding - payload["amount_paise"]
        payment_id = new_id()
        entry = append_entry(
            conn,
            "customer",
            account_id=customer_id,
            entry_type="PAYMENT",
            credit_paise=payload["amount_paise"],
            reference_type="CUSTOMER_PAYMENT",
            reference_id=payment_id,
            description=payload["notes"] or "Khata payment",
            idempotency_key=payload["idempotency_key"],
            created_by=actor_id,
        )
        try:
            conn.execute(
                """
                INSERT INTO customer_payments(id, customer_id, amount_paise,
                                              payment_method, reference, notes,
                                              idempotency_key, ledger_entry_id,
                                              created_at, created_by)
                VALUES(?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    payment_id, customer_id, payload["amount_paise"],
                    payload["payment_method"], payload["reference"], payload["notes"],
                    payload["idempotency_key"], entry["id"], now, actor_id,
                ),
            )
        except sqlite3.IntegrityError as exc:
            raise ApiError(
                409,
                "This idempotency key was already used",
                code="DUPLICATE_IDEMPOTENCY_KEY",
            ) from exc

        audit(
            conn,
            actor_user_id=actor_id,
            action="CUSTOMER_PAYMENT",
            entity_type="customer",
            entity_id=customer_id,
            after={
                "payment_id": payment_id,
                "amount_paise": payload["amount_paise"],
                "payment_method": payload["payment_method"],
                "balance_after_paise": balance_after,
            },
            device_id=device_id,
        )
        enqueue(
            conn,
            entity_type="customer_payment",
            entity_id=payment_id,
            operation="CREATE",
            payload={
                "payment_id": payment_id,
                "customer_id": customer_id,
                "amount_paise": payload["amount_paise"],
                "payment_method": payload["payment_method"],
                "outstanding_paise": balance_after,
            },
        )

        payment = {
            "id": payment_id,
            "customer_id": customer_id,
            "amount_paise": payload["amount_paise"],
            "payment_method": payload["payment_method"],
            "reference": payload["reference"],
            "notes": payload["notes"],
            "idempotency_key": payload["idempotency_key"],
            "ledger_entry_id": entry["id"],
            "created_at": now,
            "created_by": actor_id,
        }
    return _payment_response(payment, balance_after, idempotent=False)


# ------------------------------------------------------- sales + ledger reads

def list_customer_sales(
    conn: sqlite3.Connection,
    customer_id: str,
    *,
    page: int = 1,
    page_size: int = 20,
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict[str, Any]:
    from .ledger_service import _date_bound  # shared YYYY-MM-DD validation

    if conn.execute("SELECT 1 FROM customers WHERE id = ?", (customer_id,)).fetchone() is None:
        raise ApiError(404, "Customer not found", code="CUSTOMER_NOT_FOUND")

    page = max(1, page)
    page_size = max(1, min(page_size, 200))
    where = ["s.customer_id = ?"]
    params: list[Any] = [customer_id]
    day_from = _date_bound(date_from, "date_from")
    if day_from:
        where.append("substr(s.created_at, 1, 10) >= ?")
        params.append(day_from)
    day_to = _date_bound(date_to, "date_to")
    if day_to:
        where.append("substr(s.created_at, 1, 10) <= ?")
        params.append(day_to)
    clause = " WHERE " + " AND ".join(where)

    total = int(
        conn.execute(f"SELECT COUNT(*) FROM sales s{clause}", params).fetchone()[0]
    )
    rows = conn.execute(
        f"""
        SELECT s.id, s.bill_no, s.created_at, s.status, s.customer_name,
               s.customer_phone, s.subtotal_paise, s.discount_paise,
               s.total_paise, s.created_by,
               (SELECT payment_method FROM payments WHERE sale_id = s.id
                ORDER BY rowid LIMIT 1) AS payment_method
        FROM sales s
        {clause}
        ORDER BY s.created_at DESC, s.id DESC
        LIMIT ? OFFSET ?
        """,
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()

    items = []
    for r in rows:
        method = r["payment_method"] or ""
        items.append(
            {
                "id": r["id"],
                "bill_no": r["bill_no"],
                "created_at": r["created_at"],
                "status": r["status"],
                "customer_name": r["customer_name"],
                "customer_phone": r["customer_phone"],
                "subtotal_paise": int(r["subtotal_paise"]),
                "discount_paise": int(r["discount_paise"]),
                "total_paise": int(r["total_paise"]),
                "payment_method": method,
                # The receivable this sale added (0 for cash/UPI/CARD bills).
                "credit_paise": int(r["total_paise"]) if method == "CREDIT" else 0,
                "created_by": r["created_by"],
            }
        )
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, math.ceil(total / page_size)) if total else 1,
    }


def list_customer_ledger(
    conn: sqlite3.Connection,
    customer_id: str,
    *,
    page: int = 1,
    page_size: int = 50,
    date_from: str | None = None,
    date_to: str | None = None,
    entry_type: str | None = None,
) -> dict[str, Any]:
    if conn.execute("SELECT 1 FROM customers WHERE id = ?", (customer_id,)).fetchone() is None:
        raise ApiError(404, "Customer not found", code="CUSTOMER_NOT_FOUND")
    return list_entries(
        conn,
        "customer",
        customer_id,
        page=page,
        page_size=page_size,
        date_from=date_from,
        date_to=date_to,
        entry_type=entry_type,
    )
