"""Inventory + stock audit service (STEP 11).

Stock only ever changes through `adjust_stock()` (audited manual moves) or the
POS sale transaction.  `record_movement()` is the low-level ledger writer used
by both product seeding and those two paths.
"""

from __future__ import annotations

import sqlite3
from typing import Any

from ..errors import ApiError
from ..services.audit_service import record as audit
from ..services.auth_service import utcnow_iso
from ..services.outbox_service import enqueue
from ..utils.ids import new_id

MOVEMENT_TYPES = ("SALE", "PURCHASE", "ADJUSTMENT", "RETURN")


def record_movement(
    conn: sqlite3.Connection,
    *,
    product_id: str,
    movement_type: str,
    quantity: int,
    balance_after: int,
    reference_type: str | None = None,
    reference_id: str | None = None,
    reason: str | None = None,
    created_by: str | None = None,
) -> str:
    if movement_type not in MOVEMENT_TYPES:
        raise ApiError(400, f"Invalid movement type: {movement_type}")
    movement_id = new_id()
    conn.execute(
        """
        INSERT INTO stock_movements(id, product_id, movement_type, quantity,
                                    reference_type, reference_id, balance_after,
                                    reason, created_at, created_by)
            VALUES(?,?,?,?,?,?,?,?,?,?)
        """,
        (
            movement_id,
            product_id,
            movement_type,
            quantity,
            reference_type,
            reference_id,
            balance_after,
            reason,
            utcnow_iso(),
            created_by,
        ),
    )
    return movement_id


def get_inventory(conn: sqlite3.Connection, product_id: str) -> dict[str, Any]:
    row = conn.execute(
        """
        SELECT i.product_id, i.quantity, i.reserved_quantity, i.reorder_level, i.updated_at,
               p.name, p.sku, p.unit, p.min_stock, p.is_active, p.selling_price_paise
        FROM inventory i JOIN products p ON p.id = i.product_id
        WHERE i.product_id = ?
        """,
        (product_id,),
    ).fetchone()
    if row is None:
        raise ApiError(404, "Inventory record not found")
    return {k: row[k] for k in row.keys()}


def list_inventory(
    conn: sqlite3.Connection, *, low_stock_only: bool = False, q: str | None = None
) -> list[dict[str, Any]]:
    where = ["p.is_active = 1"]
    params: list[Any] = []
    if low_stock_only:
        where.append(
            "((p.min_stock > 0 AND i.quantity <= p.min_stock)"
            " OR (i.reorder_level > 0 AND i.quantity <= i.reorder_level))"
        )
    if q:
        like = f"%{q.strip()}%"
        where.append("(p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)")
        params += [like, like, like]
    rows = conn.execute(
        f"""
        SELECT i.product_id, i.quantity, i.reserved_quantity, i.reorder_level, i.updated_at,
               p.name, p.sku, p.unit, p.min_stock, p.is_active, p.selling_price_paise,
               p.category, p.batch_tracked
        FROM inventory i JOIN products p ON p.id = i.product_id
        WHERE {' AND '.join(where)}
        ORDER BY p.name COLLATE NOCASE
        """,
        params,
    ).fetchall()
    out = []
    for r in rows:
        item = {k: r[k] for k in r.keys()}
        item["is_low_stock"] = item["min_stock"] > 0 and item["quantity"] <= item["min_stock"]
        item["stock"] = item["quantity"]
        out.append(item)
    return out


def adjust_stock(
    conn: sqlite3.Connection,
    product_id: str,
    *,
    delta: int,
    reason: str,
    actor_id: str,
    device_id: str | None = None,
    reason_code: str | None = None,
) -> dict[str, Any]:
    """Audited manual stock adjustment (+/-). Creates an outbox event too."""
    if not isinstance(delta, int) or delta == 0:
        raise ApiError(400, "Stock adjustment amount must be a non-zero integer")
    if reason_code is None:
        reason_code = "ADJUSTMENT"
    if reason_code not in MOVEMENT_TYPES:
        raise ApiError(400, f"Invalid reason code: {reason_code}")

    row = conn.execute("SELECT quantity FROM inventory WHERE product_id = ?", (product_id,)).fetchone()
    if row is None:
        raise ApiError(404, "Inventory record not found")
    before_qty = int(row["quantity"])
    after_qty = before_qty + delta
    if after_qty < 0:
        raise ApiError(400, f"Stock cannot go negative (current: {before_qty}, delta: {delta})")

    now = utcnow_iso()
    conn.execute("UPDATE inventory SET quantity = ?, updated_at = ? WHERE product_id = ?",
                 (after_qty, now, product_id))
    movement_id = record_movement(
        conn,
        product_id=product_id,
        movement_type="ADJUSTMENT",
        quantity=delta,
        balance_after=after_qty,
        reference_type="MANUAL",
        reference_id=None,
        reason=reason,
        created_by=actor_id,
    )
    audit(
        conn,
        actor_user_id=actor_id,
        action="STOCK_ADJUST",
        entity_type="inventory",
        entity_id=product_id,
        before={"quantity": before_qty},
        after={"quantity": after_qty, "delta": delta, "reason": reason},
        device_id=device_id,
    )
    enqueue(
        conn,
        entity_type="stock_movement",
        entity_id=movement_id,
        operation="CREATE",
        payload={"product_id": product_id, "delta": delta, "after": after_qty, "reason": reason},
    )
    return get_inventory(conn, product_id)


def list_movements(
    conn: sqlite3.Connection, *, product_id: str | None = None, limit: int = 200
) -> list[dict[str, Any]]:
    limit = max(1, min(limit, 1000))
    where: list[str] = []
    params: list[Any] = []
    if product_id:
        where.append("m.product_id = ?")
        params.append(product_id)
    clause = (" WHERE " + " AND ".join(where)) if where else ""
    rows = conn.execute(
        f"""
        SELECT m.*, p.name AS product_name, p.sku, u.display_name AS created_by_name
        FROM stock_movements m
        JOIN products p ON p.id = m.product_id
        LEFT JOIN users u ON u.id = m.created_by
        {clause}
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT ?
        """,
        [*params, limit],
    ).fetchall()
    return [{k: r[k] for k in r.keys()} for r in rows]
