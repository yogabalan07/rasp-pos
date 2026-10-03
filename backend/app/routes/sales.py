"""POS sale routes (STEP 12–15).

The whole sale happens inside ONE `BEGIN IMMEDIATE` transaction so that a
business write and its outbox row are committed together (RULE 3) and stock
can never be double-spent.
"""

from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse

from ..database import transaction
from ..dependencies import device_id_from_request, get_db, require
from ..schemas import CreateSaleRequest
from ..services import sales_service
from ..utils.api import ok

router = APIRouter(prefix="/sales", tags=["sales"])


@router.post("")
def create_sale(
    body: CreateSaleRequest,
    request: Request,
    conn: sqlite3.Connection = Depends(get_db),
    user: sqlite3.Row = Depends(require("sale:create")),
):
    with transaction(conn):
        receipt = sales_service.create_sale(
            conn,
            body.model_dump(),
            actor_id=user["id"],
            device_id_header=device_id_from_request(request),
        )
    conn.commit()
    # 201 = new sale persisted; 200 = idempotent replay of an existing sale.
    status_code = 200 if receipt.get("idempotent") else 201
    message = "Sale already recorded" if receipt.get("idempotent") else "Sale completed"
    return JSONResponse(status_code=status_code, content=ok(receipt, message))


@router.get("")
def list_sales(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    q: str | None = Query(default=None, max_length=200),
    conn: sqlite3.Connection = Depends(get_db),
    _user: sqlite3.Row = Depends(require("sale:read")),
):
    return ok(sales_service.list_sales(conn, page=page, page_size=page_size, q=q),
              "Sales retrieved")


@router.get("/{reference}")
def get_sale(
    reference: str,
    conn: sqlite3.Connection = Depends(get_db),
    _user: sqlite3.Row = Depends(require("sale:read")),
):
    return ok(sales_service.get_sale(conn, reference), "Sale retrieved")
