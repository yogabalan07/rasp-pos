"""Phase 2 — real products + inventory.

Covers the Phase 2 scenarios: server-driven product list/filters/search,
PUT + status endpoints, subcategory, opening stock, stock status, valuation,
stock movement ledger pagination/filters, atomic adjustments, RBAC and audit.

Phase 1 assertions live in the other test files and must keep passing.
"""

from conftest import sale_payload

NEW = {
    "sku": "P2-COFFEE-250",
    "name": "Phase Two Coffee 250g",
    "brand": "P2Brand",
    "category_id": "cat-bev",
    "category": "Beverages",
    "subcategory": "Coffee",
    "unit": "Pack",
    "selling_price_paise": 24950,
    "purchase_price_paise": 18000,
    "mrp_paise": 26000,
    "gst_rate": 5,
    "hsn_code": "090121",
    "min_stock": 6,
    "stock": 25,
}


# ------------------------------------------------------------------ products

def test_product_list_returns_pages_and_filters(admin):
    body = admin.get("/api/products", params={"page_size": 5}).json()["data"]
    assert body["total"] == 16
    assert body["page"] == 1
    assert body["page_size"] == 5
    assert body["pages"] == 4
    assert len(body["items"]) == 5

    page2 = admin.get(
        "/api/products", params={"page": 2, "page_size": 5}
    ).json()["data"]
    assert len(page2["items"]) == 5
    assert {i["id"] for i in page2["items"]} != {i["id"] for i in body["items"]}


def test_product_filters_subcategory_brand_active(admin):
    assert admin.post("/api/products", json=NEW).status_code == 200

    sub = admin.get("/api/products", params={"subcategory": "Coffee"}).json()["data"]
    assert sub["total"] == 1

    brand = admin.get("/api/products", params={"brand": "P2Brand"}).json()["data"]
    assert brand["total"] == 1

    inactive = admin.get("/api/products", params={"is_active": False}).json()["data"]
    assert inactive["total"] == 0

    exact_sku = admin.get("/api/products", params={"sku": "p2-coffee-250"}).json()[
        "data"
    ]
    assert exact_sku["total"] == 1

    exact_barcode = admin.get(
        "/api/products", params={"barcode": "8901764012015"}
    ).json()["data"]
    assert exact_barcode["total"] == 1


def test_product_search_endpoint(admin):
    r = admin.get("/api/products/search", params={"q": "coca"})
    assert r.status_code == 200
    assert r.json()["data"]["total"] == 1

    by_barcode = admin.get(
        "/api/products/search", params={"barcode": "8901764012015"}
    ).json()["data"]
    assert by_barcode["total"] == 1

    assert admin.get("/api/products/search", params={"q": "zzzz-nope"}).json()[
        "data"
    ]["total"] == 0

    # The static route must not be swallowed by /products/{product_id}.
    assert admin.get("/api/products/search").status_code == 200


def test_product_facet_endpoints(admin):
    brands = {b["name"] for b in admin.get("/api/products/brands").json()["data"]}
    assert {"Coca Cola", "Britannia", "Tata"} <= brands

    counts = {
        b["name"]: b["item_count"]
        for b in admin.get("/api/products/brands").json()["data"]
    }
    assert counts["Coca Cola"] == 1

    assert isinstance(admin.get("/api/products/subcategories").json()["data"], list)

    categories = {c["name"] for c in admin.get("/api/products/categories").json()["data"]}
    assert {"Beverages", "Snacks & Biscuits", "Stationery"} <= categories


def test_product_create_records_opening_stock(admin, db):
    response = admin.post("/api/products", json=NEW)
    assert response.status_code == 200, response.text
    created = response.json()["data"]
    product_id = created["id"]

    assert created["subcategory"] == "Coffee"
    assert created["stock"] == 25
    assert created["stock_status"] == "IN_STOCK"
    assert created["created_by"] is not None
    assert created["updated_by"] is not None

    movement = db.execute(
        "SELECT * FROM stock_movements WHERE product_id = ?", (product_id,)
    ).fetchall()
    assert len(movement) == 1
    assert movement[0]["movement_type"] == "OPENING_STOCK"
    assert movement[0]["quantity"] == 25
    assert movement[0]["balance_after"] == 25

    audit = db.execute(
        "SELECT * FROM audit_log WHERE action = 'OPENING_STOCK' AND entity_id = ?",
        (product_id,),
    ).fetchone()
    assert audit is not None

    # min_stock (product master) must be mirrored into the canonical threshold.
    inv = db.execute(
        "SELECT reorder_level FROM inventory WHERE product_id = ?", (product_id,)
    ).fetchone()
    assert inv["reorder_level"] == 6


