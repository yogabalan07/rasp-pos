"""FastAPI dependencies: DB session + session-cookie auth + RBAC (STEP 8).

Authorization is enforced SERVER-SIDE for every mutating route. The frontend
hiding a button is never the security boundary.
"""

from __future__ import annotations

import sqlite3
from typing import Iterator

from fastapi import Depends, Request

from .config import settings
from .database import connect, transaction
from .errors import ApiError
from .services import auth_service

COOKIE_NAME = settings.session_cookie


def get_db() -> Iterator[sqlite3.Connection]:
    """One sqlite3 connection per request, committed/rolled back by FastAPI."""
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def get_optional_user(
    request: Request, conn: sqlite3.Connection = Depends(get_db)
) -> sqlite3.Row | None:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return None
    _session, user = auth_service.fetch_session_user(conn, token)
    return user


def get_current_user(
    request: Request, conn: sqlite3.Connection = Depends(get_db)
) -> sqlite3.Row:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise ApiError(401, "Not authenticated")
    session, user = auth_service.fetch_session_user(conn, token)
    if session is None or user is None:
        raise ApiError(401, "Session expired or invalid")
    auth_service.touch_session(conn, session["id"])
    return user


def device_id_from_request(request: Request) -> str | None:
    return request.headers.get("X-Device-Id") or request.headers.get("x-device-id")


# ------------------------------------------------------- permission matrix

PERMISSIONS: dict[str, set[str]] = {
    # CASHIER: ring up sales, read catalog/inventory, view own receipts.
    # Phase 4: cashiers can *read* the customer directory (the POS customer
    # selector runs under the signed-in cashier) but cannot edit customer or
    # supplier profiles and cannot collect khata payments — money collection
    # is restricted to ADMIN/OWNER so dues cannot be written off at the till.
    "CASHIER": {
        "sale:create",
        "sale:read",
        "product:read",
        "inventory:read",
        "customer:read",
        "supplier:read",
    },
    # ADMIN: everything a cashier can, plus catalog + stock management
    # (product/stock management required ADMIN) + counterparty management.
    "ADMIN": {
        "sale:create", "sale:read", "product:read",
        "product:write", "product:deactivate",
        "inventory:read", "inventory:adjust",
        "stock_audit:read", "outbox:read",
        "customer:read", "customer:write", "customer:payment",
        "supplier:read", "supplier:write",
    },
    # OWNER: everything, including user management + audit trail.
    "OWNER": {
        "sale:create", "sale:read", "sale:void",
        "product:read", "product:write", "product:deactivate",
        "inventory:read", "inventory:adjust",
        "stock_audit:read", "outbox:read", "outbox:retry",
        "audit:read", "user:read", "user:write",
        "customer:read", "customer:write", "customer:payment",
        "supplier:read", "supplier:write",
    },
}


def permissions_for(role: str) -> set[str]:
    return set(PERMISSIONS.get(role, set()))


def require(permission: str):
    """Dependency factory: `Depends(require('product:write'))`."""

    def _checker(user: sqlite3.Row = Depends(get_current_user)) -> sqlite3.Row:
        if permission not in permissions_for(user["role"]):
            raise ApiError(403, f"Permission denied: {permission} required")
        return user

    return _checker
