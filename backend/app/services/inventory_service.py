"""Inventory + stock ledger service (Phase 2).

Stock only ever changes through:
  * `set_opening_stock()`  -> OPENING_STOCK
  * `adjust_stock()`       -> ADJUSTMENT
  * the POS sale transaction (sales_service) -> SALE
  * `create_product()`     -> OPENING_STOCK

Every one of those runs inside a single `BEGIN IMMEDIATE` transaction and writes
exactly one `stock_movements` row + one `audit_log` row, so an inventory update
can never exist without its movement (Phase 2 rule 34/35).

Canonical low-stock threshold: `inventory.reorder_level` (see PHASE2_BASELINE §3).
"""

from __future__ import annotations

import math
import sqlite3
from typing import Any

from ..database import transaction
from ..errors import ApiError
from ..services.audit_service import record as audit
from ..services.auth_service import utcnow_iso
from ..services.outbox_service import enqueue
from ..utils.ids import new_id

# Movement types this phase actually WRITES. The schema CHECK also accepts the
# reserved future types (PURCHASE_RETURN, SALE_RETURN, TRANSFER_IN/OUT, DAMAGE,
# EXPIRY) so no table rebuild is needed when they are implemented.
MOVEMENT_TYPES = ("OPENING_STOCK", "SALE", "PURCHASE", "ADJUSTMENT", "RETURN")

STOCK_STATUSES = ("IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK")

# Shared projection for inventory rows: quantity, canonical threshold, prices
# (for valuation) and everything the UI already renders.
INVENTORY_SELECT = """
    SELECT i.product_id, i.quantity, i.reserved_quantity, i.reorder_level,
           i.updated_at,
           p.name, p.sku, p.barcode, p.unit, p.category, p.subcategory,
           p.min_stock, p.is_active, p.batch_tracked,
           p.selling_price_paise, p.purchase_price_paise, p.mrp_paise,
           (SELECT COUNT(*) FROM stock_movements m
             WHERE m.product_id = i.product_id
               AND m.movement_type = 'OPENING_STOCK') AS opening_recorded
    FROM inventory i
    JOIN products p ON p.id = i.product_id
"""


def stock_status(quantity: int, reorder_level: int) -> str:
    """Single source of truth for IN_STOCK / LOW_STOCK / OUT_OF_STOCK.

    OUT_OF_STOCK : quantity == 0
    LOW_STOCK    : 0 < quantity <= reorder_level
    IN_STOCK     : quantity > reorder_level

    The three values are mutually exclusive (Phase 2 stock-status spec).
    """
    if quantity <= 0:
        return "OUT_OF_STOCK"
    if quantity <= reorder_level:
        return "LOW_STOCK"
    return "IN_STOCK"


# Phase 1 semantics: "needs reordering" includes the zero-stock items, so the
# legacy `is_low_stock` flag and `low_stock_only` filter are broader than the
# LOW_STOCK *status*. Kept so the existing UI/tests stay honest.
BELOW_THRESHOLD_SQL = "i.quantity <= i.reorder_level"


def _decorate(item: dict[str, Any]) -> dict[str, Any]:
    quantity = int(item["quantity"])
    reorder = int(item["reorder_level"])
    item["stock_status"] = stock_status(quantity, reorder)
    item["is_low_stock"] = quantity <= reorder
    item["stock"] = quantity  # legacy alias used by the Phase 1 UI
    item["reorder_level"] = reorder
    # Valuation foundation: integer paise, no floats anywhere.
    item["cost_value_paise"] = quantity * int(item["purchase_price_paise"])
    item["selling_value_paise"] = quantity * int(item["selling_price_paise"])
    item["opening_recorded"] = bool(item.get("opening_recorded"))
    return item


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
        raise ApiError(
            400, f"Invalid movement type: {movement_type}", code="INVALID_MOVEMENT_TYPE"
        )
    if balance_after < 0:
        raise ApiError(
            400,
            f"Stock cannot go negative (balance: {balance_after})",
            code="INSUFFICIENT_STOCK",
        )
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
        INVENTORY_SELECT + " WHERE i.product_id = ?", (product_id,)
    ).fetchone()
    if row is None:
        raise ApiError(404, "Inventory record not found", code="INVENTORY_NOT_FOUND")
    return _decorate(_row(row))


