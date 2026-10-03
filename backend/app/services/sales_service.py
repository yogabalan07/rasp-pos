"""POS sale service (STEP 12–15).

One HTTP request == one atomic SQLite transaction:

    BEGIN IMMEDIATE
      idempotency lookup (device_id + client_sale_id)
      product + stock validation
      bill number allocation
      INSERT sale, sale_lines, payment
      UPDATE inventory  (+ stock_movements ledger rows)
      INSERT outbox row (same transaction)
      INSERT audit_log row
    COMMIT

Any failure rolls back everything — there are no partial sales.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime
from typing import Any

from ..errors import ApiError
from .audit_service import record as audit
from .auth_service import utcnow_iso
from .gst_service import compute_invoice_totals, split_cgst_sgst, VALID_GST_RATES
from .inventory_service import record_movement
from .outbox_service import enqueue
from ..utils.ids import new_id

PAYMENT_METHODS = ("CASH", "UPI", "CARD", "CREDIT")
MAX_QTY_PER_LINE = 10_000
MAX_LINES = 500


def _rupees(paise: int) -> float:
    """Display-only rupee float for the UI view-model (RULE 4 keeps paise canonical)."""
    return paise / 100.0


# --------------------------------------------------------------- bill no.

def next_bill_no(conn: sqlite3.Connection) -> str:
    """Gapless per-day invoice number. Must be called inside a transaction."""
    day = datetime.now().strftime("%Y%m%d")
    row = conn.execute("SELECT next_value FROM bill_counters WHERE day = ?", (day,)).fetchone()
    if row is None:
        value = 1
        conn.execute("INSERT INTO bill_counters(day, next_value) VALUES(?, ?)", (day, 2))
    else:
        value = int(row["next_value"])
        conn.execute("UPDATE bill_counters SET next_value = ? WHERE day = ?", (value + 1, day))
    return f"INV-{day}-{value:06d}"


# ---------------------------------------------------------------- parse

def _parse_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not isinstance(items, list) or not items:
        raise ApiError(400, "Cart is empty")
    if len(items) > MAX_LINES:
        raise ApiError(400, "Too many lines in cart")

    merged: dict[str, dict[str, Any]] = {}
    for raw in items:
        product_id = str(raw.get("product_id") or "").strip()
        if not product_id:
            raise ApiError(400, "Each cart line needs a product_id")
        try:
            qty = int(raw.get("quantity", 0))
        except (TypeError, ValueError):
            raise ApiError(400, "Quantity must be an integer")
        if qty <= 0:
            raise ApiError(400, "Quantity must be greater than zero")
        if qty > MAX_QTY_PER_LINE:
            raise ApiError(400, "Quantity for a line is too large")

        discount = raw.get("discount_paise", raw.get("discount", 0)) or 0
        try:
            discount = int(discount) if isinstance(discount, int) else int(round(float(discount) * 100))
        except (TypeError, ValueError):
            raise ApiError(400, "Invalid line discount")
        if discount < 0:
            raise ApiError(400, "Line discount cannot be negative")

        if product_id in merged:
            merged[product_id]["quantity"] += qty
            merged[product_id]["discount_paise"] += discount
        else:
            merged[product_id] = {"product_id": product_id, "quantity": qty, "discount_paise": discount}
    return list(merged.values())


def _parse_amount(value: Any, field: str) -> int:
    """Accept integer paise or rupee (float/int) values."""
    if value is None:
        return 0
    if isinstance(value, bool):
        raise ApiError(400, f"Invalid {field}")
    if isinstance(value, int):
        # Heuristic: clients send paise in `*_paise` fields only.
        return value
    try:
        return int(round(float(value) * 100))
    except (TypeError, ValueError):
        raise ApiError(400, f"Invalid {field}")


# ------------------------------------------------------------- receipt

def _receipt(conn: sqlite3.Connection, sale_id: str) -> dict[str, Any]:
    sale = conn.execute("SELECT * FROM sales WHERE id = ?", (sale_id,)).fetchone()
    if sale is None:
        raise ApiError(404, "Sale not found")
    lines = conn.execute(
        "SELECT * FROM sale_lines WHERE sale_id = ? ORDER BY rowid", (sale_id,)
    ).fetchall()
    payments = conn.execute(
        "SELECT * FROM payments WHERE sale_id = ? ORDER BY rowid", (sale_id,)
    ).fetchall()
    cashier = conn.execute(
        "SELECT display_name, username FROM users WHERE id = ?", (sale["created_by"],)
    ).fetchone()

    line_items = []
    for ln in lines:
        item = {k: ln[k] for k in ln.keys()}
        item["taxable_paise"] = item["line_total_paise"] - item["tax_paise"]
        line_items.append(item)

    payment = {k: payments[0][k] for k in payments[0].keys()} if payments else None
    cgst, sgst = split_cgst_sgst(int(sale["tax_paise"]))
    total = int(sale["total_paise"])
    received = int(payment["amount_paise"]) if payment else total

    return {
        "sale": {k: sale[k] for k in sale.keys()},
        "lines": line_items,
        "payment": payment,
        "cgst_paise": cgst,
        "sgst_paise": sgst,
        "igst_paise": 0,
        "round_off_paise": int(sale["round_off_paise"]),
        "additional_charges_paise": int(sale["additional_charges_paise"]),
        "change_due_paise": max(0, received - total),
        "cashier_name": cashier["display_name"] if cashier else None,
        # Rupee view-model for the existing UI (money stays paise server-side).
        "view": {
            "billNo": sale["bill_no"],
            "subtotal": _rupees(sale["subtotal_paise"]),
            "totalDiscount": _rupees(sale["discount_paise"]),
            "taxAmount": _rupees(sale["tax_paise"]),
            "additionalCharges": _rupees(sale["additional_charges_paise"]),
            "roundOff": _rupees(sale["round_off_paise"]),
            "total": _rupees(total),
            "amountPaid": _rupees(received),
            "changeDue": _rupees(max(0, received - total)),
            "paymentMethod": payment["payment_method"] if payment else None,
            "createdAt": sale["created_at"],
            "items": [
                {
                    "name": ln["product_name_snapshot"],
                    "qty": ln["quantity"],
                    "price": _rupees(ln["unit_price_paise"]),
                    "gstRate": ln["gst_rate"],
                    "tax": _rupees(ln["tax_paise"]),
                    "lineTotal": _rupees(ln["line_total_paise"]),
                }
                for ln in line_items
            ],
        },
    }


def get_sale(conn: sqlite3.Connection, reference: str) -> dict[str, Any]:
    row = conn.execute(
        "SELECT id FROM sales WHERE id = ? OR bill_no = ? OR client_sale_id = ?",
        (reference, reference, reference),
    ).fetchone()
    if row is None:
        raise ApiError(404, "Sale not found")
    return _receipt(conn, row["id"])


def list_sales(
    conn: sqlite3.Connection, *, page: int = 1, page_size: int = 50, q: str | None = None
) -> dict[str, Any]:
    page = max(1, page)
    page_size = max(1, min(page_size, 200))
    where: list[str] = []
    params: list[Any] = []
    if q:
        like = f"%{q.strip()}%"
        where.append("(bill_no LIKE ? OR customer_name LIKE ? OR id LIKE ?)")
        params += [like, like, like]
    clause = (" WHERE " + " AND ".join(where)) if where else ""
    total = conn.execute(f"SELECT COUNT(*) FROM sales{clause}", params).fetchone()[0]
    rows = conn.execute(
        f"""
        SELECT s.id, s.bill_no, s.customer_name, s.customer_phone, s.subtotal_paise,
               s.discount_paise, s.tax_paise, s.total_paise, s.status, s.created_at,
               s.created_by, u.display_name AS cashier_name
        FROM sales s LEFT JOIN users u ON u.id = s.created_by
        {clause}
        ORDER BY s.created_at DESC, s.id DESC
        LIMIT ? OFFSET ?
        """,
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    items = []
    for r in rows:
        item = {k: r[k] for k in r.keys()}
        payment = conn.execute(
            "SELECT payment_method, amount_paise FROM payments WHERE sale_id = ? LIMIT 1",
            (r["id"],),
        ).fetchone()
        item["payment_method"] = payment["payment_method"] if payment else None
        item["total"] = _rupees(r["total_paise"])
        item["subtotal"] = _rupees(r["subtotal_paise"])
        item["tax"] = _rupees(r["tax_paise"])
        item["discount"] = _rupees(r["discount_paise"])
        items.append(item)
    return {"items": items, "total": int(total), "page": page, "page_size": page_size}


# -------------------------------------------------------------- create

def create_sale(
    conn: sqlite3.Connection,
    payload: dict[str, Any],
    *,
    actor_id: str,
    device_id_header: str | None = None,
) -> dict[str, Any]:
    device_id = str(payload.get("device_id") or device_id_header or "").strip()
    if not device_id:
        raise ApiError(400, "device_id is required for idempotent sales")
    client_sale_id = str(payload.get("client_sale_id") or "").strip()
    if not client_sale_id:
        raise ApiError(400, "client_sale_id is required for idempotent sales")

    items = _parse_items(payload.get("items") or [])
    method = str(payload.get("payment_method") or "").upper().strip()
    if method not in PAYMENT_METHODS:
        raise ApiError(400, "Invalid payment method")

    # The caller already opened BEGIN IMMEDIATE via the route's `with transaction(conn)`.
    # First check idempotency BEFORE any writes.
    existing = conn.execute(
        "SELECT id FROM sales WHERE device_id = ? AND client_sale_id = ?",
        (device_id, client_sale_id),
    ).fetchone()
    if existing is not None:
        receipt = _receipt(conn, existing["id"])
        receipt["idempotent"] = True
        return receipt

    # ---- load products + stock
    product_ids = [i["product_id"] for i in items]
    placeholders = ",".join("?" for _ in product_ids)
    rows = conn.execute(
        f"""
        SELECT p.id, p.sku, p.name, p.hsn_code, p.unit, p.gst_rate,
               p.selling_price_paise, p.is_active,
               COALESCE(i.quantity, 0) AS stock
        FROM products p LEFT JOIN inventory i ON i.product_id = p.id
        WHERE p.id IN ({placeholders})
        """,
        product_ids,
    ).fetchall()
    catalog = {r["id"]: r for r in rows}
    missing = [pid for pid in product_ids if pid not in catalog]
    if missing:
        raise ApiError(404, f"Product not found: {missing[0]}")
    inactive = [pid for pid in product_ids if not catalog[pid]["is_active"]]
    if inactive:
        raise ApiError(400, "Product is not available for sale")

    # ---- line maths
    line_defs = []
    subtotal = 0
    line_discount_total = 0
    for item in items:
        p = catalog[item["product_id"]]
        qty = item["quantity"]
        if qty > int(p["stock"]):
            raise ApiError(409, f"Insufficient stock for {p['name']} (available: {p['stock']})")
        unit = int(p["selling_price_paise"])
        gross_before = unit * qty
        line_discount = item["discount_paise"]
        if line_discount >= gross_before and qty > 0:
            raise ApiError(400, f"Line discount for {p['name']} exceeds line amount")
        line_gross = gross_before - line_discount
        if line_gross < 0:
            raise ApiError(400, f"Line discount for {p['name']} exceeds line amount")
        if int(p["gst_rate"]) not in VALID_GST_RATES:
            raise ApiError(400, f"Unsupported GST rate on {p['name']}")
        subtotal += gross_before
        line_discount_total += line_discount
        line_defs.append({"product": p, "qty": qty, "unit": unit,
                          "line_discount": line_discount, "line_gross": line_gross})

    # ---- bill-level discount / charges
    raw_bill_discount = payload.get("bill_discount_paise", payload.get("bill_discount", 0)) or 0
    bill_discount = _parse_amount(raw_bill_discount, "bill discount")
    if bill_discount < 0:
        raise ApiError(400, "Bill discount cannot be negative")
    discountable = subtotal - line_discount_total
    if bill_discount > discountable:
        raise ApiError(400, "Bill discount exceeds discountable amount")

    raw_charges = payload.get("additional_charges_paise", payload.get("additional_charges", 0)) or 0
    charges = _parse_amount(raw_charges, "additional charges")
    if charges < 0:
        raise ApiError(400, "Additional charges cannot be negative")

    totals = compute_invoice_totals(
        line_gross=[ld["line_gross"] for ld in line_defs],
        line_rates=[int(ld["product"]["gst_rate"]) for ld in line_defs],
        bill_discount_paise=bill_discount,
        additional_charges_paise=charges,
    )
    # Expose raw subtotal (before any discount) + combined discount for the UI.
    totals["subtotal_paise"] = subtotal
    totals["discount_paise"] = line_discount_total + bill_discount

    total = int(totals["total_paise"])

    # ---- payment validation
    received_raw = payload.get("amount_received_paise", payload.get("amount_received"))
    if received_raw is None:
        received = total
    else:
        received = _parse_amount(received_raw, "amount received")
    if received < 0:
        raise ApiError(400, "Amount received cannot be negative")
    if method == "CASH":
        if received < total:
            raise ApiError(400, "Insufficient cash received")
    else:
        if received != total:
            raise ApiError(400, "Payment amount does not match bill total")

    # ---- customer snapshot (no customers table in Phase 1)
    customer_id = payload.get("customer_id") or None
    customer_name = (str(payload.get("customer_name") or "").strip() or None)
    customer_phone = (str(payload.get("customer_phone") or "").strip() or None)
    if customer_id:
        customer_id = str(customer_id)

    # ---- write
    now = utcnow_iso()
    sale_id = new_id()
    bill_no = next_bill_no(conn)

    conn.execute(
        """
        INSERT INTO sales(id, client_sale_id, device_id, bill_no, customer_id,
                          customer_name, customer_phone, subtotal_paise, discount_paise,
                          tax_paise, additional_charges_paise, round_off_paise, total_paise,
                          status, created_at, created_by)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """,
        (
            sale_id, client_sale_id, device_id, bill_no, customer_id,
            customer_name, customer_phone, totals["subtotal_paise"],
            totals["discount_paise"], totals["tax_paise"], charges,
            totals["round_off_paise"], total,
            "COMPLETED", now, actor_id,
        ),
    )

    # Guarded stock decrement (quantity must never go negative).
    for ld in line_defs:
        p = ld["product"]
        cur = conn.execute(
            "SELECT quantity FROM inventory WHERE product_id = ?",
            (p["id"],),
        ).fetchone()
        current_qty = int(cur["quantity"]) if cur else 0
        after_qty = current_qty - ld["qty"]
        if after_qty < 0:
            raise ApiError(409, f"Insufficient stock for {p['name']} (available: {current_qty})")
        conn.execute(
            "UPDATE inventory SET quantity = ?, updated_at = ? WHERE product_id = ?",
            (after_qty, now, p["id"]),
        )
        record_movement(
            conn,
            product_id=p["id"],
            movement_type="SALE",
            quantity=-ld["qty"],
            balance_after=after_qty,
            reference_type="SALE",
            reference_id=sale_id,
            reason=f"POS sale {bill_no}",
            created_by=actor_id,
        )

    # Per-line snapshot: catalog changes never rewrite history.
    # `line_total_paise` is the GST-INCLUSIVE amount payable for the line
    # (unit*qty minus line discount and the bill-discount share).
    for ld, line_tax, line_net in zip(line_defs, totals["line_tax_paise"], totals["line_net_paise"]):
        p = ld["product"]
        line_total = line_net
        conn.execute(
            """
            INSERT INTO sale_lines(id, sale_id, product_id, product_name_snapshot,
                                   sku_snapshot, hsn_snapshot, unit_snapshot, quantity,
                                   unit_price_paise, discount_paise, gst_rate, tax_paise,
                                   line_total_paise)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                new_id(), sale_id, p["id"], p["name"], p["sku"], p["hsn_code"] or "",
                p["unit"], ld["qty"], ld["unit"], ld["line_discount"],
                int(p["gst_rate"]), line_tax, line_total,
            ),
        )

    payment_id = new_id()
    conn.execute(
        """
        INSERT INTO payments(id, sale_id, payment_method, amount_paise, reference,
                             created_at, created_by)
        VALUES(?,?,?,?,?,?,?)
        """,
        (
            payment_id, sale_id, method, received,
            str(payload.get("payment_reference") or "") or None,
            now, actor_id,
        ),
    )

    enqueue(
        conn,
        entity_type="sale",
        entity_id=sale_id,
        operation="CREATE",
        payload={
            "sale_id": sale_id,
            "bill_no": bill_no,
            "client_sale_id": client_sale_id,
            "device_id": device_id,
            "total_paise": total,
            "payment_method": method,
            "line_count": len(line_defs),
        },
    )
    audit(
        conn,
        actor_user_id=actor_id,
        action="SALE_CREATE",
        entity_type="sale",
        entity_id=sale_id,
        after={"bill_no": bill_no, "total_paise": total, "items": len(line_defs)},
        device_id=device_id,
    )

    receipt = _receipt(conn, sale_id)
    receipt["idempotent"] = False
    return receipt
