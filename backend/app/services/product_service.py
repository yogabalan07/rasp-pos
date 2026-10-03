"""Product catalog service (STEP 10)."""

from __future__ import annotations

import sqlite3
from typing import Any

from ..errors import ApiError
from ..services.audit_service import record as audit
from ..services.auth_service import utcnow_iso
from ..services.outbox_service import enqueue
from ..services.gst_service import VALID_GST_RATES
from ..utils.ids import new_id
from ..utils.money import to_paise

# `inventory.updated_at` shares a name with `products.updated_at`, so that one
# column must be table-qualified whenever products and inventory are joined.
PRODUCT_COLUMNS = """
    id, sku, barcode, name, brand, category_id, category, unit,
    selling_price_paise, purchase_price_paise, mrp_paise, wholesale_price_paise,
    gst_rate, hsn_code, image, min_stock, batch_tracked, is_active,
    created_at, p.updated_at AS updated_at
"""


def _row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {k: row[k] for k in row.keys()}


def _ensure_inventory(conn: sqlite3.Connection, product_id: str, quantity: int = 0) -> None:
    now = utcnow_iso()
    conn.execute(
        "INSERT OR IGNORE INTO inventory(product_id, quantity, reserved_quantity,"
        " reorder_level, updated_at) VALUES(?,?,0,?,?)",
        (product_id, quantity, 0, now),
    )


def validate_product_payload(data: dict[str, Any], partial: bool = False) -> dict[str, Any]:
    out: dict[str, Any] = {}
    if not partial or "name" in data:
        name = str(data.get("name", "")).strip()
        if not name:
            raise ApiError(400, "Product name is required")
        if len(name) > 200:
            raise ApiError(400, "Product name is too long")
        out["name"] = name

    if not partial or "sku" in data:
        sku = str(data.get("sku", "")).strip().upper()
        if not sku:
            raise ApiError(400, "SKU is required")
        if len(sku) > 64:
            raise ApiError(400, "SKU is too long")
        out["sku"] = sku

    if "barcode" in data:
        barcode = str(data.get("barcode") or "").strip() or None
        if barcode and not (8 <= len(barcode) <= 14 or barcode.startswith("{")):
            raise ApiError(400, "Barcode must be 8-14 characters")
        out["barcode"] = barcode

    for field in ("selling_price", "purchase_price", "mrp", "wholesale_price"):
        api_field = f"{field}_paise"
        if field in data or f"{field}_paise" in data:
            raw = data.get(f"{field}_paise", data.get(field))
            if raw is None:
                continue
            try:
                paise = int(raw) if isinstance(raw, int) else to_paise(raw)
            except (ValueError, TypeError):
                raise ApiError(400, f"Invalid money value for {field}")
            if paise < 0:
                raise ApiError(400, f"{field} cannot be negative")
            out[api_field] = paise

    if "gst_rate" in data:
        rate = int(data["gst_rate"])
        if rate not in VALID_GST_RATES:
            raise ApiError(400, f"Unsupported GST rate: {rate}")
        out["gst_rate"] = rate

    if "hsn_code" in data or "hsn" in data:
        out["hsn_code"] = str(data.get("hsn_code", data.get("hsn", ""))).strip()

    if "brand" in data:
        out["brand"] = str(data.get("brand") or "").strip()
    if "unit" in data:
        out["unit"] = str(data.get("unit") or "").strip() or "Piece"
    if "category_name" in data or "category" in data:
        cat_name = str(data.get("category_name", data.get("category")) or "").strip()
        out["category"] = cat_name
        if "category_id" not in data:
            out["category_id"] = cat_name.lower().replace(" & ", "-").replace(" ", "-") if cat_name else ""
    if "category_id" in data:
        out["category_id"] = str(data.get("category_id") or "").strip()
    if "min_stock" in data:
        try:
            out["min_stock"] = max(0, int(data["min_stock"]))
        except (TypeError, ValueError):
            raise ApiError(400, "Invalid min_stock")
    if "image" in data:
        out["image"] = data.get("image") or None
    if "batch_tracked" in data:
        out["batch_tracked"] = 1 if data.get("batch_tracked") else 0
    if "is_active" in data:
        out["is_active"] = 1 if data.get("is_active") else 0

    if "selling_price_paise" in out and out["selling_price_paise"] <= 0:
        raise ApiError(400, "Selling price must be greater than zero")
    return out