def _row(row: sqlite3.Row) -> dict[str, Any]:
    return {k: row[k] for k in row.keys()}


def STOCK_SQL(wanted: str) -> str:
    """SQL predicate matching `stock_status()` — kept in one place so the
    server-side filter and the summary can never disagree with the Python rule."""
    if wanted == "OUT_OF_STOCK":
        return "i.quantity <= 0"
    if wanted == "LOW_STOCK":
        return "(i.quantity > 0 AND i.quantity <= i.reorder_level)"
    if wanted == "IN_STOCK":
        return "i.quantity > i.reorder_level"
    raise ApiError(
        400,
        f"Unknown stock status: {wanted} (use {', '.join(STOCK_STATUSES)})",
        code="INVALID_STOCK_STATUS",
    )


def _summary(conn: sqlite3.Connection, where: str, params: list[Any]) -> dict[str, Any]:
    """Aggregates over the whole filtered set (not just the current page)."""
    row = conn.execute(
        f"""
        SELECT COUNT(*) AS sku_count,
               COALESCE(SUM(i.quantity), 0) AS units,
               COALESCE(SUM(i.quantity * p.purchase_price_paise), 0) AS cost_value_paise,
               COALESCE(SUM(i.quantity * p.selling_price_paise), 0) AS selling_value_paise,
               COALESCE(SUM(CASE WHEN {STOCK_SQL('OUT_OF_STOCK')} THEN 1 ELSE 0 END), 0) AS out_of_stock,
               COALESCE(SUM(CASE WHEN {STOCK_SQL('LOW_STOCK')} THEN 1 ELSE 0 END), 0) AS low_stock,
               COALESCE(SUM(CASE WHEN {STOCK_SQL('IN_STOCK')} THEN 1 ELSE 0 END), 0) AS in_stock,
               COALESCE(SUM(CASE WHEN {BELOW_THRESHOLD_SQL} THEN 1 ELSE 0 END), 0) AS below_threshold
        FROM inventory i JOIN products p ON p.id = i.product_id
        {where}
        """,
        params,
    ).fetchone()
    return {k: int(row[k]) for k in row.keys()}


def list_inventory(
    conn: sqlite3.Connection,
    *,
    q: str | None = None,
    category: str | None = None,
    stock_status_filter: str | None = None,
    is_active: bool | None = None,
    low_stock_only: bool = False,
    page: int = 1,
    page_size: int = 100,
) -> dict[str, Any]:
    page = max(1, page)
    page_size = max(1, min(page_size, 500))

    where: list[str] = []
    params: list[Any] = []
    if is_active is not None:
        where.append("p.is_active = ?")
        params.append(1 if is_active else 0)
    else:
        where.append("p.is_active = 1")
    if category:
        where.append("p.category_id = ?")
        params.append(category)
    if stock_status_filter:
        where.append(STOCK_SQL(stock_status_filter))
    elif low_stock_only:
        # Phase 1 parameter: "at or below the reorder point", zero included.
        where.append(BELOW_THRESHOLD_SQL)
    if q:
        like = f"%{q.strip()}%"
        where.append(
            "(p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ? OR p.subcategory LIKE ?)"
        )
        params += [like, like, like, like]
    clause = (" WHERE " + " AND ".join(where)) if where else ""

    total = int(
        conn.execute(
            f"SELECT COUNT(*) FROM inventory i JOIN products p ON p.id = i.product_id{clause}",
            params,
        ).fetchone()[0]
    )
    summary = _summary(conn, clause, params)
    pages = max(1, math.ceil(total / page_size)) if total else 1
    offset = (page - 1) * page_size

    rows = conn.execute(
        INVENTORY_SELECT + clause + " ORDER BY p.name COLLATE NOCASE LIMIT ? OFFSET ?",
        [*params, page_size, offset],
    ).fetchall()
    items = [_decorate(_row(r)) for r in rows]
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": pages,
        "summary": summary,
    }


