"""Authentication + session routes (STEP 7).

Cookie is HttpOnly, SameSite=Lax, Secure in production. The raw session token
never appears in a response body after login.
"""

from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, Request, Response

from ..config import settings
from ..dependencies import (
    COOKIE_NAME,
    device_id_from_request,
    get_current_user,
    get_db,
    permissions_for,
    require,
)
from ..errors import ApiError
from ..schemas import (
    ChangePasswordRequest,
    LoginRequest,
    PinLoginRequest,
    RegisterRequest,
)
from ..services import auth_service
from ..services.auth_service import utcnow_iso
from ..utils.api import ok

router = APIRouter(prefix="/auth", tags=["auth"])


def _user_payload(user: sqlite3.Row) -> dict:
    return {
        "id": user["id"],
        "username": user["username"],
        "email": user["email"],
        "role": user["role"],
        "displayName": user["display_name"],
        "permissions": sorted(permissions_for(user["role"])),
        "isActive": bool(user["is_active"]),
        "createdAt": user["created_at"],
    }


def _set_session_cookie(response: Response, token: str, request: Request) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=settings.session_ttl_hours * 3600,
        httponly=True,
        samesite=settings.cookie_samesite,
        secure=settings.cookie_secure,
        path="/",
    )


@router.post("/login")
def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    conn: sqlite3.Connection = Depends(get_db),
):
    user = auth_service.authenticate_password(conn, body.identifier, body.password)
    token = auth_service.create_session(
        conn, user["id"], device_id_from_request(request)
    )
    conn.commit()
    _set_session_cookie(response, token, request)
    return ok(_user_payload(user), "Signed in successfully")


@router.post("/login/pin")
def login_with_pin(
    body: PinLoginRequest,
    request: Request,
    response: Response,
    conn: sqlite3.Connection = Depends(get_db),
):
    user = auth_service.authenticate_pin(conn, body.pin)
    token = auth_service.create_session(
        conn, user["id"], device_id_from_request(request)
    )
    conn.commit()
    _set_session_cookie(response, token, request)
    return ok(_user_payload(user), "Signed in successfully")


@router.post("/logout")
def logout(
    request: Request,
    response: Response,
    conn: sqlite3.Connection = Depends(get_db),
):
    token = request.cookies.get(COOKIE_NAME)
    if token:
        auth_service.revoke_session(conn, token)
        conn.commit()
    response.delete_cookie(COOKIE_NAME, path="/")
    return ok(None, "Signed out")


@router.get("/me")
def me(
    request: Request,
    conn: sqlite3.Connection = Depends(get_db),
    user: sqlite3.Row = Depends(get_current_user),
):
    return ok(_user_payload(user), "Session valid")


@router.get("/session")
def session_info(request: Request, conn: sqlite3.Connection = Depends(get_db)):
    """Optional-auth probe: returns null data when nobody is signed in."""
    token = request.cookies.get(COOKIE_NAME)
    _session, user = auth_service.fetch_session_user(conn, token)
    if user is None:
        return ok(None, "No active session")
    return ok(_user_payload(user), "Session valid")


@router.post("/register")
def register(
    body: RegisterRequest,
    conn: sqlite3.Connection = Depends(get_db),
    actor: sqlite3.Row = Depends(require("user:write")),
):
    user = auth_service.create_user(
        conn,
        username=body.username,
        password=body.password,
        display_name=body.display_name,
        role=body.role,
        email=body.email,
        pin=body.pin,
    )
    from ..services.audit_service import record as audit

    audit(
        conn,
        actor_user_id=actor["id"],
        action="USER_CREATE",
        entity_type="user",
        entity_id=user["id"],
        after={"username": user["username"], "role": user["role"]},
    )
    conn.commit()
    return ok(_user_payload(user), "User created")


@router.post("/change-password")
def change_password(
    body: ChangePasswordRequest,
    request: Request,
    response: Response,
    conn: sqlite3.Connection = Depends(get_db),
    user: sqlite3.Row = Depends(get_current_user),
):
    """Change the signed-in user's password, revoke other sessions, re-issue cookie."""
    from ..utils.security import hash_secret, verify_secret

    if not verify_secret(body.current_password, user["password_hash"]):
        raise ApiError(401, "Current password is incorrect")
    conn.execute(
        "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
        (hash_secret(body.new_password), utcnow_iso(), user["id"]),
    )
    auth_service.revoke_all_for_user(conn, user["id"])
    token = auth_service.create_session(conn, user["id"], device_id_from_request(request))
    from ..services.audit_service import record as audit

    audit(
        conn,
        actor_user_id=user["id"],
        action="PASSWORD_CHANGE",
        entity_type="user",
        entity_id=user["id"],
    )
    conn.commit()
    _set_session_cookie(response, token, request)
    return ok(_user_payload(user), "Password updated; other sessions signed out")


@router.get("/users")
def list_users(
    conn: sqlite3.Connection = Depends(get_db),
    actor: sqlite3.Row = Depends(require("user:read")),
):
    rows = conn.execute(
        "SELECT * FROM users ORDER BY created_at"
    ).fetchall()
    return ok([_user_payload(r) for r in rows], "Users retrieved")