def list_products(
    conn: sqlite3.Connection,
    *,
    q: str | None = None,
    category_id: str | None = None,
    page: int = 1,
    page_size: int = 100,
    include_inactive: bool = False,
) -> dict[str, Any]:
    page = max(1, page)
    page_size = max(1, min(page_size, 500))
    where: list[str] = []
    params: list[Any] = []
    if not include_inactive:
        where.append("p.is_active = 1")
    if category_id:
        where.append("p.category_id = ?")
        params.append(category_id)
    if q:
        like = f"%{q.strip()}%"
        where.append("(p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ? OR p.brand LIKE ?)")
        params += [like, like, like, like]
    clause = (" WHERE " + " AND ".join(where)) if where else ""

    total = conn.execute(f"SELECT COUNT(*) FROM products p{clause}", params).fetchone()[0]
    offset = (page - 1) * page_size
    rows = conn.execute(
        f"""
        SELECT {PRODUCT_COLUMNS}, COALESCE(i.quantity, 0) AS stock,
               COALESCE(i.reorder_level, 0) AS reorder_level
        FROM products p
        LEFT JOIN inventory i ON i.product_id = p.id
        {clause}
        ORDER BY p.name COLLATE NOCASE
        LIMIT ? OFFSET ?
        """,
        [*params, page_size, offset],
    ).fetchall()
    items = [_row_to_dict(r) for r in rows]
    return {"items": items, "total": int(total), "page": page, "page_size": page_size}


def get_product(conn: sqlite3.Connection, product_id: str) -> dict[str, Any]:
    row = conn.execute(
        f"""
        SELECT {PRODUCT_COLUMNS}, COALESCE(i.quantity, 0) AS stock,
               COALESCE(i.reorder_level, 0) AS reorder_level
        FROM products p LEFT JOIN inventory i ON i.product_id = p.id
        WHERE p.id = ?
        """,
        (product_id,),
    ).fetchone()
    if row is None:
        raise ApiError(404, "Product not found")
    return _row_to_dict(row)


