"""Customer directory + khata routes (Phase 4).

Money collection (`POST /{id}/payments`) requires the `customer:payment`
permission (ADMIN/OWNER); a cashier can still read the directory and be
selected on the POS.
"""

from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse

from ..dependencies import device_id_from_request, get_db, require
from ..schemas import CustomerCreate, CustomerPaymentRequest, CustomerUpdate
from ..services import customer_service
from ..utils.api import ok

router = APIRouter(prefix="/customers", tags=["customers"])


@router.get("")
def list_customers(
    q: str | None = Query(default=None, max_length=200),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=500),
    active: bool | None = Query(default=None),
    has_dues: bool = Query(default=False),
    conn: sqlite3.Connection = Depends(get_db),
    _user: sqlite3.Row = Depends(require("customer:read")),
):
    """Search by name / phone / code / GSTIN / email. `has_dues=true` returns
    only customers with a positive khata balance (server-computed)."""
    result = customer_service.list_customers(
        conn, q=q, page=page, page_size=page_size, active=active, has_dues=has_dues
    )
    return ok(result, "Customers retrieved")


@router.get("/summary")
def customers_summary(
    conn: sqlite3.Connection = Depends(get_db),
    _user: sqlite3.Row = Depends(require("customer:read")),
):
    """Authoritative receivable totals for the whole book.

    SQL computes `total_receivables_paise` / `debtor_count` over every ledger
    row, so the header total never depends on how many rows a list page can
    return. Same permission as `GET /customers` (all roles read the directory).
    """
    return ok(customer_service.customers_summary(conn), "Customer summary retrieved")


@router.post("")
def create_customer(
    body: CustomerCreate,
    request: Request,
    conn: sqlite3.Connection = Depends(get_db),
    user: sqlite3.Row = Depends(require("customer:write")),
):
    customer = customer_service.create_customer(
        conn,
        body.model_dump(),
        actor_id=user["id"],
        device_id=device_id_from_request(request),
    )
    conn.commit()
    return ok(customer, "Customer created")


@router.get("/{customer_id}")
def get_customer(
    customer_id: str,
    conn: sqlite3.Connection = Depends(get_db),
    _user: sqlite3.Row = Depends(require("customer:read")),
):
    return ok(customer_service.get_customer(conn, customer_id), "Customer retrieved")


@router.patch("/{customer_id}")
def update_customer(
    customer_id: str,
    body: CustomerUpdate,
    request: Request,
    conn: sqlite3.Connection = Depends(get_db),
    user: sqlite3.Row = Depends(require("customer:write")),
):
    payload = body.model_dump(exclude_none=True)
    customer = customer_service.update_customer(
        conn,
        customer_id,
        payload,
        actor_id=user["id"],
        device_id=device_id_from_request(request),
    )
    conn.commit()
    return ok(customer, "Customer updated")


@router.get("/{customer_id}/sales")
def list_customer_sales(
    customer_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=200),
    date_from: str | None = Query(default=None, max_length=10),
    date_to: str | None = Query(default=None, max_length=10),
    conn: sqlite3.Connection = Depends(get_db),
    _user: sqlite3.Row = Depends(require("customer:read")),
):
    return ok(
        customer_service.list_customer_sales(
            conn,
            customer_id,
            page=page,
            page_size=page_size,
            date_from=date_from,
            date_to=date_to,
        ),
        "Customer sales retrieved",
    )


@router.get("/{customer_id}/ledger")
def list_customer_ledger(
    customer_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=500),
    date_from: str | None = Query(default=None, max_length=10),
    date_to: str | None = Query(default=None, max_length=10),
    entry_type: str | None = Query(default=None, max_length=20),
    conn: sqlite3.Connection = Depends(get_db),
    _user: sqlite3.Row = Depends(require("customer:read")),
):
    """Append-only khata book, newest first. `balance_after_paise` is the true
    running balance at each entry; `outstanding_paise` is the current balance."""
    return ok(
        customer_service.list_customer_ledger(
            conn,
            customer_id,
            page=page,
            page_size=page_size,
            date_from=date_from,
            date_to=date_to,
            entry_type=entry_type,
        ),
        "Customer ledger retrieved",
    )


@router.post("/{customer_id}/payments")
def collect_payment(
    customer_id: str,
    body: CustomerPaymentRequest,
    request: Request,
    conn: sqlite3.Connection = Depends(get_db),
    user: sqlite3.Row = Depends(require("customer:payment")),
):
    payment = customer_service.collect_payment(
        conn,
        customer_id,
        body.model_dump(),
        actor_id=user["id"],
        device_id=device_id_from_request(request),
    )
    conn.commit()
    # 201 = payment recorded; 200 = idempotent replay of an existing payment.
    status_code = 200 if payment.get("idempotent") else 201
    message = "Payment already recorded" if payment.get("idempotent") else "Payment recorded"
    return JSONResponse(status_code=status_code, content=ok(payment, message))
