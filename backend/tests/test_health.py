"""Health / status / seeding tests."""


def test_health_ok(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["data"]["status"] == "ok"
    assert body["data"]["database"] == "ok"
    assert body["data"]["phase"] == 4


def test_status_reports_seed_and_schema(client, owner):
    response = client.get("/api/status")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["database"] == "connected"
    assert data["schemaVersion"] == 3
    assert data["users"] == 3
    assert data["products"] == 16
    assert data["journalMode"] == "wal"


def test_seeded_products_are_real_rows(db):
    rows = db.execute(
        "SELECT id, sku, name, selling_price_paise, gst_rate FROM products ORDER BY id"
    ).fetchall()
    assert len(rows) == 16
    assert rows[0]["sku"] == "BEV-COC-750"
    assert rows[0]["selling_price_paise"] == 4000  # ₹40.00 in paise

    inventories = db.execute("SELECT * FROM inventory").fetchall()
    assert len(inventories) == 16
    assert all(r["quantity"] >= 0 for r in inventories)


def test_seeded_users_have_hashes_not_plaintext(db):
    users = db.execute("SELECT username, password_hash, pin_hash, role FROM users").fetchall()
    assert {u["username"] for u in users} == {"owner", "admin", "cashier"}
    for user in users:
        assert user["password_hash"].startswith("scrypt$")
        assert user["pin_hash"].startswith("scrypt$")
        assert "Owner@1234" not in user["password_hash"]
    roles = {u["username"]: u["role"] for u in users}
    assert roles == {"owner": "OWNER", "admin": "ADMIN", "cashier": "CASHIER"}


def test_seeding_is_idempotent(client):
    """Restarting the app must not duplicate seed data."""
    client.get("/api/health")
    client.get("/api/health")
    status = client.get("/api/status").json()["data"]
    assert status["users"] == 3
    assert status["products"] == 16


def test_wal_mode_persisted_on_disk(client):
    from app.config import settings
    from app.database import pragma_status

    info = pragma_status(settings.db_path)
    assert info["journal_mode"] == "wal"
    assert info["foreign_keys"] is True
    assert info["busy_timeout_ms"] > 0