def test_product_create_without_stock_writes_no_movement(admin, db):
    body = dict(NEW, sku="P2-ZERO-001", barcode=None, stock=0)
    created = admin.post("/api/products", json=body).json()["data"]
    assert created["stock"] == 0
    assert created["stock_status"] == "OUT_OF_STOCK"
    assert (
        db.execute(
            "SELECT COUNT(*) FROM stock_movements WHERE product_id = ?",
            (created["id"],),
        ).fetchone()[0]
    ) == 0


def test_product_put_full_update(admin):
    product_id = admin.post("/api/products", json=NEW).json()["data"]["id"]

    body = dict(
        NEW,
        name="Phase Two Coffee 500g",
        selling_price_paise=39950,
        subcategory="Instant Coffee",
        min_stock=2,
    )
    body.pop("stock")
    response = admin.put(f"/api/products/{product_id}", json=body)
    assert response.status_code == 200, response.text
    updated = response.json()["data"]
    assert updated["name"] == "Phase Two Coffee 500g"
    assert updated["selling_price_paise"] == 39950
    assert updated["subcategory"] == "Instant Coffee"
    assert updated["min_stock"] == 2
    assert updated["reorder_level"] == 2
    assert updated["updated_by"] is not None

    missing = admin.put("/api/products/nope", json=body)
    assert missing.status_code == 404
    assert missing.json()["code"] == "PRODUCT_NOT_FOUND"


def test_product_patch_only_touches_sent_fields(admin):
    product_id = admin.post("/api/products", json=NEW).json()["data"]["id"]
    response = admin.patch(f"/api/products/{product_id}", json={"brand": "RenamedCo"})
    assert response.status_code == 200
    updated = response.json()["data"]
    assert updated["brand"] == "RenamedCo"
    assert updated["name"] == NEW["name"]
    assert updated["selling_price_paise"] == NEW["selling_price_paise"]
    assert updated["subcategory"] == "Coffee"


def test_product_status_toggle(admin):
    product_id = admin.post("/api/products", json=NEW).json()["data"]["id"]

    off = admin.patch(f"/api/products/{product_id}/status", json={"is_active": False})
    assert off.status_code == 200
    assert off.json()["data"]["is_active"] == 0
    assert (
        admin.get("/api/products", params={"sku": "P2-COFFEE-250"}).json()["data"][
            "total"
        ]
    ) == 0
    assert (
        admin.get(
            "/api/products",
            params={"sku": "P2-COFFEE-250", "include_inactive": True},
        ).json()["data"]["total"]
    ) == 1

    on = admin.patch(f"/api/products/{product_id}/status", json={"is_active": True})
    assert on.status_code == 200
    assert on.json()["data"]["is_active"] == 1

    assert admin.patch("/api/products/nope/status", json={"is_active": False}).status_code == 404


def test_product_error_codes(admin):
    dup_sku = admin.post("/api/products", json=dict(NEW, barcode=None))
    assert dup_sku.status_code == 200
    again = admin.post("/api/products", json=dict(NEW, barcode=None))
    assert again.status_code == 409
    assert again.json()["code"] == "DUPLICATE_SKU"
    assert "SKU" in again.json()["message"]

    bad_gst = admin.post("/api/products", json=dict(NEW, sku="P2-GST-001", gst_rate=15))
    assert bad_gst.status_code == 400
    assert bad_gst.json()["code"] == "INVALID_GST_RATE"

    bad_price = admin.post(
        "/api/products", json=dict(NEW, sku="P2-PRICE-001", selling_price_paise=0)
    )
    assert bad_price.status_code in (400, 422)
    if bad_price.status_code == 400:
        assert bad_price.json()["code"] == "INVALID_PRICE"


def test_duplicate_barcode_code(admin):
    first = admin.post("/api/products", json=dict(NEW, sku="P2-BC-001", barcode="8901234500001"))
    assert first.status_code == 200
    second = admin.post("/api/products", json=dict(NEW, sku="P2-BC-002", barcode="8901234500001"))
    assert second.status_code == 409
    assert second.json()["code"] == "DUPLICATE_BARCODE"