def _require_movement_permission(reason: str | None) -> None:
    if not reason or not str(reason).strip():
        raise ApiError(
            400, "A reason is required for a manual stock adjustment",
            code="INVALID_STOCK_ADJUSTMENT",
        )


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
    """Audited manual stock adjustment (+/-), atomic end to end."""
    if not isinstance(delta, int) or isinstance(delta, bool) or delta == 0:
        raise ApiError(
            400,
            "Stock adjustment amount must be a non-zero integer",
            code="INVALID_STOCK_ADJUSTMENT",
        )
    _require_movement_permission(reason)
    if reason_code is None:
        reason_code = "ADJUSTMENT"
    if reason_code not in MOVEMENT_TYPES:
        raise ApiError(
            400, f"Invalid reason code: {reason_code}", code="INVALID_MOVEMENT_TYPE"
        )

    with transaction(conn):
        row = conn.execute(
            "SELECT quantity FROM inventory WHERE product_id = ?", (product_id,)
        ).fetchone()
        if row is None:
            raise ApiError(404, "Inventory record not found", code="INVENTORY_NOT_FOUND")
        before_qty = int(row["quantity"])
        after_qty = before_qty + delta
        if after_qty < 0:
            raise ApiError(
                400,
                f"Stock cannot go negative (current: {before_qty}, delta: {delta})",
                code="INSUFFICIENT_STOCK",
            )

        now = utcnow_iso()
        # Compare-and-swap on the value we validated: two concurrent requests can
        # never both apply against the same stale reading.
        cur = conn.execute(
            "UPDATE inventory SET quantity = ?, updated_at = ?"
            " WHERE product_id = ? AND quantity = ?",
            (after_qty, now, product_id, before_qty),
        )
        if cur.rowcount != 1:
            raise ApiError(
                409,
                "Stock changed while this adjustment was being prepared; please retry",
                code="STOCK_CONFLICT",
            )

        movement_id = record_movement(
            conn,
            product_id=product_id,
            movement_type=reason_code,
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
            payload={
                "product_id": product_id,
                "movement_type": reason_code,
                "delta": delta,
                "after": after_qty,
                "reason": reason,
            },
        )

    return _adjustment_result(conn, product_id, before_qty, delta, after_qty, movement_id)


def _adjustment_result(
    conn: sqlite3.Connection,
    product_id: str,
    previous: int,
    adjustment: int,
    new_quantity: int,
    movement_id: str,
) -> dict[str, Any]:
    inventory = get_inventory(conn, product_id)
    return {
        "product": inventory,
        "previous_quantity": previous,
        "adjustment": adjustment,
        "new_quantity": new_quantity,
        "movement_id": movement_id,
        # Legacy keys kept so the Phase 1 UI/service contract still works.
        "quantity": new_quantity,
    }


