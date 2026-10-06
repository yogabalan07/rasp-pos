"""Supplier directory + payable ledger service — Phase 4.

Purchases, purchase orders and GRN are LATER phases; this module ships only
the supplier profile, its append-only payable ledger and the reads (plus a
payment primitive used to settle the payable). Invariants mirror the customer
side:

  * money is INTEGER paise;
  * payable balance exists ONLY as `SUM(credit) - SUM(debit)` over
    `supplier_ledger_entries` (payable is credit-nature: a purchase CREDITs,
    a payment DEBITs);
  * rows are append-only — never updated or deleted;
  * suppliers are never hard-deleted; the API deactivates them instead.
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
from .ledger_service import append_entry, find_by_idempotency_key, list_entries, outstanding_paise
from .outbox_service import enqueue
from .sequence_service import next_code

SUPPLIER_COLUMNS = """
    s.id, s.code, s.name, s.contact_person, s.phone, s.email, s.address,
    s.gstin, s.payment_terms, s.credit_limit_paise, s.is_active, s.notes,
    s.created_at, s.updated_at, s.created_by, s.updated_by
"""

_AGG_JOIN = """
    LEFT JOIN (
        SELECT supplier_id,
               SUM(debit_paise) AS debit_total,
               SUM(credit_paise) AS credit_total,
               SUM(CASE WHEN entry_type = 'PURCHASE'
                        THEN credit_paise ELSE 0 END) AS purchases_total,
               SUM(CASE WHEN entry_type = 'PAYMENT'
                        THEN debit_paise ELSE 0 END) AS payments_total
        FROM supplier_ledger_entries
        GROUP BY supplier_id
    ) agg ON agg.supplier_id = s.id
"""

_SELECT = f"""
    SELECT {SUPPLIER_COLUMNS},
           COALESCE(agg.credit_total, 0) - COALESCE(agg.debit_total, 0)
               AS outstanding_paise,
           COALESCE(agg.purchases_total, 0) AS total_purchases_paise,
           COALESCE(agg.payments_total, 0) AS total_payments_paise
    FROM suppliers s
    {_AGG_JOIN}