def test_price_change_does_not_rewrite_history(client, cashier, db):
    sale_id = "sale-p2-snap-1"
    response = cashier.post("/api/sales", json=sale_payload(client_sale_id=sale_id))
    assert response.status_code in (200, 201), response.text

    before = db.execute(
        "SELECT unit_price_paise FROM sale_lines WHERE sale_id = (SELECT id FROM sales WHERE client_sale_id = ?)",
        (sale_id,),
    ).fetchone()
    assert before["unit_price_paise"] == 4000

    assert (
        client.post(
            "/api/auth/login",
            json={"identifier": "admin", "password": "Admin@1234"},
        ).status_code
        == 200
    )
    client.patch("/api/products/prod-1", json={"selling_price_paise": 9999})

    after = db.execute(
        "SELECT unit_price_paise FROM sale_lines WHERE sale_id = (SELECT id FROM sales WHERE client_sale_id = ?)",
        (sale_id,),
    ).fetchone()
    assert after["unit_price_paise"] == 4000


def test_cashier_cannot_write_products_or_status(client, cashier):
    assert cashier.post("/api/products", json=NEW).status_code == 403
    assert cashier.put("/api/products/prod-1", json=NEW).status_code == 403
    assert (
        cashier.patch("/api/products/prod-1/status", json={"is_active": False}).status_code
        == 403
    )
    assert cashier.get("/api/products/search", params={"q": "coca"}).status_code == 200


# ----------------------------------------------------------------- inventory

def test_inventory_pagination_and_summary(admin, db):
    response = admin.get("/api/inventory", params={"page_size": 6, "page": 1})
    assert response.status_code == 200
    data = response.json()["data"]
    meta = response.json()["meta"]

    assert isinstance(data, list)
    assert len(data) == 6
    assert meta["total"] == 16
    assert meta["page"] == 1
    assert meta["page_size"] == 6
    assert meta["pages"] == 3

    summary = meta["summary"]
    assert summary["sku_count"] == 16
    expected_units = db.execute("SELECT SUM(quantity) FROM inventory").fetchone()[0]
    assert summary["units"] == expected_units
    expected_cost = db.execute(
        "SELECT SUM(i.quantity * p.purchase_price_paise)"
        " FROM inventory i JOIN products p ON p.id = i.product_id"
        " WHERE p.is_active = 1"
    ).fetchone()[0]
    assert summary["cost_value_paise"] == expected_cost
    assert (
        summary["in_stock"] + summary["low_stock"] + summary["out_of_stock"]
        == summary["sku_count"]
    )


def test_inventory_valuation_is_paise_per_row(admin):
    rows = admin.get("/api/inventory", params={"q": "Coca"}).json()["data"]
    assert len(rows) == 1
    row = rows[0]
    assert row["cost_value_paise"] == row["quantity"] * row["purchase_price_paise"]
    assert row["selling_value_paise"] == row["quantity"] * row["selling_price_paise"]
    assert row["reorder_level"] == 15
    assert row["stock_status"] == "IN_STOCK"
    assert row["is_low_stock"] is False


def test_inventory_stock_status_filter(admin):
    out = admin.get("/api/inventory", params={"stock_status": "OUT_OF_STOCK"}).json()[
        "data"
    ]
    assert any(i["product_id"] == "prod-13" for i in out)

    low = admin.get("/api/inventory", params={"stock_status": "LOW_STOCK"}).json()[
        "data"
    ]
    assert "prod-13" not in {i["product_id"] for i in low}
    assert "prod-7" in {i["product_id"] for i in low}

    in_stock = admin.get("/api/inventory", params={"stock_status": "IN_STOCK"}).json()[
        "data"
    ]
    assert "prod-1" in {i["product_id"] for i in in_stock}
    assert "prod-13" not in {i["product_id"] for i in in_stock}

    bad = admin.get("/api/inventory", params={"stock_status": "SOMETIMES"})
    assert bad.status_code == 400
    assert bad.json()["code"] == "INVALID_STOCK_STATUS"


def test_inventory_search_and_category_filter(admin):
    assert len(admin.get("/api/inventory", params={"q": "pepsi"}).json()["data"]) == 1
    snacks = admin.get("/api/inventory", params={"category": "cat-snk"}).json()["data"]
    assert len(snacks) == 4


def test_inventory_get_includes_status_and_valuation(admin):
    data = admin.get("/api/inventory/prod-8").json()["data"]
    assert data["quantity"] == 30
    assert data["stock_status"] == "IN_STOCK"
    assert data["reorder_level"] is not None
    assert data["cost_value_paise"] == data["quantity"] * data["purchase_price_paise"]

    assert admin.get("/api/inventory/nope").status_code == 404