def create_product(
    conn: sqlite3.Connection,
    data: dict[str, Any],
    *,
    actor_id: str,
    device_id: str | None = None,
) -> dict[str, Any]:
    payload = validate_product_payload(data, partial=False)
    payload.setdefault("category_id", "")
    payload.setdefault("category", "")
    payload.setdefault("brand", "")
    payload.setdefault("unit", "Piece")
    payload.setdefault("hsn_code", "")
    payload.setdefault("gst_rate", 0)
    payload.setdefault("selling_price_paise", 0)
    payload.setdefault("purchase_price_paise", 0)
    payload.setdefault("mrp_paise", payload.get("selling_price_paise", 0))
    payload.setdefault("wholesale_price_paise", 0)
    payload.setdefault("min_stock", 0)
    payload.setdefault("image", None)
    payload.setdefault("batch_tracked", 0)
    payload.setdefault("is_active", 1)
    if payload["selling_price_paise"] <= 0:
        raise ApiError(400, "Selling price must be greater than zero")

    initial_stock = max(0, int(data.get("stock", 0) or 0))
    product_id = new_id()
    now = utcnow_iso()

    try:
        conn.execute(
            """
            INSERT INTO products(id, sku, barcode, name, brand, category_id, category, unit,
                                 selling_price_paise, purchase_price_paise, mrp_paise,
                                 wholesale_price_paise, gst_rate, hsn_code, image, min_stock,
                                 batch_tracked, is_active, created_at, updated_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                product_id, payload["sku"], payload.get("barcode"), payload["name"],
                payload["brand"], payload["category_id"], payload["category"], payload["unit"],
                payload["selling_price_paise"], payload["purchase_price_paise"],
                payload["mrp_paise"], payload["wholesale_price_paise"], payload["gst_rate"],
                payload["hsn_code"], payload["image"], payload["min_stock"],
                payload["batch_tracked"], payload["is_active"], now, now,
            ),
        )
    except sqlite3.IntegrityError as exc:
        message = str(exc).lower()
        if "sku" in message:
            raise ApiError(409, "A product with this SKU already exists")
        if "barcode" in message:
            raise ApiError(409, "A product with this barcode already exists")
        raise ApiError(409, "Product already exists")

    _ensure_inventory(conn, product_id, initial_stock)
    if initial_stock:
        from .inventory_service import record_movement

        record_movement(
            conn,
            product_id=product_id,
            movement_type="PURCHASE",
            quantity=initial_stock,
            balance_after=initial_stock,
            reference_type="OPENING",
            reference_id=product_id,
            reason="Opening stock",
            created_by=actor_id,
        )

    audit(
        conn,
        actor_user_id=actor_id,
        action="PRODUCT_CREATE",
        entity_type="product",
        entity_id=product_id,
        after={"sku": payload["sku"], "name": payload["name"]},
        device_id=device_id,
    )
    enqueue(
        conn,
        entity_type="product",
        entity_id=product_id,
        operation="CREATE",
        payload={"product_id": product_id, "sku": payload["sku"], "name": payload["name"]},
    )
    return get_product(conn, product_id)


def update_product(
    conn: sqlite3.Connection,
    product_id: str,
    data: dict[str, Any],
    *,
    actor_id: str,
    device_id: str | None = None,
) -> dict[str, Any]:
    before = conn.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
    if before is None:
        raise ApiError(404, "Product not found")
    payload = validate_product_payload(data, partial=True)
    if not payload:
        raise ApiError(400, "No valid fields to update")
    payload["updated_at"] = utcnow_iso()

    sets = ", ".join(f"{k} = ?" for k in payload)
    try:
        conn.execute(
            f"UPDATE products SET {sets} WHERE id = ?",
            [*payload.values(), product_id],
        )
    except sqlite3.IntegrityError as exc:
        message = str(exc).lower()
        if "sku" in message:
            raise ApiError(409, "A product with this SKU already exists")
        if "barcode" in message:
            raise ApiError(409, "A product with this barcode already exists")
        raise

    audit(
        conn,
        actor_user_id=actor_id,
        action="PRODUCT_UPDATE",
        entity_type="product",
        entity_id=product_id,
        before={k: before[k] for k in before.keys() if k in payload},
        after={k: payload[k] for k in payload if k != "updated_at"},
        device_id=device_id,
    )
    enqueue(
        conn,
        entity_type="product",
        entity_id=product_id,
        operation="UPDATE",
        payload={"product_id": product_id, "changed": sorted(k for k in payload if k != "updated_at")},
    )
    return get_product(conn, product_id)


def deactivate_product(
    conn: sqlite3.Connection, product_id: str, *, actor_id: str, device_id: str | None = None
) -> dict[str, Any]:
    before = conn.execute("SELECT is_active FROM products WHERE id = ?", (product_id,)).fetchone()
    if before is None:
        raise ApiError(404, "Product not found")
    conn.execute(
        "UPDATE products SET is_active = 0, updated_at = ? WHERE id = ?",
        (utcnow_iso(), product_id),
    )
    audit(
        conn,
        actor_user_id=actor_id,
        action="PRODUCT_DEACTIVATE",
        entity_type="product",
        entity_id=product_id,
        before={"is_active": before["is_active"]},
        after={"is_active": 0},
        device_id=device_id,
    )
    enqueue(
        conn,
        entity_type="product",
        entity_id=product_id,
        operation="UPDATE",
        payload={"product_id": product_id, "is_active": 0},
    )
    return get_product(conn, product_id)


def list_categories(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT category_id, category, COUNT(*) AS item_count
        FROM products WHERE is_active = 1 AND category_id != ''
        GROUP BY category_id, category
        ORDER BY category COLLATE NOCASE
        """
    ).fetchall()
    return [
        {"id": r["category_id"], "name": r["category"], "slug": r["category_id"],
         "item_count": int(r["item_count"])}
        for r in rows
    ]