"""


def _rupees(paise: int) -> float:
    return paise / 100.0


def validate_supplier_payload(
    data: dict[str, Any], *, partial: bool = False
) -> dict[str, Any]:
    out: dict[str, Any] = {}

    if not partial or "name" in data:
        name = str(data.get("name") or "").strip()
        if not name:
            raise ApiError(400, "Supplier name is required", code="INVALID_NAME")
        if len(name) > 200:
            raise ApiError(400, "Supplier name is too long", code="INVALID_NAME")
        out["name"] = name

    if "contact_person" in data:
        out["contact_person"] = str(data.get("contact_person") or "").strip()

    if "phone" in data:
        phone = str(data.get("phone") or "").strip()
        if phone:
            digits = sum(ch.isdigit() for ch in phone)
            if digits < 7 or digits > 15:
                raise ApiError(
                    400, "Phone number must contain 7-15 digits", code="INVALID_PHONE"
                )
        if not partial and not phone:
            raise ApiError(400, "Phone number is required", code="INVALID_PHONE")
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
    if "payment_terms" in data:
        terms = str(data.get("payment_terms") or "").strip()
        out["payment_terms"] = terms or "Net 30 Days"
    if "notes" in data:
        out["notes"] = str(data.get("notes") or "").strip()

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
    return ApiError(
        409, "A supplier with this code already exists", code="DUPLICATE_SUPPLIER_CODE"
    )


def _snapshot(data: dict[str, Any]) -> dict[str, Any]:
    keys = (
        "code", "name", "contact_person", "phone", "email", "address", "gstin",
        "payment_terms", "credit_limit_paise", "is_active", "notes",
    )
    return {k: data[k] for k in keys if k in data}


def _decorate(item: dict[str, Any]) -> dict[str, Any]:
    item["outstanding_paise"] = int(item.get("outstanding_paise") or 0)
    item["credit_limit_paise"] = int(item.get("credit_limit_paise") or 0)
    item["is_active"] = bool(item.get("is_active"))
    return item


def get_supplier(conn: sqlite3.Connection, supplier_id: str) -> dict[str, Any]:
    row = conn.execute(f"{_SELECT} WHERE s.id = ?", (supplier_id,)).fetchone()
    if row is None:
        raise ApiError(404, "Supplier not found", code="SUPPLIER_NOT_FOUND")
    item = _decorate({k: row[k] for k in row.keys()})
    stats = conn.execute(
        "SELECT COUNT(*) AS n FROM supplier_ledger_entries WHERE supplier_id = ?",
        (supplier_id,),
    ).fetchone()
    item["ledger_entry_count"] = int(stats["n"])
    item["recent_ledger"] = list_supplier_ledger(
        conn, supplier_id, page=1, page_size=10
    )["items"]
    return item


def _build_where(*, q: str | None, active: bool | None) -> tuple[str, list[Any]]:
    where: list[str] = []
    params: list[Any] = []
    if active is not None:
        where.append("s.is_active = ?")
        params.append(1 if active else 0)
    if q:
        like = f"%{q.strip()}%"
        where.append(
            "(s.name LIKE ? OR s.contact_person LIKE ? OR s.phone LIKE ?"
            " OR s.code LIKE ? OR s.gstin LIKE ?)"
        )
        params += [like, like, like, like, like]
    clause = (" WHERE " + " AND ".join(where)) if where else ""
    return clause, params


def list_suppliers(
    conn: sqlite3.Connection,
    *,
    q: str | None = None,
    page: int = 1,
    page_size: int = 50,
    active: bool | None = None,
) -> dict[str, Any]:
    page = max(1, page)
    page_size = max(1, min(page_size, 500))
    clause, params = _build_where(q=q, active=active)

    total = int(
        conn.execute(
            f"SELECT COUNT(*) FROM suppliers s {_AGG_JOIN}{clause}", params
        ).fetchone()[0]
    )
    rows = conn.execute(
        f"{_SELECT}{clause} ORDER BY s.name COLLATE NOCASE LIMIT ? OFFSET ?",
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


def create_supplier(
    conn: sqlite3.Connection,
    data: dict[str, Any],
    *,
    actor_id: str,
    device_id: str | None = None,
) -> dict[str, Any]:
    payload = validate_supplier_payload(data, partial=False)
    payload.setdefault("contact_person", "")
    payload.setdefault("email", "")
    payload.setdefault("address", "")
    payload.setdefault("gstin", "")
    payload.setdefault("payment_terms", "Net 30 Days")
    payload.setdefault("credit_limit_paise", 0)
    payload.setdefault("notes", "")
    payload.setdefault("is_active", 1)

    supplier_id = new_id()
    now = utcnow_iso()

    with transaction(conn):
        code = next_code(conn, "supplier", "SUPP")
        try:
            conn.execute(
                """
                INSERT INTO suppliers(id, code, name, contact_person, phone, email,
                                      address, gstin, payment_terms, credit_limit_paise,
                                      is_active, notes, created_at, updated_at,
                                      created_by, updated_by)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    supplier_id, code, payload["name"], payload["contact_person"],
                    payload["phone"], payload["email"], payload["address"],
                    payload["gstin"], payload["payment_terms"],
                    payload["credit_limit_paise"], payload["is_active"],
                    payload["notes"], now, now, actor_id, actor_id,
                ),
            )
        except sqlite3.IntegrityError as exc:
            raise _dup_error(exc) from exc

        audit(
            conn,
            actor_user_id=actor_id,
            action="SUPPLIER_CREATE",
            entity_type="supplier",
            entity_id=supplier_id,
            after=_snapshot({**payload, "code": code}),
            device_id=device_id,
        )
        enqueue(
            conn,
            entity_type="supplier",
            entity_id=supplier_id,
            operation="CREATE",
            payload={
                "supplier_id": supplier_id,
                "code": code,
                "name": payload["name"],
                "phone": payload["phone"],
            },
        )

    return get_supplier(conn, supplier_id)


