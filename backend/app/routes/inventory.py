"""Inventory + stock audit routes (STEP 11)."""

from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, Query, Request

from ..dependencies import device_id_from_request, get_db, require
from ..schemas import StockAdjustRequest
from ..services import inventory_service
from ..utils.api import ok

router = APIRouter(prefix="/inventory", tags=["inventory"])


@router.get("")
def list_inventory(
    low_stock_only: bool = Query(default=False),
    q: str | None = Query(default=None, max_length=200),
    conn: sqlite3.Connection = Depends(get_db),
    _user: sqlite3.Row = Depends(require("inventory:read")),
):
    return ok(
        inventory_service.list_inventory(conn, low_stock_only=low_stock_only, q=q),
        "Inventory retrieved",
    )


# NOTE: declared before "/{product_id}" so the path is not swallowed.
@router.get("/movements")
def list_movements(
    product_id: str | None = Query(default=None, max_length=64),
    limit: int = Query(default=200, ge=1, le=1000),
    conn: sqlite3.Connection = Depends(get_db),
    _user: sqlite3.Row = Depends(require("stock_audit:read")),
):
    return ok(
        inventory_service.list_movements(conn, product_id=product_id, limit=limit),
        "Stock movements retrieved",
    )


@router.get("/{product_id}")
def get_inventory(
    product_id: str,
    conn: sqlite3.Connection = Depends(get_db),
    _user: sqlite3.Row = Depends(require("inventory:read")),
):
    return ok(inventory_service.get_inventory(conn, product_id), "Inventory retrieved")


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
