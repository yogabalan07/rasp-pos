"""Product catalog routes (Phase 2).

Static sub-resources (`/search`, `/brands`, `/categories`, `/subcategories`)
are declared BEFORE `/{product_id}` so they are never swallowed by the
detail path.
"""

from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, Query

from ..dependencies import get_db, require
from ..schemas import ProductCreate, ProductStatusUpdate, ProductUpdate
from ..services import product_service
from ..utils.api import ok

router = APIRouter(prefix="/products", tags=["products"])


@router.get("")
def list_products(
    q: str | None = Query(default=None, max_length=200),
    category: str | None = Query(default=None, max_length=100),
    subcategory: str | None = Query(default=None, max_length=100),
    brand: str | None = Query(default=None, max_length=100),
    barcode: str | None = Query(default=None, max_length=64),
    sku: str | None = Query(default=None, max_length=64),
    is_active: bool | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=500),
    include_inactive: bool = Query(default=False),
    conn: sqlite3.Connection = Depends(get_db),
    _user: sqlite3.Row = Depends(require("product:read")),
):
    result = product_service.list_products(
        conn,
        q=q,
        category_id=category,
        subcategory=subcategory,
        brand=brand,
        barcode=barcode,
        sku=sku,
        is_active=is_active,
        page=page,
        page_size=page_size,
        include_inactive=include_inactive,
    )
    return ok(result, "Products retrieved")


@router.get("/search")
def search_products(
    q: str | None = Query(default=None, max_length=200),
    barcode: str | None = Query(default=None, max_length=64),
    sku: str | None = Query(default=None, max_length=64),
    category: str | None = Query(default=None, max_length=100),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=500),
    conn: sqlite3.Connection = Depends(get_db),
    _user: sqlite3.Row = Depends(require("product:read")),
):
    """Name / SKU / barcode lookup. A full barcode or SKU is matched exactly."""
    result = product_service.list_products(
        conn,
        q=q,
        barcode=barcode,
        sku=sku,
        category_id=category,
        page=page,
        page_size=page_size,
    )
    return ok(result, "Products retrieved")


@router.get("/categories")
def list_categories(
    conn: sqlite3.Connection = Depends(get_db),
    _user: sqlite3.Row = Depends(require("product:read")),
):
    return ok(product_service.list_categories(conn), "Categories retrieved")


@router.get("/brands")
def list_brands(
    conn: sqlite3.Connection = Depends(get_db),
    _user: sqlite3.Row = Depends(require("product:read")),
):
    return ok(product_service.list_brands(conn), "Brands retrieved")


@router.get("/subcategories")
def list_subcategories(
    conn: sqlite3.Connection = Depends(get_db),
    _user: sqlite3.Row = Depends(require("product:read")),
):
    return ok(product_service.list_subcategories(conn), "Subcategories retrieved")


@router.get("/{product_id}")
def get_product(
    product_id: str,
    conn: sqlite3.Connection = Depends(get_db),
    _user: sqlite3.Row = Depends(require("product:read")),
):
    return ok(product_service.get_product(conn, product_id), "Product retrieved")


@router.post("")
def create_product(
    body: ProductCreate,
    conn: sqlite3.Connection = Depends(get_db),
    user: sqlite3.Row = Depends(require("product:write")),
):
    product = product_service.create_product(
        conn, body.model_dump(), actor_id=user["id"]
    )
    conn.commit()
    return ok(product, "Product created")


@router.put("/{product_id}")
def replace_product(
    product_id: str,
    body: ProductCreate,
    conn: sqlite3.Connection = Depends(get_db),
    user: sqlite3.Row = Depends(require("product:write")),
):
    product = product_service.update_product(
        conn, product_id, body.model_dump(), actor_id=user["id"], full=True
    )
    conn.commit()
    return ok(product, "Product updated")


@router.patch("/{product_id}")
def update_product(
    product_id: str,
    body: ProductUpdate,
    conn: sqlite3.Connection = Depends(get_db),
    user: sqlite3.Row = Depends(require("product:write")),
):
    payload = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    product = product_service.update_product(
        conn, product_id, payload, actor_id=user["id"]
    )
    conn.commit()
    return ok(product, "Product updated")


@router.patch("/{product_id}/status")
def set_product_status(
    product_id: str,
    body: ProductStatusUpdate,
    conn: sqlite3.Connection = Depends(get_db),
    user: sqlite3.Row = Depends(require("product:deactivate")),
):
    product = product_service.set_product_status(
        conn, product_id, body.is_active, actor_id=user["id"]
    )
    conn.commit()
    return ok(product, "Product activated" if body.is_active else "Product deactivated")


@router.delete("/{product_id}")
def deactivate_product(
    product_id: str,
    conn: sqlite3.Connection = Depends(get_db),
    user: sqlite3.Row = Depends(require("product:deactivate")),
):
    product = product_service.deactivate_product(
        conn, product_id, actor_id=user["id"]
    )
    conn.commit()
    return ok(product, "Product deactivated")