def update_supplier(
    conn: sqlite3.Connection,
    supplier_id: str,
    data: dict[str, Any],
    *,
    actor_id: str,
    device_id: str | None = None,
) -> dict[str, Any]:
    before = conn.execute(
        "SELECT * FROM suppliers WHERE id = ?", (supplier_id,)
    ).fetchone()
    if before is None:
        raise ApiError(404, "Supplier not found", code="SUPPLIER_NOT_FOUND")

    payload = validate_supplier_payload(data, partial=True)
    if not payload:
        raise ApiError(400, "No valid fields to update", code="NO_FIELDS")
    payload["updated_at"] = utcnow_iso()
    payload["updated_by"] = actor_id
    changed_keys = sorted(k for k in payload if k not in ("updated_at", "updated_by"))

    with transaction(conn):
        sets = ", ".join(f"{k} = ?" for k in payload)
        try:
            conn.execute(
                f"UPDATE suppliers SET {sets} WHERE id = ?",
                [*payload.values(), supplier_id],
            )
        except sqlite3.IntegrityError as exc:
            raise _dup_error(exc) from exc

        audit(
            conn,
            actor_user_id=actor_id,
            action="SUPPLIER_UPDATE",
            entity_type="supplier",
            entity_id=supplier_id,
            before=_snapshot({k: before[k] for k in before.keys()}),
            after=_snapshot(payload),
            device_id=device_id,
        )
        enqueue(
            conn,
            entity_type="supplier",
            entity_id=supplier_id,
            operation="UPDATE",
            payload={"supplier_id": supplier_id, "changed": changed_keys},
        )

    return get_supplier(conn, supplier_id)


def require_active_supplier(
    conn: sqlite3.Connection, supplier_id: str
) -> sqlite3.Row:
    """Load a supplier for a NEW financial transaction.

    Existence -> `SUPPLIER_NOT_FOUND`, inactive -> `SUPPLIER_INACTIVE`.
    The purchases API (later phase) calls this before posting a PURCHASE
    entry; the Phase 4 supplier payment endpoint uses it too.
    """
    row = conn.execute(
        "SELECT id, code, name, phone, is_active, credit_limit_paise"
        " FROM suppliers WHERE id = ?",
        (supplier_id,),
    ).fetchone()
    if row is None:
        raise ApiError(404, "Supplier not found", code="SUPPLIER_NOT_FOUND")
    if not row["is_active"]:
        raise ApiError(
            400,
            f"Supplier {row['name']} is inactive",
            code="SUPPLIER_INACTIVE",
        )
    return row