def test_stock_status_uses_reorder_level_not_min_stock(admin, db):
    # prod-7: qty 5, reorder_level 15 -> LOW_STOCK.
    row = db.execute(
        "SELECT i.quantity, i.reorder_level, p.min_stock FROM inventory i"
        " JOIN products p ON p.id = i.product_id WHERE i.product_id = 'prod-7'"
    ).fetchone()
    assert row["quantity"] == 5
    assert row["reorder_level"] == row["min_stock"] == 15

    data = admin.get("/api/inventory/prod-7").json()["data"]
    assert data["stock_status"] == "LOW_STOCK"
    assert data["is_low_stock"] is True


def test_opening_stock_via_collection_endpoint(admin, db):
    created = admin.post(
        "/api/products", json=dict(NEW, sku="P2-OPEN-001", barcode=None, stock=0)
    ).json()["data"]
    product_id = created["id"]

    response = admin.post(
        "/api/inventory/opening-stock",
        json={"product_id": product_id, "quantity": 50, "reason": "First count"},
    )
    assert response.status_code == 200, response.text
    result = response.json()["data"]
    assert result["new_quantity"] == 50
    assert result["product"]["stock_status"] == "IN_STOCK"

    movement = db.execute(
        "SELECT * FROM stock_movements WHERE product_id = ?", (product_id,)
    ).fetchall()
    assert len(movement) == 1
    assert movement[0]["movement_type"] == "OPENING_STOCK"
    assert movement[0]["balance_after"] == 50
    assert movement[0]["created_by"] is not None

    assert (
        db.execute(
            "SELECT COUNT(*) FROM audit_log WHERE action = 'OPENING_STOCK'",
        ).fetchone()[0]
        >= 1
    )
    assert (
        db.execute(
            "SELECT COUNT(*) FROM outbox WHERE entity_type = 'stock_movement'"
        ).fetchone()[0]
        >= 1
    )

    again = admin.post(
        "/api/inventory/opening-stock", json={"product_id": product_id, "quantity": 51}
    )
    assert again.status_code == 409
    assert again.json()["code"] == "OPENING_STOCK_ALREADY_SET"


def test_opening_stock_via_product_endpoint(admin):
    created = admin.post(
        "/api/products", json=dict(NEW, sku="P2-OPEN-002", barcode=None, stock=0)
    ).json()["data"]
    response = admin.post(
        f"/api/inventory/{created['id']}/opening-stock", json={"quantity": 12}
    )
    assert response.status_code == 200, response.text
    assert response.json()["data"]["new_quantity"] == 12

    assert admin.post(
        "/api/inventory/opening-stock", json={"quantity": 1}
    ).status_code == 400
    assert admin.post(
        "/api/inventory/opening-stock", json={"product_id": "nope", "quantity": 1}
    ).status_code == 404


def test_opening_stock_requires_permission(client, cashier):
    assert cashier.post(
        "/api/inventory/opening-stock",
        json={"product_id": "prod-1", "quantity": 5},
    ).status_code == 403
    assert cashier.get("/api/inventory").status_code == 200
    assert cashier.get("/api/inventory/prod-1").status_code == 200


def test_adjustment_is_atomic_and_writes_one_movement(admin, db):
    before = db.execute(
        "SELECT quantity FROM inventory WHERE product_id='prod-1'"
    ).fetchone()["quantity"]

    response = admin.post(
        "/api/inventory/prod-1/adjust",
        json={"delta": 4, "reason": "Cycle count correction"},
    )
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["previous_quantity"] == before
    assert data["adjustment"] == 4
    assert data["new_quantity"] == before + 4

    movement = db.execute(
        "SELECT * FROM stock_movements WHERE product_id='prod-1'"
        " ORDER BY created_at DESC LIMIT 1"
    ).fetchone()
    assert movement["movement_type"] == "ADJUSTMENT"
    assert movement["quantity"] == 4
    assert movement["balance_after"] == before + 4

    stored = db.execute(
        "SELECT quantity FROM inventory WHERE product_id='prod-1'"
    ).fetchone()["quantity"]
    assert stored == before + 4


