"""Shared pytest fixtures.

Each test gets a brand-new SQLite file (created + migrated + seeded by the
app lifespan), so tests never observe each other's writes.
"""

from __future__ import annotations

import os
import sqlite3

import pytest

os.environ.setdefault("YB_ENV", "test")
os.environ.setdefault("YB_SEED_ON_EMPTY", "1")

from fastapi.testclient import TestClient  # noqa: E402

from app.config import settings  # noqa: E402
from app.database import connect  # noqa: E402
from app.main import app  # noqa: E402

SEED_USERS = {
    "owner": ("owner", "Owner@1234"),
    "admin": ("admin", "Admin@1234"),
    "cashier": ("cashier", "Cashier@1234"),
}

DEVICE_ID = "POS-test-device-1"


@pytest.fixture()
def client(tmp_path):
    settings.db_path = str(tmp_path / "yb_test.sqlite3")
    with TestClient(app) as test_client:
        yield test_client
    settings.db_path = ""


@pytest.fixture()
def db(client):
    """Read-only-ish handle onto the same SQLite file the app uses.

    Depends on `client` so the lifespan has already created + seeded the DB.
    """
    conn = connect(settings.db_path)
    try:
        yield conn
    finally:
        conn.close()


def login(client: TestClient, role: str) -> dict:
    identifier, password = SEED_USERS[role]
    response = client.post(
        "/api/auth/login", json={"identifier": identifier, "password": password}
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["ok"] is True
    return body["data"]


@pytest.fixture()
def owner(client):
    login(client, "owner")
    return client


@pytest.fixture()
def admin(client):
    login(client, "admin")
    return client


@pytest.fixture()
def cashier(client):
    login(client, "cashier")
    return client


def sale_payload(**overrides) -> dict:
    payload = {
        "client_sale_id": "cs-test-0001",
        "device_id": DEVICE_ID,
        "items": [
            {"product_id": "prod-1", "quantity": 2, "discount_paise": 0},
        ],
        "payment_method": "CASH",
        "amount_received_paise": 10000,
    }
    payload.update(overrides)
    return payload