def set_opening_stock(
    conn: sqlite3.Connection,
    product_id: str,
    *,
    quantity: int,
    reason: str | None,
    actor_id: str,
    device_id: str | None = None,
) -> dict[str, Any]:
    """Record the opening stock of a product exactly once.

    Absolute set (normally 0 -> N), always accompanied by an OPENING_STOCK
    movement and an audit entry. Never a silent inventory write.
    """
    if not isinstance(quantity, int) or isinstance(quantity, bool) or quantity < 0:
        raise ApiError(
            400, "Opening stock must be a non-negative integer",
            code="INVALID_STOCK_ADJUSTMENT",
        )

    with transaction(conn):
        product = conn.execute(
            "SELECT id, sku, name, min_stock FROM products WHERE id = ?", (product_id,)
        ).fetchone()
        if product is None:
            raise ApiError(404, "Product not found", code="PRODUCT_NOT_FOUND")

        existing = conn.execute(
            "SELECT id FROM stock_movements"
            " WHERE product_id = ? AND movement_type = 'OPENING_STOCK' LIMIT 1",
            (product_id,),
        ).fetchone()
        if existing is not None:
            raise ApiError(
                409,
                "Opening stock has already been recorded for this product",
                code="OPENING_STOCK_ALREADY_SET",
            )

        row = conn.execute(
            "SELECT quantity FROM inventory WHERE product_id = ?", (product_id,)
        ).fetchone()
        if row is None:
            from .product_service import _ensure_inventory

            _ensure_inventory(
                conn, product_id, 0, reorder_level=int(product["min_stock"] or 0)
            )
            before_qty = 0
        else:
            before_qty = int(row["quantity"])

        delta = quantity - before_qty
        now = utcnow_iso()
        conn.execute(
            "UPDATE inventory SET quantity = ?, updated_at = ? WHERE product_id = ?",
            (quantity, now, product_id),
        )

        movement_id = record_movement(
            conn,
            product_id=product_id,
            movement_type="OPENING_STOCK",
            quantity=delta,
            balance_after=quantity,
            reference_type="OPENING",
            reference_id=product_id,
            reason=(reason or "Opening stock").strip(),
            created_by=actor_id,
        )
        audit(
            conn,
            actor_user_id=actor_id,
            action="OPENING_STOCK",
            entity_type="inventory",
            entity_id=product_id,
            before={"quantity": before_qty},
            after={"quantity": quantity, "delta": delta},
            device_id=device_id,
        )
        enqueue(
            conn,
            entity_type="stock_movement",
            entity_id=movement_id,
            operation="CREATE",
            payload={
                "product_id": product_id,
                "movement_type": "OPENING_STOCK",
                "quantity": quantity,
                "after": quantity,
            },
        )

    return _adjustment_result(
        conn, product_id, before_qty, delta, quantity, movement_id
    )


def _movement_where(
    *,
    product_id: str | None,
    movement_type: str | None,
    date_from: str | None,
    date_to: str | None,
) -> tuple[str, list[Any]]:
    where: list[str] = []
    params: list[Any] = []
    if product_id:
        where.append("m.product_id = ?")
        params.append(product_id)
    if movement_type:
        where.append("m.movement_type = ?")
        params.append(movement_type)
    if date_from:
        where.append("m.created_at >= ?")
        params.append(date_from)
    if date_to:
        # `date_to` is inclusive of the whole day when only a date is supplied.
        params.append(date_to)
        where.append(
            "m.created_at <= ?"
            if "T" in date_to or len(date_to) > 10
            else "m.created_at < datetime(?, '+1 day')"
        )
    return ((" WHERE " + " AND ".join(where)) if where else ""), params


def list_movements(
    conn: sqlite3.Connection,
    *,
    product_id: str | None = None,
    movement_type: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    page: int = 1,
    page_size: int = 200,
) -> dict[str, Any]:
    page = max(1, page)
    page_size = max(1, min(page_size, 1000))
    clause, params = _movement_where(
        product_id=product_id,
        movement_type=movement_type,
        date_from=date_from,
        date_to=date_to,
    )
    total = int(
        conn.execute(f"SELECT COUNT(*) FROM stock_movements m{clause}", params).fetchone()[0]
    )
    pages = max(1, math.ceil(total / page_size)) if total else 1
    offset = (page - 1) * page_size
    rows = conn.execute(
        f"""
        SELECT m.*, p.name AS product_name, p.sku, u.display_name AS created_by_name
        FROM stock_movements m
        JOIN products p ON p.id = m.product_id
        LEFT JOIN users u ON u.id = m.created_by
        {clause}
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT ? OFFSET ?
        """,
        [*params, page_size, offset],
    ).fetchall()
    items = []
    for r in rows:
        item = _row(r)
        item["previous_balance"] = int(item["balance_after"]) - int(item["quantity"])
        items.append(item)
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": pages,
    }
