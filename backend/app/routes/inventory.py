"""Inventory + stock audit routes (Phase 2).

List endpoints return the raw array in `data` (the shape the existing UI
already consumes) and put pagination/valuation in `meta`, so no consumer
that reads `data` as a list can break.
"""

from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, Query, Request

from ..dependencies import device_id_from_request, get_db, require
from ..errors import ApiError
from ..schemas import OpeningStockRequest, StockAdjustRequest
from ..services import inventory_service
from ..utils.api import ok

router = APIRouter(prefix="/inventory", tags=["inventory"])


def _paged(result: dict, message: str) -> dict:
    meta = {k: v for k, v in result.items() if k != "items"}
    return ok(result["items"], message, meta=meta)


@router.get("")
def list_inventory(
    low_stock_only: bool = Query(default=False),
    q: str | None = Query(default=None, max_length=200),
    category: str | None = Query(default=None, max_length=100),
    stock_status: str | None = Query(default=None, max_length=32),
    is_active: bool | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=500),
    conn: sqlite3.Connection = Depends(get_db),
    _user: sqlite3.Row = Depends(require("inventory:read")),
):
    result = inventory_service.list_inventory(
        conn,
        q=q,
        category=category,
        stock_status_filter=stock_status,
        is_active=is_active,
        low_stock_only=low_stock_only,
        page=page,
        page_size=page_size,
    )
    return _paged(result, "Inventory retrieved")


# NOTE: declared before "/{product_id}" so the path is not swallowed.
@router.get("/movements")
def list_movements(
    product_id: str | None = Query(default=None, max_length=64),
    movement_type: str | None = Query(default=None, max_length=32),
    date_from: str | None = Query(default=None, max_length=40),
    date_to: str | None = Query(default=None, max_length=40),
    page: int = Query(default=1, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=1000),
    limit: int | None = Query(default=None, ge=1, le=1000),
    conn: sqlite3.Connection = Depends(get_db),
    _user: sqlite3.Row = Depends(require("stock_audit:read")),
):
    result = inventory_service.list_movements(
        conn,
        product_id=product_id,
        movement_type=movement_type,
        date_from=date_from,
        date_to=date_to,
        page=page,
        page_size=page_size or limit or 200,
    )
    return _paged(result, "Stock movements retrieved")


@router.get("/{product_id}")
def get_inventory(
    product_id: str,
    conn: sqlite3.Connection = Depends(get_db),
    _user: sqlite3.Row = Depends(require("inventory:read")),
):
    return ok(inventory_service.get_inventory(conn, product_id), "Inventory retrieved")


@router.get("/{product_id}/movements")
def list_product_movements(
    product_id: str,
    movement_type: str | None = Query(default=None, max_length=32),
    date_from: str | None = Query(default=None, max_length=40),
    date_to: str | None = Query(default=None, max_length=40),
    page: int = Query(default=1, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=1000),
    limit: int | None = Query(default=None, ge=1, le=1000),
    conn: sqlite3.Connection = Depends(get_db),
    _user: sqlite3.Row = Depends(require("stock_audit:read")),
):
    result = inventory_service.list_movements(
        conn,
        product_id=product_id,
        movement_type=movement_type,
        date_from=date_from,
        date_to=date_to,
        page=page,
        page_size=page_size or limit or 200,
    )
    return _paged(result, "Stock movements retrieved")


@router.post("/opening-stock")
def set_opening_stock(
    body: OpeningStockRequest,
    request: Request,
    conn: sqlite3.Connection = Depends(get_db),
    user: sqlite3.Row = Depends(require("inventory:adjust")),
):
    if not body.product_id:
        raise ApiError(400, "product_id is required", code="VALIDATION_ERROR")
    return _opening_stock(body.product_id, body, request, conn, user)


@router.post("/{product_id}/opening-stock")
def set_opening_stock_for_product(
    product_id: str,
    body: OpeningStockRequest,
    request: Request,
    conn: sqlite3.Connection = Depends(get_db),
    user: sqlite3.Row = Depends(require("inventory:adjust")),
):
    return _opening_stock(product_id, body, request, conn, user)


def _opening_stock(product_id: str, body, request, conn, user):
    result = inventory_service.set_opening_stock(
        conn,
        product_id,
        quantity=body.quantity,
        reason=body.reason,
        actor_id=user["id"],
        device_id=device_id_from_request(request),
    )
    conn.commit()
    return ok(result, "Opening stock recorded")


@router.post("/{product_id}/adjust")
def adjust_stock(
    product_id: str,
    body: StockAdjustRequest,
    request: Request,
    conn: sqlite3.Connection = Depends(get_db),
    user: sqlite3.Row = Depends(require("inventory:adjust")),
):
    result = inventory_service.adjust_stock(
        conn,
        product_id,
        delta=body.delta,
        reason=body.reason,
        reason_code=body.reason_code,
        actor_id=user["id"],
        device_id=device_id_from_request(request),
    )
    conn.commit()
    return ok(result, "Stock adjusted")
