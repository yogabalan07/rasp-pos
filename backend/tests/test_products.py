"""Product catalog API tests."""

NEW_PRODUCT = {
    "sku": "TST-NEW-001",
    "name": "Test Harvest Crunch 250g",
    "brand": "TestBrand",
    "category_id": "cat-snk",
    "category": "Snacks & Biscuits",
    "unit": "Pack",
    "selling_price_paise": 9950,
    "purchase_price_paise": 7000,
    "mrp_paise": 10000,
    "gst_rate": 18,
    "hsn_code": "190531",
    "min_stock": 5,
    "stock": 40,
}


def test_list_seeded_products(client, cashier):
    response = client.get("/api/products")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["total"] == 16
    first = next(p for p in data["items"] if p["sku"] == "BEV-COC-750")
    assert first["selling_price_paise"] == 4000
    assert first["stock"] == 48
    assert first["gst_rate"] == 28


def test_product_search_and_category_filter(client, cashier):
    assert client.get("/api/products", params={"q": "coca"}).json()["data"]["total"] == 1
    assert (
        client.get("/api/products", params={"q": "8901764012015"}).json()["data"]["total"]
        == 1
    )
    assert (
        client.get("/api/products", params={"category": "cat-snk"}).json()["data"]["total"]
        == 4
    )


def test_categories_endpoint(client, cashier):
    response = client.get("/api/products/categories")
    assert response.status_code == 200
    names = {c["name"] for c in response.json()["data"]}
    assert "Beverages" in names
    assert "Stationery" in names


def test_cashier_cannot_create_product(client, cashier):
    response = client.post("/api/products", json=NEW_PRODUCT)
    assert response.status_code == 403
    assert "product:write" in response.json()["message"]


def test_admin_can_create_product(admin, db):
    response = admin.post("/api/products", json=NEW_PRODUCT)
    assert response.status_code == 200, response.text
    created = response.json()["data"]
    assert created["sku"] == "TST-NEW-001"
    assert created["selling_price_paise"] == 9950
    assert created["stock"] == 40

    row = db.execute(
        "SELECT * FROM products WHERE sku = 'TST-NEW-001'"
    ).fetchone()
    assert row is not None
    inventory = db.execute(
        "SELECT quantity FROM inventory WHERE product_id = ?", (row["id"],)
    ).fetchone()
    assert inventory["quantity"] == 40

    # Business write must have queued an outbox event in the same transaction.
    outbox = db.execute(
        "SELECT * FROM outbox WHERE entity_type = 'product'"
    ).fetchall()
    assert len(outbox) == 1
    assert outbox[0]["operation"] == "CREATE"
    assert outbox[0]["status"] == "PENDING"

    audit = db.execute(
        "SELECT * FROM audit_log WHERE action = 'PRODUCT_CREATE'"
    ).fetchall()
    assert len(audit) == 1


def test_duplicate_sku_rejected(admin):
    first = admin.post("/api/products", json=NEW_PRODUCT)
    assert first.status_code == 200
    second = admin.post("/api/products", json=NEW_PRODUCT)
    assert second.status_code == 409
    assert "SKU" in second.json()["message"]


def test_duplicate_barcode_rejected(admin):
    body = dict(NEW_PRODUCT, sku="TST-BC-001", barcode="8901234567890")
    assert admin.post("/api/products", json=body).status_code == 200

    body2 = dict(NEW_PRODUCT, sku="TST-BC-002", barcode="8901234567890")
    response = admin.post("/api/products", json=body2)
    assert response.status_code == 409
    assert "barcode" in response.json()["message"].lower()


def test_invalid_gst_rate_rejected(admin):
    body = dict(NEW_PRODUCT, sku="TST-GST-001", gst_rate=15)
    response = admin.post("/api/products", json=body)
    assert response.status_code == 400
    assert "GST" in response.json()["message"]


def test_zero_price_rejected(admin):
    body = dict(NEW_PRODUCT, sku="TST-PRICE-001", selling_price_paise=0)
    response = admin.post("/api/products", json=body)
    assert response.status_code in (400, 422)


def test_update_price_persists_paise(admin, db):
    updated = admin.patch(
        "/api/products/prod-1", json={"selling_price_paise": 4550, "gst_rate": 28}
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["data"]["selling_price_paise"] == 4550

    row = db.execute(
        "SELECT selling_price_paise FROM products WHERE id = 'prod-1'"
    ).fetchone()
    assert row["selling_price_paise"] == 4550

    events = db.execute(
        "SELECT operation FROM outbox WHERE entity_id = 'prod-1'"
    ).fetchall()
    assert any(e["operation"] == "UPDATE" for e in events)


def test_deactivate_hides_product(admin, client):
    response = admin.delete("/api/products/prod-9")
    assert response.status_code == 200
    assert response.json()["data"]["is_active"] == 0

    visible = client.get("/api/products").json()["data"]
    assert all(p["id"] != "prod-9" for p in visible["items"])

    with_inactive = client.get(
        "/api/products", params={"include_inactive": True}
    ).json()["data"]
    assert any(p["id"] == "prod-9" for p in with_inactive["items"])


def test_unknown_product_404(client, cashier):
    assert client.get("/api/products/nope").status_code == 404


def test_get_product_detail(client, cashier):
    response = client.get("/api/products/prod-4")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["name"].startswith("Britannia Good Day")
    assert data["selling_price_paise"] == 3500
    assert data["hsn_code"] == "190531"