def test_adjustment_validation_and_rollback(admin, db):
    zero = admin.post(
        "/api/inventory/prod-1/adjust", json={"delta": 0, "reason": "noop"}
    )
    assert zero.status_code == 400
    assert zero.json()["code"] == "INVALID_STOCK_ADJUSTMENT"

    blank = admin.post("/api/inventory/prod-1/adjust", json={"delta": 1, "reason": ""})
    assert blank.status_code == 422

    bad_type = admin.post(
        "/api/inventory/prod-1/adjust",
        json={"delta": 1, "reason": "x", "reason_code": "NOT_A_TYPE"},
    )
    assert bad_type.status_code == 400
    assert bad_type.json()["code"] == "INVALID_MOVEMENT_TYPE"

    negative = admin.post(
        "/api/inventory/prod-13/adjust", json={"delta": -1, "reason": "oops"}
    )
    assert negative.status_code == 400
    assert negative.json()["code"] == "INSUFFICIENT_STOCK"
    assert (
        db.execute("SELECT quantity FROM inventory WHERE product_id='prod-13'").fetchone()[
            "quantity"
        ]
    ) == 0
    assert db.execute("SELECT COUNT(*) FROM stock_movements").fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM audit_log").fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM outbox").fetchone()[0] == 0


def test_adjustment_mutation_leave_nothing_behind(admin, db):
    missing = admin.post(
        "/api/inventory/nope/adjust", json={"delta": 1, "reason": "x"}
    )
    assert missing.status_code == 404
    assert missing.json()["code"] == "INVENTORY_NOT_FOUND"
    assert db.execute("SELECT COUNT(*) FROM audit_log").fetchone()[0] == 0


# ----------------------------------------------------------------- movements

def test_movement_ledger_pagination_and_filters(admin):
    for delta in (-1, 2, -3, 4, -5):
        assert (
            admin.post(
                "/api/inventory/prod-1/adjust", json={"delta": delta, "reason": "count"}
            ).status_code
            == 200
        )

    all_rows = admin.get("/api/inventory/movements").json()["data"]
    assert len(all_rows) == 5

    paged = admin.get("/api/inventory/movements", params={"page_size": 2, "page": 1})
    meta = paged.json()["meta"]
    assert len(paged.json()["data"]) == 2
    assert meta["total"] == 5
    assert meta["pages"] == 3

    page2 = admin.get("/api/inventory/movements", params={"page_size": 2, "page": 2})
    first_ids = {r["id"] for r in paged.json()["data"]}
    second_ids = {r["id"] for r in page2.json()["data"]}
    assert first_ids and second_ids and not (first_ids & second_ids)

    by_type = admin.get(
        "/api/inventory/movements", params={"movement_type": "ADJUSTMENT"}
    ).json()["data"]
    assert len(by_type) == 5
    assert {r["movement_type"] for r in by_type} == {"ADJUSTMENT"}

    empty = admin.get(
        "/api/inventory/movements", params={"movement_type": "PURCHASE"}
    ).json()["data"]
    assert empty == []

    filtered = admin.get(
        "/api/inventory/movements",
        params={"date_from": "2099-01-01"},
    ).json()["data"]
    assert filtered == []

    limited = admin.get(
        "/api/inventory/movements", params={"product_id": "prod-1", "limit": 2}
    ).json()["data"]
    assert len(limited) == 2
    assert {r["product_id"] for r in limited} == {"prod-1"}


def test_product_scoped_movements_endpoint(client, db):
    assert (
        client.post(
            "/api/auth/login",
            json={"identifier": "admin", "password": "Admin@1234"},
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/inventory/prod-2/adjust", json={"delta": -2, "reason": "spoilage"}
        ).status_code
        == 200
    )
    response = client.get("/api/inventory/prod-2/movements")
    assert response.status_code == 200
    rows = response.json()["data"]
    assert len(rows) == 1
    assert rows[0]["previous_balance"] == rows[0]["balance_after"] - rows[0]["quantity"]
    assert rows[0]["created_by_name"] is not None

    assert (
        client.post(
            "/api/auth/login",
            json={"identifier": "cashier", "password": "Cashier@1234"},
        ).status_code
        == 200
    )
    assert client.get("/api/inventory/prod-2/movements").status_code == 403
    assert client.get("/api/inventory/movements").status_code == 403


def test_seeded_products_have_no_movement_history(db):
    """Seeded demo stock is inserted directly — documented honestly, not faked."""
    assert db.execute("SELECT COUNT(*) FROM stock_movements").fetchone()[0] == 0


