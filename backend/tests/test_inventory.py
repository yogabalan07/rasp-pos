"""Inventory, stock adjustment and audit ledger tests."""


def test_list_inventory_has_seeded_stock(client, cashier):
    response = client.get("/api/inventory")
    assert response.status_code == 200
    items = response.json()["data"]
    assert len(items) == 16
    coke = next(i for i in items if i["product_id"] == "prod-1")
    assert coke["quantity"] == 48
    assert coke["stock"] == 48
    assert coke["is_low_stock"] is False

    # prod-13 (Colgate) has 0 stock and min_stock 10 -> low.
    toothpaste = next(i for i in items if i["product_id"] == "prod-13")
    assert toothpaste["quantity"] == 0
    assert toothpaste["is_low_stock"] is True


def test_low_stock_filter(client, cashier):
    items = client.get(
        "/api/inventory", params={"low_stock_only": True}
    ).json()["data"]
    ids = {i["product_id"] for i in items}
    assert "prod-13" in ids  # 0 <= 10
    assert "prod-7" in ids  # 5 <= 15
    assert "prod-1" not in ids  # 48 > 15


def test_get_single_inventory(client, cashier):
    data = client.get("/api/inventory/prod-8").json()["data"]
    assert data["quantity"] == 30
    assert data["sku"] == "GRO-AAS-ATT5K"


def test_cashier_cannot_adjust_stock(client, cashier):
    response = client.post(
        "/api/inventory/prod-1/adjust", json={"delta": 5, "reason": "count"}
    )
    assert response.status_code == 403


def test_admin_can_adjust_stock(admin, db):
    response = admin.post(
        "/api/inventory/prod-1/adjust",
        json={"delta": 7, "reason": "Found 7 extra cartons in back room"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["data"]["quantity"] == 55

    movement = db.execute(
        "SELECT * FROM stock_movements WHERE product_id = 'prod-1'"
        " ORDER BY created_at DESC LIMIT 1"
    ).fetchone()
    assert movement["movement_type"] == "ADJUSTMENT"
    assert movement["quantity"] == 7
    assert movement["balance_after"] == 55

    audit = db.execute(
        "SELECT * FROM audit_log WHERE action = 'STOCK_ADJUST'"
    ).fetchone()
    assert audit is not None
    assert audit["entity_id"] == "prod-1"

    outbox = db.execute(
        "SELECT * FROM outbox WHERE entity_type = 'stock_movement'"
    ).fetchall()
    assert len(outbox) == 1
    assert outbox[0]["status"] == "PENDING"


def test_negative_adjustment_allowed(admin, db):
    response = admin.post(
        "/api/inventory/prod-1/adjust", json={"delta": -3, "reason": "damaged"}
    )
    assert response.status_code == 200
    assert response.json()["data"]["quantity"] == 45


def test_adjustment_cannot_go_negative(admin, db):
    response = admin.post(
        "/api/inventory/prod-13/adjust", json={"delta": -1, "reason": "oops"}
    )
    assert response.status_code == 400
    assert "negative" in response.json()["message"]

    # Nothing changed, nothing queued.
    assert (
        db.execute("SELECT quantity FROM inventory WHERE product_id='prod-13'").fetchone()[
            "quantity"
        ]
    ) == 0
    assert (
        db.execute("SELECT COUNT(*) FROM outbox").fetchone()[0]
    ) == 0
    assert db.execute("SELECT COUNT(*) FROM audit_log").fetchone()[0] == 0


def test_zero_delta_rejected(admin):
    response = admin.post(
        "/api/inventory/prod-1/adjust", json={"delta": 0, "reason": "noop"}
    )
    assert response.status_code == 400


def test_movements_ledger(client, cashier):
    admin_login = client.post(
        "/api/auth/login", json={"identifier": "admin", "password": "Admin@1234"}
    )
    assert admin_login.status_code == 200
    client.post(
        "/api/inventory/prod-2/adjust", json={"delta": -4, "reason": "spoilage"}
    )

    response = client.get("/api/inventory/movements", params={"product_id": "prod-2"})
    assert response.status_code == 200
    movements = response.json()["data"]
    assert len(movements) == 1
    assert movements[0]["movement_type"] == "ADJUSTMENT"
    assert movements[0]["quantity"] == -4
    assert movements[0]["product_name"] == "Pepsi 750ml Pet Bottle"
    assert movements[0]["created_by_name"] is not None


def test_movements_require_audit_permission(client, cashier):
    # CASHIER does not have stock_audit:read — only ADMIN/OWNER do.
    assert client.get("/api/inventory/movements").status_code == 403
