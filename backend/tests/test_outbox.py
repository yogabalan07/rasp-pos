"""Outbox queue tests (Phase 1: written atomically, NOT yet synced)."""


def test_outbox_empty_at_boot(client, owner):
    response = client.get("/api/outbox")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["items"] == []
    assert data["counts"]["PENDING"] == 0
    assert data["counts"]["total"] == 0


def test_sale_queues_exactly_one_event(client, owner, db):
    client.post("/api/sales", json={
        "client_sale_id": "cs-outbox-1",
        "device_id": "POS-test-device-1",
        "items": [{"product_id": "prod-1", "quantity": 1}],
        "payment_method": "CASH",
        "amount_received_paise": 10000,
    })

    data = client.get("/api/outbox").json()["data"]
    assert data["counts"]["total"] == 1
    assert data["counts"]["PENDING"] == 1

    event = data["items"][0]
    assert event["entity_type"] == "sale"
    assert event["operation"] == "CREATE"
    assert event["status"] == "PENDING"
    assert event["attempts"] == 0
    assert event["last_attempt_at"] is None
    assert event["event_id"]

    # The payload is a real JSON document.
    import json

    payload = json.loads(event["payload_json"])
    assert payload["bill_no"].startswith("INV-")
    assert payload["total_paise"] == 4000


def test_product_and_stock_events_are_queued(admin, db):
    admin.post("/api/products", json={
        "sku": "OBX-1", "name": "Outbox Probe", "selling_price_paise": 1000,
        "gst_rate": 0, "stock": 0,
    })
    admin.post(
        "/api/inventory/prod-1/adjust", json={"delta": 1, "reason": "probe"}
    )

    data = admin.get("/api/outbox").json()["data"]
    types = {item["entity_type"] for item in data["items"]}
    assert types == {"product", "stock_movement"}
    assert data["counts"]["PENDING"] == 2


def test_cashier_cannot_read_outbox(client, cashier):
    assert client.get("/api/outbox").status_code == 403


def test_outbox_filter_by_status(admin):
    admin.post(
        "/api/inventory/prod-1/adjust", json={"delta": 1, "reason": "probe"}
    )
    pending = admin.get("/api/outbox", params={"status": "PENDING"})
    assert pending.status_code == 200
    assert len(pending.json()["data"]["items"]) == 1

    synced = admin.get("/api/outbox", params={"status": "SYNCED"})
    assert synced.json()["data"]["items"] == []


def test_failed_events_can_be_requeued(owner, db):
    db.execute(
        "INSERT INTO outbox(id, event_id, entity_type, entity_id, operation,"
        " payload_json, created_at, attempts, status, last_error)"
        " VALUES('a','ev-1','sale','s1','CREATE','{}','2026-10-03T00:00:00Z',"
        " 3, 'FAILED', 'network down')"
    )
    db.commit()

    assert owner.get("/api/outbox").json()["data"]["counts"]["FAILED"] == 1

    retry = owner.post("/api/outbox/retry")
    assert retry.status_code == 200
    assert retry.json()["data"]["requeued"] == 1

    counts = owner.get("/api/outbox").json()["data"]["counts"]
    assert counts["FAILED"] == 0
    assert counts["PENDING"] == 1


def test_admin_cannot_retry_outbox(admin):
    assert admin.post("/api/outbox/retry").status_code == 403