def pay_supplier(
    conn: sqlite3.Connection,
    supplier_id: str,
    data: dict[str, Any],
    *,
    actor_id: str,
    device_id: str | None = None,
) -> dict[str, Any]:
    """Record a payment made to a supplier (DEBIT entry on the payable book).

    Phase 4 primitive: it keeps the payable ledger usable before the purchases
    phase lands, and it is the real code path for `SUPPLIER_INACTIVE`.

    Until purchases/post `PURCHASE` entries, a supplier's payable is always
    ₹0.00, so every attempt answers `400 PAYMENT_EXCEEDS_OUTSTANDING`
    ("Payment ₹x exceeds payable ₹0.00") and writes nothing. No payable is
    ever invented - the purchases phase posts the real credit entries.
    """
    require_active_supplier(conn, supplier_id)

    # `amount_paise` is authoritative; `amount` is the rupee alias (normally
    # already normalised by the request model). `.get(key, default)` would not
    # fall back here: a present-but-None `amount_paise` must still reach it.
    raw = data.get("amount_paise")
    if raw is None:
        raw = data.get("amount")
    if raw is None:
        raise ApiError(400, "Payment amount is required", code="INVALID_PAYMENT_AMOUNT")
    try:
        amount = int(raw) if isinstance(raw, int) and not isinstance(raw, bool) else to_paise(raw)
    except (ValueError, TypeError):
        raise ApiError(400, "Invalid payment amount", code="INVALID_PAYMENT_AMOUNT") from None
    if amount <= 0:
        raise ApiError(
            400, "Payment amount must be greater than zero", code="INVALID_PAYMENT_AMOUNT"
        )

    reference = str(data.get("reference") or "").strip()
    notes = str(data.get("notes") or "").strip()
    description = f"{reference}: {notes}" if reference and notes else (notes or reference or "Supplier payment")
    key = data.get("idempotency_key")
    key = str(key).strip() if key else None

    def _replay(existing: dict[str, Any]) -> dict[str, Any]:
        # The key is globally UNIQUE: it must belong to this supplier too.
        if str(existing["account_id"]) != str(supplier_id):
            raise ApiError(
                409,
                "This idempotency key was already used for a different supplier",
                code="DUPLICATE_IDEMPOTENCY_KEY",
            )
        if int(existing["debit_paise"]) != amount:
            raise ApiError(
                409,
                "This idempotency key was already used with a different payment",
                code="DUPLICATE_IDEMPOTENCY_KEY",
            )
        return {
            "id": existing["id"],
            "supplier_id": supplier_id,
            "amount_paise": amount,
            "reference": reference,
            "notes": notes,
            "ledger_entry_id": existing["id"],
            "created_at": existing["created_at"],
            "created_by": existing["created_by"],
            "outstanding_paise": outstanding_paise(conn, "supplier", supplier_id),
            "idempotent": True,
        }

    with transaction(conn):
        # Re-checked under the write lock so a racing replay cannot double-post.
        if key:
            existing = find_by_idempotency_key(conn, "supplier", key)
            if existing is not None:
                return _replay(existing)

        payable = outstanding_paise(conn, "supplier", supplier_id)
        if amount > payable:
            raise ApiError(
                400,
                (
                    f"Payment ₹{_rupees(amount):,.2f} exceeds payable "
                    f"₹{_rupees(payable):,.2f}"
                ),
                code="PAYMENT_EXCEEDS_OUTSTANDING",
            )
        entry = append_entry(
            conn,
            "supplier",
            account_id=supplier_id,
            entry_type="PAYMENT",
            debit_paise=amount,
            reference_type="SUPPLIER_PAYMENT",
            reference_id=new_id(),
            description=description,
            idempotency_key=key,
            created_by=actor_id,
        )
        balance_after = payable - amount
        payment_id = entry["id"]
        audit(
            conn,
            actor_user_id=actor_id,
            action="SUPPLIER_PAYMENT",
            entity_type="supplier",
            entity_id=supplier_id,
            after={
                "payment_id": payment_id,
                "amount_paise": amount,
                "balance_after_paise": balance_after,
            },
            device_id=device_id,
        )
        enqueue(
            conn,
            entity_type="supplier_payment",
            entity_id=payment_id,
            operation="CREATE",
            payload={
                "payment_id": payment_id,
                "supplier_id": supplier_id,
                "amount_paise": amount,
                "outstanding_paise": balance_after,
            },
        )

    return {
        "id": payment_id,
        "supplier_id": supplier_id,
        "amount_paise": amount,
        "reference": reference,
        "notes": notes,
        "ledger_entry_id": entry["id"],
        "created_at": entry["created_at"],
        "created_by": actor_id,
        "outstanding_paise": balance_after,
        "idempotent": False,
    }


def list_supplier_ledger(
    conn: sqlite3.Connection,
    supplier_id: str,
    *,
    page: int = 1,
    page_size: int = 50,
    date_from: str | None = None,
    date_to: str | None = None,
    entry_type: str | None = None,
) -> dict[str, Any]:
    if conn.execute("SELECT 1 FROM suppliers WHERE id = ?", (supplier_id,)).fetchone() is None:
        raise ApiError(404, "Supplier not found", code="SUPPLIER_NOT_FOUND")
    return list_entries(
        conn,
        "supplier",
        supplier_id,
        page=page,
        page_size=page_size,
        date_from=date_from,
        date_to=date_to,
        entry_type=entry_type,
    )
