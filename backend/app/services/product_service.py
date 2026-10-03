"""Product catalog service.

Phase 2 additions over Phase 1:
  * server-side pagination (`items/total/page/page_size/pages`) + filters
  * `search` by name / SKU / barcode (exact) with index-backed lookups
  * subcategory + brand
  * PUT (full) and PATCH (partial) updates, explicit status toggle
  * `OPENING_STOCK` movements instead of `PURCHASE`
  * `created_by` / `updated_by` columns, richer PRODUCT_* audit payloads
  * every write wrapped in ONE explicit `BEGIN IMMEDIATE` transaction so a
    partial product write can never be committed.

Money is INTEGER paise end-to-end (`utils.money.to_paise`).
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
from ..services.gst_service import VALID_GST_RATES
from ..utils.ids import new_id
from ..utils.money import to_paise
from .inventory_service import stock_status

# `inventory.updated_at` shares a name with `products.updated_at`, so that one
# column must be table-qualified whenever products and inventory are joined.
PRODUCT_COLUMNS = """
    p.id, p.sku, p.barcode, p.name, p.brand, p.category_id, p.category,
    p.subcategory, p.unit,
    p.selling_price_paise, p.purchase_price_paise, p.mrp_paise,
    p.wholesale_price_paise,
    p.gst_rate, p.hsn_code, p.image, p.min_stock, p.batch_tracked, p.is_active,
    p.created_at, p.updated_at, p.created_by, p.updated_by
"""

# Product rows returned by list/search include live stock so the POS and the
# catalog pages need only one round trip.
STOCK_COLUMNS = """
    , COALESCE(i.quantity, 0) AS stock
    , COALESCE(i.reorder_level, p.min_stock) AS reorder_level
