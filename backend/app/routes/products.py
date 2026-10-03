"""Product catalog routes (STEP 10)."""

from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, Query

from ..dependencies import get_db, require
from ..schemas import ProductCreate, ProductUpdate
from ..services import product_service
from ..utils.api import ok

router = APIRouter(prefix="/products", tags=["products"])


@router.get("")
def list_products(
    q: str | None = Query(default=None, max_length=200),
    category: str | None = Query(default=None, max_length=100),
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
        page=page,
        page_size=page_size,
        include_inactive=include_inactive,
    )
    return ok(result, "Products retrieved")


@router.get("/categories")
def list_categories(
    conn: sqlite3.Connection = Depends(get_db),
    _user: sqlite3.Row = Depends(require("product:read")),
):
    return ok(product_service.list_categories(conn), "Categories retrieved")


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
        conn,
        body.model_dump(),
        actor_id=user["id"],
    )
    conn.commit()
    return ok(product, "Product created")


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
