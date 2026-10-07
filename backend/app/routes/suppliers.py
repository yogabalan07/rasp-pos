"""Supplier directory + payable ledger routes (Phase 4).

Purchases / PO / GRN are a later phase: only the profile, the payable ledger
reads and a payment primitive land here. The payment primitive is kept
deliberately (it exercises the payable book idempotently) but cannot succeed
until purchases post credit entries - it returns
`400 PAYMENT_EXCEEDS_OUTSTANDING` against the structural ₹0.00 payable.
"""

from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse

from ..dependencies import device_id_from_request, get_db, require
from ..schemas import SupplierCreate, SupplierPaymentRequest, SupplierUpdate
from ..services import supplier_service
from ..utils.api import ok

router = APIRouter(prefix="/suppliers", tags=["suppliers"])


@router.get("")
def list_suppliers(
    q: str | None = Query(default=None, max_length=200),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=500),
    active: bool | None = Query(default=None),
    conn: sqlite3.Connection = Depends(get_db),
    _user: sqlite3.Row = Depends(require("supplier:read")),
):
    return ok(
        supplier_service.list_suppliers(
            conn, q=q, page=page, page_size=page_size, active=active
        ),
        "Suppliers retrieved",
    )


@router.post("")
def create_supplier(
    body: SupplierCreate,
    request: Request,
    conn: sqlite3.Connection = Depends(get_db),
    user: sqlite3.Row = Depends(require("supplier:write")),
):
    supplier = supplier_service.create_supplier(
        conn,
        body.model_dump(),
        actor_id=user["id"],
        device_id=device_id_from_request(request),
    )
    conn.commit()
    return ok(supplier, "Supplier created")


@router.get("/{supplier_id}")
def get_supplier(
    supplier_id: str,
    conn: sqlite3.Connection = Depends(get_db),
    _user: sqlite3.Row = Depends(require("supplier:read")),
):
    return ok(supplier_service.get_supplier(conn, supplier_id), "Supplier retrieved")


@router.patch("/{supplier_id}")
def update_supplier(
    supplier_id: str,
    body: SupplierUpdate,
    request: Request,
    conn: sqlite3.Connection = Depends(get_db),
    user: sqlite3.Row = Depends(require("supplier:write")),
):
    supplier = supplier_service.update_supplier(
        conn,
        supplier_id,
        body.model_dump(exclude_none=True),
        actor_id=user["id"],
        device_id=device_id_from_request(request),
    )
    conn.commit()
    return ok(supplier, "Supplier updated")


@router.get("/{supplier_id}/ledger")
def list_supplier_ledger(
    supplier_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=500),
    date_from: str | None = Query(default=None, max_length=10),
    date_to: str | None = Query(default=None, max_length=10),
    entry_type: str | None = Query(default=None, max_length=20),
    conn: sqlite3.Connection = Depends(get_db),
    _user: sqlite3.Row = Depends(require("supplier:read")),
):
    return ok(
        supplier_service.list_supplier_ledger(
            conn,
            supplier_id,
            page=page,
            page_size=page_size,
            date_from=date_from,
            date_to=date_to,
            entry_type=entry_type,
        ),
        "Supplier ledger retrieved",
    )


@router.post("/{supplier_id}/payments")
def pay_supplier(
    supplier_id: str,
    body: SupplierPaymentRequest,
    request: Request,
    conn: sqlite3.Connection = Depends(get_db),
    user: sqlite3.Row = Depends(require("supplier:write")),
):
    """Future-facing payment primitive (documented in PHASE4.md §3/§7).

    Purchases are not implemented in Phase 4, so a supplier's payable is
    always ₹0.00 and this answers `400 PAYMENT_EXCEEDS_OUTSTANDING` without
    writing anything. No payable is ever faked; the UI hides the button while
    the payable is zero.
    """
    payment = supplier_service.pay_supplier(
        conn,
        supplier_id,
        body.model_dump(),
        actor_id=user["id"],
        device_id=device_id_from_request(request),
    )
    conn.commit()
    status_code = 200 if payment.get("idempotent") else 201
    message = "Payment already recorded" if payment.get("idempotent") else "Payment recorded"
    return JSONResponse(status_code=status_code, content=ok(payment, message))
