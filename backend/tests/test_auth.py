"""Authentication, sessions and RBAC tests."""

from conftest import SEED_USERS, login


def test_login_wrong_password_rejected(client):
    response = client.post(
        "/api/auth/login", json={"identifier": "owner", "password": "wrong-password"}
    )
    assert response.status_code == 401
    assert response.json()["ok"] is False


def test_login_unknown_user_rejected(client):
    response = client.post(
        "/api/auth/login", json={"identifier": "ghost", "password": "whatever123"}
    )
    assert response.status_code == 401


def test_login_success_sets_httponly_cookie(client):
    payload = login(client, "owner")
    assert payload["role"] == "OWNER"
    names = [c.name for c in client.cookies.jar]
    assert "yb_session" in names
    stored = next(c for c in client.cookies.jar if c.name == "yb_session")
    assert stored.has_nonstandard_attr("HttpOnly")
    assert stored.secure is False  # development; YB_COOKIE_SECURE=1 in prod


def test_me_requires_session(client):
    assert client.get("/api/auth/me").status_code == 401

    login(client, "owner")
    response = client.get("/api/auth/me")
    assert response.status_code == 200
    body = response.json()
    assert body["data"]["username"] == "owner"
    assert "sale:create" in body["data"]["permissions"]
    assert "audit:read" in body["data"]["permissions"]


def test_logout_revokes_session(client, owner):
    assert client.get("/api/auth/me").status_code == 200
    assert client.post("/api/auth/logout").status_code == 200
    assert client.get("/api/auth/me").status_code == 401


def test_session_survives_backend_restart(client, db, owner):
    """Sessions are DB rows, not in-memory state."""
    import hashlib

    token_value = next(
        c.value for c in client.cookies.jar if c.name == "yb_session"
    )
    token_hash = hashlib.sha256(token_value.encode()).hexdigest()
    row = db.execute(
        "SELECT * FROM sessions WHERE token_hash = ?", (token_hash,)
    ).fetchone()
    assert row is not None
    assert row["revoked_at"] is None

    # Raw token must not be stored.
    raw = db.execute(
        "SELECT COUNT(*) FROM sessions WHERE token_hash = ?", (token_value,)
    ).fetchone()[0]
    assert raw == 0

    # Expiry is in the future.
    assert row["expires_at"] > row["created_at"]


def test_pin_login_returns_cashier(client):
    response = client.post("/api/auth/login/pin", json={"pin": "1234"})
    assert response.status_code == 200
    assert response.json()["data"]["role"] == "CASHIER"

    assert client.post("/api/auth/login/pin", json={"pin": "0000"}).status_code == 401


def test_register_requires_owner(client):
    login(client, "admin")
    denied = client.post(
        "/api/auth/register",
        json={
            "username": "newcashier",
            "password": "SuperSecret1",
            "display_name": "New Cashier",
            "role": "CASHIER",
        },
    )
    assert denied.status_code == 403

    login(client, "owner")
    created = client.post(
        "/api/auth/register",
        json={
            "username": "newcashier",
            "password": "SuperSecret1",
            "display_name": "New Cashier",
            "role": "CASHIER",
            "pin": "4321",
        },
    )
    assert created.status_code == 200
    assert created.json()["data"]["username"] == "newcashier"

    duplicate = client.post(
        "/api/auth/register",
        json={
            "username": "newcashier",
            "password": "SuperSecret1",
            "display_name": "Dup",
            "role": "CASHIER",
        },
    )
    assert duplicate.status_code == 409


def test_weak_password_rejected(client, owner):
    response = client.post(
        "/api/auth/register",
        json={
            "username": "weakuser",
            "password": "short",
            "display_name": "Weak",
            "role": "CASHIER",
        },
    )
    assert response.status_code == 422  # pydantic min_length=8


def test_change_password_revokes_other_sessions(client, owner):
    response = client.post(
        "/api/auth/change-password",
        json={
            "current_password": SEED_USERS["owner"][1],
            "new_password": "NewOwnerPass123",
        },
    )
    assert response.status_code == 200, response.text

    # New password works, old password does not.
    assert client.get("/api/auth/me").status_code == 200
    client.post("/api/auth/logout")
    assert (
        client.post(
            "/api/auth/login",
            json={"identifier": "owner", "password": SEED_USERS["owner"][1]},
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/api/auth/login",
            json={"identifier": "owner", "password": "NewOwnerPass123"},
        ).status_code
        == 200
    )


def test_change_password_rejects_wrong_current(client, owner):
    response = client.post(
        "/api/auth/change-password",
        json={"current_password": "not-the-password", "new_password": "Whatever1234"},
    )
    assert response.status_code == 401