def test_pos_sale_still_works_after_phase2_changes(client, cashier, db):
    response = cashier.post("/api/sales", json=sale_payload(client_sale_id="cs-p2-1"))
    assert response.status_code in (200, 201), response.text

    inv = db.execute(
        "SELECT quantity FROM inventory WHERE product_id='prod-1'"
    ).fetchone()
    assert inv["quantity"] == 46

    movement = db.execute(
        "SELECT * FROM stock_movements WHERE product_id='prod-1'"
    ).fetchall()
    assert len(movement) == 1
    assert movement[0]["movement_type"] == "SALE"
    assert movement[0]["balance_after"] == 46


def test_sale_failure_leaves_movements_untouched(client, cashier, db):
    response = cashier.post(
        "/api/sales",
        json=sale_payload(
            client_sale_id="cs-p2-bad", items=[{"product_id": "nope", "quantity": 1}]
        ),
    )
    assert response.status_code == 404
    assert db.execute("SELECT COUNT(*) FROM stock_movements").fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM outbox").fetchone()[0] == 0


# ----------------------------------------------------------------- migration

# A real Phase 1 database: no subcategory/created_by/updated_by columns and a
# movement_type CHECK that does not know about OPENING_STOCK.
PHASE1_SCHEMA = """
CREATE TABLE schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO schema_meta(key, value) VALUES('version', '1');

CREATE TABLE products (
    id TEXT PRIMARY KEY,
    sku TEXT NOT NULL UNIQUE,
    barcode TEXT UNIQUE,
    name TEXT NOT NULL,
    brand TEXT DEFAULT '',
    category_id TEXT DEFAULT '',
    category TEXT DEFAULT '',
    unit TEXT DEFAULT 'Piece',
    selling_price_paise INTEGER NOT NULL CHECK (selling_price_paise >= 0),
    purchase_price_paise INTEGER NOT NULL DEFAULT 0,
    mrp_paise INTEGER NOT NULL DEFAULT 0,
    wholesale_price_paise INTEGER NOT NULL DEFAULT 0,
    gst_rate INTEGER NOT NULL DEFAULT 0,
    hsn_code TEXT DEFAULT '',
    image TEXT,
    min_stock INTEGER NOT NULL DEFAULT 0,
    batch_tracked INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE stock_movements (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    movement_type TEXT NOT NULL CHECK (movement_type IN
        ('SALE','PURCHASE','ADJUSTMENT','RETURN')),
    quantity INTEGER NOT NULL,
    reference_type TEXT,
    reference_id TEXT,
    balance_after INTEGER NOT NULL,
    reason TEXT,
    created_at TEXT NOT NULL,
    created_by TEXT
);

INSERT INTO products(id, sku, name, selling_price_paise, created_at, updated_at)
    VALUES('legacy-1', 'LEG-001', 'Legacy Product', 1000, '2026-01-01', '2026-01-01');
INSERT INTO stock_movements(id, product_id, movement_type, quantity,
                            balance_after, created_at)
    VALUES('mv-legacy', 'legacy-1', 'SALE', -2, 8, '2026-01-01T00:00:00Z');
"""


def test_migration_2_upgrades_a_phase1_database(tmp_path):
    from app.database import connect
    from app.db.schema import init_db

    conn = connect(str(tmp_path / "phase1.sqlite3"))
    try:
        conn.executescript(PHASE1_SCHEMA)
        init_db(conn)

        version = conn.execute(
            "SELECT value FROM schema_meta WHERE key='version'"
        ).fetchone()[0]
        assert int(version) == 2

        columns = {r["name"] for r in conn.execute("PRAGMA table_info(products)")}
        assert {"subcategory", "created_by", "updated_by"} <= columns

        # Existing history survives the table rebuild untouched.
        mv = conn.execute(
            "SELECT * FROM stock_movements WHERE id = 'mv-legacy'"
        ).fetchone()
        assert mv is not None
        assert mv["movement_type"] == "SALE"
        assert mv["balance_after"] == 8

        # The widened CHECK accepts OPENING_STOCK, the old one would not.
        conn.execute(
            "INSERT INTO stock_movements(id, product_id, movement_type, quantity,"
            " balance_after, created_at)"
            " VALUES('mv-new', 'legacy-1', 'OPENING_STOCK', 2, 10, '2026-01-02')"
        )

        sql = conn.execute(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='stock_movements'"
        ).fetchone()["sql"]
        assert "OPENING_STOCK" in sql

        # Phase 2 indexes exist only after the columns do.
        names = {
            r["name"]
            for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='index'"
            )
        }
        assert {"idx_products_brand", "idx_products_subcategory"} <= names
    finally:
        conn.close()