"""


def _row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {k: row[k] for k in row.keys()}


def _decorate(item: dict[str, Any]) -> dict[str, Any]:
    """Add the server-computed stock status so no client re-derives it."""
    quantity = int(item.get("stock") or 0)
    reorder = int(item.get("reorder_level") or 0)
    item["stock_status"] = stock_status(quantity, reorder)
    item["is_low_stock"] = quantity <= reorder
    return item


def _ensure_inventory(
    conn: sqlite3.Connection,
    product_id: str,
    quantity: int = 0,
    *,
    reorder_level: int = 0,
) -> None:
    now = utcnow_iso()
    conn.execute(
        "INSERT OR IGNORE INTO inventory(product_id, quantity, reserved_quantity,"
        " reorder_level, updated_at) VALUES(?,?,0,?,?)",
        (product_id, quantity, reorder_level, now),
    )
    # Product already had an inventory row (PATCH on an older product): keep the
    # canonical threshold in sync with the product master field.
    conn.execute(
        "UPDATE inventory SET reorder_level = ? WHERE product_id = ?",
        (reorder_level, product_id),
    )


def validate_product_payload(data: dict[str, Any], partial: bool = False) -> dict[str, Any]:
    out: dict[str, Any] = {}

    if not partial or "name" in data:
        name = str(data.get("name", "")).strip()
        if not name:
            raise ApiError(400, "Product name is required", code="INVALID_NAME")
        if len(name) > 200:
            raise ApiError(400, "Product name is too long", code="INVALID_NAME")
        out["name"] = name

    if not partial or "sku" in data:
        # Normalisation must be identical on every write path so the UNIQUE
        # index is the real duplicate guard.
        sku = str(data.get("sku", "")).strip().upper()
        if not sku:
            raise ApiError(400, "SKU is required", code="INVALID_SKU")
        if len(sku) > 64:
            raise ApiError(400, "SKU is too long", code="INVALID_SKU")
        out["sku"] = sku

    if "barcode" in data:
        barcode = str(data.get("barcode") or "").strip() or None
        if barcode and not (8 <= len(barcode) <= 14 or barcode.startswith("{")):
            raise ApiError(
                400, "Barcode must be 8-14 characters", code="INVALID_BARCODE"
            )
        out["barcode"] = barcode

    for field in ("selling_price", "purchase_price", "mrp", "wholesale_price"):
        api_field = f"{field}_paise"
        if field in data or f"{field}_paise" in data:
            raw = data.get(f"{field}_paise", data.get(field))
            if raw is None:
                continue
            try:
                # `to_paise` goes through Decimal(str(x)) — never binary floats.
                paise = int(raw) if isinstance(raw, int) else to_paise(raw)
            except (ValueError, TypeError):
                raise ApiError(
                    400, f"Invalid money value for {field}", code="INVALID_PRICE"
                )
            if paise < 0:
                raise ApiError(
                    400, f"{field} cannot be negative", code="INVALID_PRICE"
                )
            out[api_field] = paise

    if "gst_rate" in data and data["gst_rate"] is not None:
        try:
            rate = int(data["gst_rate"])
        except (TypeError, ValueError):
            raise ApiError(400, "Invalid GST rate", code="INVALID_GST_RATE")
        if rate not in VALID_GST_RATES:
            raise ApiError(
                400,
                f"Unsupported GST rate: {rate} (allowed: {', '.join(map(str, VALID_GST_RATES))})",
                code="INVALID_GST_RATE",
            )
        out["gst_rate"] = rate

    if "hsn_code" in data or "hsn" in data:
        out["hsn_code"] = str(data.get("hsn_code", data.get("hsn", ""))).strip()

    if "brand" in data:
        out["brand"] = str(data.get("brand") or "").strip()
    if "unit" in data:
        unit = str(data.get("unit") or "").strip()
        if not partial and not unit:
            raise ApiError(400, "Unit is required", code="INVALID_UNIT")
        out["unit"] = unit or "Piece"
    if "category_name" in data or "category" in data:
        cat_name = str(data.get("category_name", data.get("category")) or "").strip()
        out["category"] = cat_name
        if "category_id" not in data:
            out["category_id"] = (
                cat_name.lower().replace(" & ", "-").replace(" ", "-") if cat_name else ""
            )
    if "category_id" in data:
        out["category_id"] = str(data.get("category_id") or "").strip()
    if "subcategory" in data:
        out["subcategory"] = str(data.get("subcategory") or "").strip()
    if "min_stock" in data:
        try:
            out["min_stock"] = max(0, int(data["min_stock"]))
        except (TypeError, ValueError):
            raise ApiError(400, "Invalid min_stock", code="INVALID_THRESHOLD")
    if "image" in data:
        out["image"] = data.get("image") or None
    if "batch_tracked" in data:
        out["batch_tracked"] = 1 if data.get("batch_tracked") else 0
    if "is_active" in data:
        out["is_active"] = 1 if data.get("is_active") else 0

    if "selling_price_paise" in out and out["selling_price_paise"] <= 0:
        raise ApiError(
            400, "Selling price must be greater than zero", code="INVALID_PRICE"
        )
    return out


def _dup_error(exc: sqlite3.IntegrityError) -> ApiError:
    message = str(exc).lower()
    if "sku" in message:
        return ApiError(409, "A product with this SKU already exists", code="DUPLICATE_SKU")
    if "barcode" in message:
        return ApiError(
            409, "A product with this barcode already exists", code="DUPLICATE_BARCODE"
        )
    return ApiError(409, "Product already exists", code="DUPLICATE_PRODUCT")


def _build_where(
    *,
    q: str | None,
    category: str | None,
    subcategory: str | None,
    brand: str | None,
    barcode: str | None,
    sku: str | None,
    is_active: bool | None,
    include_inactive: bool,
) -> tuple[str, list[Any]]:
    where: list[str] = []
    params: list[Any] = []

    if is_active is not None:
        where.append("p.is_active = ?")
        params.append(1 if is_active else 0)
    elif not include_inactive:
        # POS + catalog default: inactive products are hidden.
        where.append("p.is_active = 1")

    if category:
        where.append("p.category_id = ?")
        params.append(category)
    if subcategory:
        where.append("p.subcategory = ?")
        params.append(subcategory)
    if brand:
        where.append("p.brand = ?")
        params.append(brand)
    if barcode:
        # Exact match — this is the fast path a future scanner will hit.
        where.append("p.barcode = ?")
        params.append(barcode.strip())
    if sku:
        where.append("p.sku = ?")
        params.append(sku.strip().upper())
    if q:
        like = f"%{q.strip()}%"
        where.append(
            "(p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ? OR p.brand LIKE ?"
            " OR p.subcategory LIKE ?)"
        )
        params += [like, like, like, like, like]

    clause = (" WHERE " + " AND ".join(where)) if where else ""
    return clause, params


def list_products(
    conn: sqlite3.Connection,
    *,
    q: str | None = None,
    category_id: str | None = None,
    subcategory: str | None = None,
    brand: str | None = None,
    barcode: str | None = None,
    sku: str | None = None,
    is_active: bool | None = None,
    page: int = 1,
    page_size: int = 100,
    include_inactive: bool = False,
) -> dict[str, Any]:
    page = max(1, page)
    page_size = max(1, min(page_size, 500))
    clause, params = _build_where(
        q=q,
        category=category_id,
        subcategory=subcategory,
        brand=brand,
        barcode=barcode,
        sku=sku,
        is_active=is_active,
        include_inactive=include_inactive,
    )

    total = int(conn.execute(f"SELECT COUNT(*) FROM products p{clause}", params).fetchone()[0])
    pages = max(1, math.ceil(total / page_size)) if total else 1
    offset = (page - 1) * page_size
    rows = conn.execute(
        f"""
        SELECT {PRODUCT_COLUMNS}{STOCK_COLUMNS}
        FROM products p
        LEFT JOIN inventory i ON i.product_id = p.id
        {clause}
        ORDER BY p.name COLLATE NOCASE
        LIMIT ? OFFSET ?
        """,
        [*params, page_size, offset],
    ).fetchall()
    items = [_decorate(_row_to_dict(r)) for r in rows]
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": pages,
    }


def get_product(conn: sqlite3.Connection, product_id: str) -> dict[str, Any]:
    row = conn.execute(
        f"""
        SELECT {PRODUCT_COLUMNS}{STOCK_COLUMNS}
        FROM products p LEFT JOIN inventory i ON i.product_id = p.id
        WHERE p.id = ?
        """,
        (product_id,),
    ).fetchone()
    if row is None:
        raise ApiError(404, "Product not found", code="PRODUCT_NOT_FOUND")
    return _decorate(_row_to_dict(row))


def create_product(
    conn: sqlite3.Connection,
    data: dict[str, Any],
    *,
    actor_id: str,
    device_id: str | None = None,
) -> dict[str, Any]:
    payload = validate_product_payload(data, partial=False)
    payload.setdefault("subcategory", "")
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
        raise ApiError(
            400, "Selling price must be greater than zero", code="INVALID_PRICE"
        )

    initial_stock = max(0, int(data.get("stock", 0) or 0))
    product_id = new_id()
    now = utcnow_iso()

    # ONE transaction: product row + inventory row + opening movement + audit +
    # outbox either all land or none do.
    with transaction(conn):
        try:
            conn.execute(
                """
                INSERT INTO products(id, sku, barcode, name, brand, category_id,
                                     category, subcategory, unit,
                                     selling_price_paise, purchase_price_paise, mrp_paise,
                                     wholesale_price_paise, gst_rate, hsn_code, image, min_stock,
                                     batch_tracked, is_active, created_at, updated_at,
                                     created_by, updated_by)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    product_id, payload["sku"], payload.get("barcode"), payload["name"],
                    payload["brand"], payload["category_id"], payload["category"],
                    payload["subcategory"], payload["unit"],
                    payload["selling_price_paise"], payload["purchase_price_paise"],
                    payload["mrp_paise"], payload["wholesale_price_paise"], payload["gst_rate"],
                    payload["hsn_code"], payload["image"], payload["min_stock"],
                    payload["batch_tracked"], payload["is_active"], now, now,
                    actor_id, actor_id,
                ),
            )
        except sqlite3.IntegrityError as exc:
            raise _dup_error(exc) from exc

        _ensure_inventory(
            conn, product_id, initial_stock, reorder_level=payload["min_stock"]
        )

        if initial_stock:
            from .inventory_service import record_movement

            movement_id = record_movement(
                conn,
                product_id=product_id,
                movement_type="OPENING_STOCK",
                quantity=initial_stock,
                balance_after=initial_stock,
                reference_type="OPENING",
                reference_id=product_id,
                reason="Opening stock on product creation",
                created_by=actor_id,
            )
            audit(
                conn,
                actor_user_id=actor_id,
                action="OPENING_STOCK",
                entity_type="inventory",
                entity_id=product_id,
                after={"quantity": initial_stock, "movement_id": movement_id},
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
                    "quantity": initial_stock,
                    "after": initial_stock,
                },
            )

        audit(
            conn,
            actor_user_id=actor_id,
            action="PRODUCT_CREATE",
            entity_type="product",
            entity_id=product_id,
            after=_snapshot(payload),
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


def _snapshot(data: dict[str, Any]) -> dict[str, Any]:
    """Audit-safe subset: never echo credential-ish or huge fields."""
    keys = (
        "sku", "barcode", "name", "brand", "category_id", "category",
        "subcategory", "unit", "selling_price_paise", "purchase_price_paise",
        "mrp_paise", "wholesale_price_paise", "gst_rate", "hsn_code",
        "min_stock", "is_active",
    )
    return {k: data[k] for k in keys if k in data}


def update_product(
    conn: sqlite3.Connection,
    product_id: str,
    data: dict[str, Any],
    *,
    actor_id: str,
    device_id: str | None = None,
    full: bool = False,
) -> dict[str, Any]:
    before = conn.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
    if before is None:
        raise ApiError(404, "Product not found", code="PRODUCT_NOT_FOUND")

    payload = validate_product_payload(data, partial=not full)
    if not payload:
        raise ApiError(400, "No valid fields to update", code="NO_FIELDS")
    payload["updated_at"] = utcnow_iso()
    payload["updated_by"] = actor_id

    changed_keys = [k for k in payload if k not in ("updated_at", "updated_by")]

    with transaction(conn):
        sets = ", ".join(f"{k} = ?" for k in payload)
        try:
            conn.execute(
                f"UPDATE products SET {sets} WHERE id = ?",
                [*payload.values(), product_id],
            )
        except sqlite3.IntegrityError as exc:
            raise _dup_error(exc) from exc

        # Canonical low-stock threshold lives on the inventory row; the product
        # master field is the editor. Keep them in lock-step (see PHASE2_BASELINE §3).
        if "min_stock" in payload:
            _ensure_inventory(conn, product_id, 0, reorder_level=payload["min_stock"])

        audit(
            conn,
            actor_user_id=actor_id,
            action="PRODUCT_UPDATE",
            entity_type="product",
            entity_id=product_id,
            before=_snapshot({k: before[k] for k in before.keys()}),
            after=_snapshot(payload),
            device_id=device_id,
        )
        enqueue(
            conn,
            entity_type="product",
            entity_id=product_id,
            operation="UPDATE",
            payload={"product_id": product_id, "changed": sorted(changed_keys)},
        )

    return get_product(conn, product_id)


def set_product_status(
    conn: sqlite3.Connection,
    product_id: str,
    is_active: bool,
    *,
    actor_id: str,
    device_id: str | None = None,
) -> dict[str, Any]:
    """Activate / deactivate. Products are NEVER hard-deleted: sale_lines and
    stock_movements must stay valid forever."""
    before = conn.execute(
        "SELECT is_active FROM products WHERE id = ?", (product_id,)
    ).fetchone()
    if before is None:
        raise ApiError(404, "Product not found", code="PRODUCT_NOT_FOUND")
    if bool(before["is_active"]) == is_active:
        return get_product(conn, product_id)

    with transaction(conn):
        conn.execute(
            "UPDATE products SET is_active = ?, updated_at = ?, updated_by = ? WHERE id = ?",
            (1 if is_active else 0, utcnow_iso(), actor_id, product_id),
        )
        audit(
            conn,
            actor_user_id=actor_id,
            action="PRODUCT_REACTIVATE" if is_active else "PRODUCT_DEACTIVATE",
            entity_type="product",
            entity_id=product_id,
            before={"is_active": before["is_active"]},
            after={"is_active": 1 if is_active else 0},
            device_id=device_id,
        )
        enqueue(
            conn,
            entity_type="product",
            entity_id=product_id,
            operation="UPDATE",
            payload={"product_id": product_id, "is_active": 1 if is_active else 0},
        )
    return get_product(conn, product_id)


def deactivate_product(
    conn: sqlite3.Connection, product_id: str, *, actor_id: str, device_id: str | None = None
) -> dict[str, Any]:
    return set_product_status(
        conn, product_id, False, actor_id=actor_id, device_id=device_id
    )


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


def list_brands(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT brand, COUNT(*) AS item_count
        FROM products WHERE is_active = 1 AND brand != ''
        GROUP BY brand ORDER BY brand COLLATE NOCASE
        """
    ).fetchall()
    return [{"name": r["brand"], "item_count": int(r["item_count"])} for r in rows]


def list_subcategories(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT subcategory, COUNT(*) AS item_count
        FROM products
        WHERE is_active = 1 AND subcategory != ''
        GROUP BY subcategory ORDER BY subcategory COLLATE NOCASE
        """
    ).fetchall()
    return [
        {"name": r["subcategory"], "item_count": int(r["item_count"])}
        for r in rows
    ]
