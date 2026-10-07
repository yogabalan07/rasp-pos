"""Session helpers (STEP 9).

Sessions are database rows, so they survive backend process restarts.
Only the SHA-256 hash of the cookie value is persisted.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone

from ..config import settings
from ..errors import ApiError
from ..utils.ids import new_id
from ..utils.security import hash_secret, hash_token, new_session_token, verify_secret


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _iso_plus(hours: int) -> str:
    return (
        (datetime.now(timezone.utc) + timedelta(hours=hours))
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )


def create_session(conn: sqlite3.Connection, user_id: str, device_id: str | None) -> str:
    token = new_session_token()
    conn.execute(
        """
        INSERT INTO sessions(id, user_id, token_hash, created_at, expires_at,
                             last_seen_at, revoked_at, device_id)
        VALUES(?,?,?,?,?,?,NULL,?)
        """,
        (
            new_id(),
            user_id,
            hash_token(token),
            utcnow_iso(),
            _iso_plus(settings.session_ttl_hours),
            utcnow_iso(),
            device_id,
        ),
    )
    return token


def fetch_session_user(conn: sqlite3.Connection, token: str | None):
    """Return (session_row, user_row) for a live session, else (None, None)."""
    if not token:
        return None, None
    row = conn.execute(
        "SELECT * FROM sessions WHERE token_hash = ?", (hash_token(token),)
    ).fetchone()
    if row is None:
        return None, None
    if row["revoked_at"] is not None:
        return None, None
    if row["expires_at"] <= utcnow_iso():
        return None, None
    user = conn.execute("SELECT * FROM users WHERE id = ?", (row["user_id"],)).fetchone()
    if user is None or not user["is_active"]:
        return None, None
    return row, user


def touch_session(conn: sqlite3.Connection, session_id: str) -> None:
    conn.execute(
        "UPDATE sessions SET last_seen_at = ? WHERE id = ?", (utcnow_iso(), session_id)
    )


def revoke_session(conn: sqlite3.Connection, token: str) -> bool:
    cur = conn.execute(
        "UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL",
        (utcnow_iso(), hash_token(token)),
    )
    return cur.rowcount > 0


def revoke_all_for_user(conn: sqlite3.Connection, user_id: str) -> int:
    cur = conn.execute(
        "UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL",
        (utcnow_iso(), user_id),
    )
    return cur.rowcount


# ------------------------------------------------------------------ login

def _dummy_verify() -> None:
    """Constant-ish work when the account does not exist (timing hygiene)."""
    verify_secret("__no_such_user__", hash_secret("warmup"))


def authenticate_password(conn: sqlite3.Connection, identifier: str, password: str):
    identifier = (identifier or "").strip()
    user = conn.execute(
        "SELECT * FROM users WHERE lower(username) = lower(?) OR lower(email) = lower(?)",
        (identifier, identifier),
    ).fetchone()
    if user is None:
        _dummy_verify()
        raise ApiError(401, "Invalid username or password")
    if not verify_secret(password or "", user["password_hash"]):
        raise ApiError(401, "Invalid username or password")
    if not user["is_active"]:
        raise ApiError(403, "Account is disabled")
    return user


def authenticate_pin(conn: sqlite3.Connection, pin: str):
    pin = (pin or "").strip()
    user = conn.execute(
        "SELECT * FROM users WHERE pin_hash IS NOT NULL AND is_active = 1"
    ).fetchall()
    # Verify against every active PIN hash only until one matches; scrypt keeps
    # this bounded (<= 3 users in Phase 1) without leaking which user exists.
    for candidate in user:
        if verify_secret(pin, candidate["pin_hash"]):
            return candidate
    raise ApiError(401, "Invalid Cashier PIN")


def create_user(
    conn: sqlite3.Connection,
    *,
    username: str,
    password: str,
    display_name: str,
    role: str,
    email: str | None = None,
    pin: str | None = None,
):
    if role not in ("OWNER", "ADMIN", "CASHIER"):
        raise ApiError(400, "Invalid role")
    if len(password or "") < 8:
        raise ApiError(400, "Password must be at least 8 characters")
    exists = conn.execute(
        "SELECT 1 FROM users WHERE lower(username) = lower(?)"
        " OR (email IS NOT NULL AND lower(email) = lower(?))",
        (username, (email or "").lower()),
    ).fetchone()
    if exists:
        raise ApiError(409, "Username or email already exists")
    now = utcnow_iso()
    user_id = new_id()
    conn.execute(
        """
        INSERT INTO users(id, username, email, password_hash, role, display_name,
                          pin_hash, is_active, created_at, updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?)
        """,
        (
            user_id,
            username.strip(),
            email.strip() if email else None,
            hash_secret(password),
            role,
            display_name.strip() or username.strip(),
            hash_secret(pin) if pin else None,
            1,
            now,
            now,
        ),
    )
    return conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()


def user_count(conn: sqlite3.Connection) -> int:
    return int(conn.execute("SELECT COUNT(*) FROM users").fetchone()[0])
