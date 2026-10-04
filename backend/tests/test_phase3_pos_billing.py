"""Phase 3 — real POS billing.

Covers the Phase 3 contract end to end: product/stock guards, authoritative
pricing, FIXED/PERCENT discounts (line + bill), centralised GST, payment
validation (CASH/UPI/CARD/CREDIT), idempotent checkout, transaction rollback,
receipts, sales history and auth — plus POS product search.

Phase 1 (`test_sales.py`) and Phase 2 (`test_phase2_products_inventory.py`)
must keep passing unchanged; this file only ADDS coverage.
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from conftest import DEVICE_ID, sale_payload


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


# ============================================================ product / POS

def test_active_product_can_be_sold(client, cashier, db):
    response = client.post("/api/sales", json=sale_payload())
    assert response.status_code == 201
    receipt = response.json()["data"]
    assert receipt["sale"]["bill_no"].startswith("INV-")
    assert receipt["sale"]["status"] == "COMPLETED"


def test_inactive_product_cannot_be_sold(client, owner, db):
    toggled = owner.patch("/api/products/prod-2/status", json={"is_active": False})
    assert toggled.status_code == 200

    response = owner.post(
        "/api/sales",
        json=sale_payload(items=[{"product_id": "prod-2", "quantity": 1}]),
    )
    assert response.status_code == 400
    assert response.json()["code"] == "INACTIVE_PRODUCT"
    assert db.execute("SELECT COUNT(*) FROM sales").fetchone()[0] == 0


def test_unknown_product_rejected(client, cashier, db):
    response = client.post(
        "/api/sales",
        json=sale_payload(items=[{"product_id": "prod-nope", "quantity": 1}]),
    )
    assert response.status_code == 404
    assert response.json()["code"] == "PRODUCT_NOT_FOUND"
    assert db.execute("SELECT COUNT(*) FROM sales").fetchone()[0] == 0


def test_invalid_quantity_rejected(client, cashier, db):
    response = client.post(
        "/api/sales",
        json=sale_payload(items=[{"product_id": "prod-1", "quantity": "two"}]),
    )
    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"
    assert db.execute("SELECT COUNT(*) FROM sales").fetchone()[0] == 0


def test_zero_quantity_rejected(client, cashier, db):
    response = client.post(
        "/api/sales",
        json=sale_payload(items=[{"product_id": "prod-1", "quantity": 0}]),
    )
    assert response.status_code == 422
    assert db.execute("SELECT COUNT(*) FROM sales").fetchone()[0] == 0


def test_negative_quantity_rejected(client, cashier, db):
    response = client.post(
        "/api/sales",
        json=sale_payload(items=[{"product_id": "prod-1", "quantity": -3}]),
    )
    assert response.status_code == 422
    assert db.execute("SELECT COUNT(*) FROM sales").fetchone()[0] == 0


# ==================================================================== stock

def test_sufficient_stock_sale_succeeds(client, cashier, db):
    response = client.post(
        "/api/sales",
        json=sale_payload(
            items=[{"product_id": "prod-16", "quantity": 5}], amount_received_paise=10000
        ),
    )
    assert response.status_code == 201


def test_insufficient_stock_rejected(client, cashier, db):
    response = client.post(
        "/api/sales",
        json=sale_payload(items=[{"product_id": "prod-1", "quantity": 60}]),
    )
    assert response.status_code == 409
    body = response.json()
    assert body["code"] == "INSUFFICIENT_STOCK"
    assert "Coca Cola" in body["message"]
    assert db.execute("SELECT COUNT(*) FROM sales").fetchone()[0] == 0


def test_inventory_decreases_correctly(client, cashier, db):
    before = db.execute(
        "SELECT quantity FROM inventory WHERE product_id='prod-1'"
    ).fetchone()["quantity"]
    client.post("/api/sales", json=sale_payload())
    after = db.execute(
        "SELECT quantity FROM inventory WHERE product_id='prod-1'"
    ).fetchone()["quantity"]
    assert after == before - 2


def test_stock_movement_created(client, cashier, db):
    sale_id = client.post("/api/sales", json=sale_payload()).json()["data"]["sale"]["id"]
    movement = db.execute(
        "SELECT * FROM stock_movements WHERE product_id='prod-1'"
    ).fetchone()
    assert movement["movement_type"] == "SALE"
    assert movement["quantity"] == -2
    assert movement["reference_id"] == sale_id
    assert movement["balance_after"] == 46


# ==================================================================== price

def test_server_uses_authoritative_price(client, owner, db):
    assert owner.patch(
        "/api/products/prod-1", json={"selling_price_paise": 5500}
    ).status_code == 200

    response = owner.post(
        "/api/sales",
        json=sale_payload(items=[{"product_id": "prod-1", "quantity": 2,
                                  "unit_price_paise": 4000}],
                          amount_received_paise=20000),
    )
    assert response.status_code == 201
    sale = response.json()["data"]["sale"]
    line = response.json()["data"]["lines"][0]
    assert line["unit_price_paise"] == 5500
    assert sale["subtotal_paise"] == 11000
    assert sale["total_paise"] == 11000


def test_client_cannot_override_price(client, cashier, db):
    response = client.post(
        "/api/sales",
        json=sale_payload(items=[{"product_id": "prod-1", "quantity": 1,
                                  "unit_price_paise": 1}]),
    )
    assert response.status_code == 201
    receipt = response.json()["data"]
    assert receipt["lines"][0]["unit_price_paise"] == 4000
    assert receipt["sale"]["total_paise"] == 4000


def test_price_change_does_not_alter_historical_sale(client, owner, db):
    created = owner.post("/api/sales", json=sale_payload()).json()["data"]
    sale_id = created["sale"]["id"]

    assert owner.patch(
        "/api/products/prod-1", json={"selling_price_paise": 9900}
    ).status_code == 200

    reread = owner.get(f"/api/sales/{sale_id}").json()["data"]
    assert reread["sale"]["subtotal_paise"] == created["sale"]["subtotal_paise"]
    assert reread["lines"][0]["unit_price_paise"] == 4000
    assert reread["lines"][0]["product_name_snapshot"] == "Coca Cola 750ml Bottle"


# =============================================================== discount

def test_fixed_item_discount(client, cashier, db):
    response = client.post(
        "/api/sales",
        json=sale_payload(
            items=[{"product_id": "prod-1", "quantity": 2,
                    "discount": {"type": "FIXED", "value": 500}}],
            amount_received_paise=8000,
        ),
    )
    assert response.status_code == 201, response.text
    receipt = response.json()["data"]
    # 8000 - 500 = 7500 ; GST 28% inclusive -> round(7500*28/128) = 1641
    assert receipt["sale"]["subtotal_paise"] == 8000
    assert receipt["sale"]["discount_paise"] == 500
    assert receipt["sale"]["tax_paise"] == 1641
    assert receipt["sale"]["total_paise"] == 7500
    assert receipt["lines"][0]["discount_paise"] == 500


def test_percentage_item_discount_computed_server_side(client, cashier, db):
    response = client.post(
        "/api/sales",
        json=sale_payload(
            items=[{"product_id": "prod-1", "quantity": 2,
                    "discount": {"type": "PERCENT", "value": 10}}],
            amount_received_paise=8000,
        ),
    )
    assert response.status_code == 201, response.text
    receipt = response.json()["data"]
    # 10% of 8000 = 800 -> line 7200, GST 28% inclusive = 1575
    assert receipt["lines"][0]["discount_paise"] == 800
    assert receipt["sale"]["discount_paise"] == 800
    assert receipt["sale"]["total_paise"] == 7200
    assert receipt["sale"]["tax_paise"] == 1575


def test_fixed_bill_discount(client, cashier, db):
    response = client.post(
        "/api/sales",
        json=sale_payload(
            discount={"type": "FIXED", "value": 500}, amount_received_paise=8000
        ),
    )
    assert response.status_code == 201, response.text
    sale = response.json()["data"]["sale"]
    assert sale["subtotal_paise"] == 8000
    assert sale["discount_paise"] == 500
    assert sale["total_paise"] == 7500
    assert sale["tax_paise"] == 1641


def test_percentage_bill_discount_computed_server_side(client, cashier, db):
    response = client.post(
        "/api/sales",
        json=sale_payload(
            discount={"type": "PERCENT", "value": 5}, amount_received_paise=8000
        ),
    )
    assert response.status_code == 201, response.text
    sale = response.json()["data"]["sale"]
    # 5% of the eligible subtotal (8000) = 400 -> net 7600, GST = 1663
    assert sale["discount_paise"] == 400
    assert sale["total_paise"] == 7600
    assert sale["tax_paise"] == 1663


def test_excessive_discount_rejected(client, cashier, db):
    over_line = client.post(
        "/api/sales",
        json=sale_payload(
            items=[{"product_id": "prod-1", "quantity": 2,
                    "discount": {"type": "FIXED", "value": 90_000}}]
        ),
    )
    assert over_line.status_code == 400
    assert over_line.json()["code"] == "INVALID_DISCOUNT"

    over_percent = client.post(
        "/api/sales",
        json=sale_payload(
            discount={"type": "PERCENT", "value": 500},
            client_sale_id="cs-evil-2",
        ),
    )
    assert over_percent.status_code == 400
    assert over_percent.json()["code"] == "INVALID_DISCOUNT"

    over_bill = client.post(
        "/api/sales",
        json=sale_payload(
            discount={"type": "FIXED", "value": 100_000_000},
            client_sale_id="cs-evil-3",
        ),
    )
    assert over_bill.status_code == 400
    assert over_bill.json()["code"] == "INVALID_DISCOUNT"
    assert db.execute("SELECT COUNT(*) FROM sales").fetchone()[0] == 0


def test_negative_discount_rejected(client, cashier, db):
    negative_spec = client.post(
        "/api/sales",
        json=sale_payload(
            items=[{"product_id": "prod-1", "quantity": 2,
                    "discount": {"type": "FIXED", "value": -100}}]
        ),
    )
    assert negative_spec.status_code == 422

    negative_legacy = client.post(
        "/api/sales",
        json=sale_payload(items=[{"product_id": "prod-1", "quantity": 2,
                                  "discount_paise": -100}]),
    )
    assert negative_legacy.status_code == 422
    assert db.execute("SELECT COUNT(*) FROM sales").fetchone()[0] == 0


# ===================================================================== GST

def test_gst_calculated_correctly(client, cashier, db):
    response = client.post(
        "/api/sales",
        json=sale_payload(
            items=[{"product_id": "prod-4", "quantity": 1}],
            amount_received_paise=5000,
        ),
    )
    assert response.status_code == 201
    receipt = response.json()["data"]
    line = receipt["lines"][0]
    # ₹35 @ 18% inclusive: tax = round(3500*18/118) = 534, taxable = 2966
    assert line["tax_paise"] == 534
    assert line["line_total_paise"] - line["tax_paise"] == 2966
    assert receipt["sale"]["tax_paise"] == 534
    assert receipt["cgst_paise"] + receipt["sgst_paise"] == 534
    assert receipt["sale"]["total_paise"] == 3500


def test_client_cannot_override_tax(client, cashier, db):
    response = client.post(
        "/api/sales",
        json=sale_payload(tax_paise=1, total_paise=1, subtotal_paise=1),
    )
    # Unknown fields are refused outright — the server computes every total.
    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"
    assert db.execute("SELECT COUNT(*) FROM sales").fetchone()[0] == 0


def test_final_total_correct(client, cashier, db):
    response = client.post(
        "/api/sales",
        json=sale_payload(
            items=[
                {"product_id": "prod-1", "quantity": 2,
                 "discount": {"type": "PERCENT", "value": 5}},
                {"product_id": "prod-16", "quantity": 3},
            ],
            discount={"type": "FIXED", "value": 100},
            amount_received_paise=20000,
        ),
    )
    assert response.status_code == 201, response.text
    receipt = response.json()["data"]
    sale = receipt["sale"]

    # subtotal = 8000 + 3000 = 11000; line discount 400; bill discount 100
    assert sale["subtotal_paise"] == 11000
    assert sale["discount_paise"] == 500
    net = 11000 - 500                      # 10500, rounded to the nearest rupee
    assert sale["total_paise"] - sale["round_off_paise"] == net
    assert sum(l["line_total_paise"] for l in receipt["lines"]) == net
    assert sum(l["tax_paise"] for l in receipt["lines"]) == sale["tax_paise"]
    # subtotal - discount + tax-inclusive rounding == total
    assert sale["total_paise"] == net + sale["round_off_paise"]


# ================================================================ payment

def test_cash_payment_works(client, cashier, db):
    response = client.post(
        "/api/sales", json=sale_payload(amount_received_paise=10000)
    )
    assert response.status_code == 201
    receipt = response.json()["data"]
    assert receipt["payment"]["payment_method"] == "CASH"
    assert receipt["payment"]["amount_paise"] == 10000


def test_cash_change_calculated_server_side(client, cashier, db):
    response = client.post(
        "/api/sales", json=sale_payload(amount_received_paise=9000)
    )
    assert response.status_code == 201
    receipt = response.json()["data"]
    assert receipt["change_due_paise"] == 1000        # 9000 - 8000
    assert receipt["payment"]["change_paise"] == 1000
    assert receipt["view"]["changeDue"] == 10.0


def test_insufficient_cash_rejected(client, cashier, db):
    response = client.post(
        "/api/sales", json=sale_payload(amount_received_paise=5000)
    )
    assert response.status_code == 400
    assert response.json()["code"] == "INSUFFICIENT_PAYMENT"
    assert db.execute("SELECT COUNT(*) FROM sales").fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM payments").fetchone()[0] == 0


def test_upi_payment_works(client, cashier, db):
    response = client.post(
        "/api/sales",
        json=sale_payload(payment_method="UPI", amount_received_paise=None),
    )
    assert response.status_code == 201, response.text
    receipt = response.json()["data"]
    assert receipt["payment"]["payment_method"] == "UPI"
    assert receipt["payment"]["amount_paise"] == 8000   # server total
    assert receipt["change_due_paise"] == 0


def test_card_payment_works(client, cashier, db):
    response = client.post(
        "/api/sales",
        json=sale_payload(
            payment_method="CARD", payment_reference="TXN-998124",
            amount_received_paise=None,
        ),
    )
    assert response.status_code == 201, response.text
    receipt = response.json()["data"]
    assert receipt["payment"]["payment_method"] == "CARD"
    assert receipt["payment"]["reference"] == "TXN-998124"
    assert receipt["payment"]["amount_paise"] == 8000


def test_credit_requires_customer(client, cashier, db):
    anonymous = client.post(
        "/api/sales",
        json=sale_payload(payment_method="CREDIT", amount_received_paise=None),
    )
    assert anonymous.status_code == 400
    assert anonymous.json()["code"] == "CUSTOMER_REQUIRED_FOR_CREDIT"
    assert db.execute("SELECT COUNT(*) FROM sales").fetchone()[0] == 0

    with_customer = client.post(
        "/api/sales",
        json=sale_payload(
            payment_method="CREDIT",
            customer_id="cust-walkin-1",
            customer_name="Walk-in Customer",
            amount_received_paise=None,
        ),
    )
    assert with_customer.status_code == 201, with_customer.text
    assert with_customer.json()["data"]["sale"]["customer_id"] == "cust-walkin-1"


def test_non_cash_does_not_trust_amount_received(client, cashier, db):
    response = client.post(
        "/api/sales",
        json=sale_payload(payment_method="UPI", amount_received_paise=1),
    )
    assert response.status_code == 400
    assert response.json()["code"] == "PAYMENT_MISMATCH"
    assert db.execute("SELECT COUNT(*) FROM sales").fetchone()[0] == 0


# ============================================================ idempotency

def test_first_checkout_creates_sale(client, cashier, db):
    response = client.post("/api/sales", json=sale_payload())
    assert response.status_code == 201
    assert response.json()["data"]["idempotent"] is False


def test_replay_returns_original_sale(client, cashier, db):
    first = client.post("/api/sales", json=sale_payload())
    replay = client.post("/api/sales", json=sale_payload())
    assert first.status_code == 201
    assert replay.status_code == 200
    assert replay.json()["data"]["idempotent"] is True
    assert replay.json()["data"]["sale"]["id"] == first.json()["data"]["sale"]["id"]
    assert replay.json()["data"]["sale"]["bill_no"] == first.json()["data"]["sale"]["bill_no"]


def test_replay_does_not_deduct_inventory_twice(client, cashier, db):
    client.post("/api/sales", json=sale_payload())
    client.post("/api/sales", json=sale_payload())
    assert (
        db.execute("SELECT quantity FROM inventory WHERE product_id='prod-1'").fetchone()[
            "quantity"
        ]
        == 46
    )
    assert db.execute(
        "SELECT COUNT(*) FROM stock_movements WHERE movement_type='SALE'"
    ).fetchone()[0] == 1


def test_replay_does_not_create_second_payment(client, cashier, db):
    client.post("/api/sales", json=sale_payload())
    client.post("/api/sales", json=sale_payload())
    assert db.execute("SELECT COUNT(*) FROM payments").fetchone()[0] == 1
    assert db.execute("SELECT COUNT(*) FROM sales").fetchone()[0] == 1


def test_replay_does_not_create_second_outbox_event(client, cashier, db):
    client.post("/api/sales", json=sale_payload())
    client.post("/api/sales", json=sale_payload())
    assert db.execute("SELECT COUNT(*) FROM outbox").fetchone()[0] == 1
    assert db.execute("SELECT COUNT(*) FROM audit_log WHERE action='SALE_CREATE'").fetchone()[
        0
    ] == 1


# ============================================================== transaction

def test_failed_payment_rolls_back(client, cashier, db):
    client.post("/api/sales", json=sale_payload(amount_received_paise=100))
    assert db.execute("SELECT COUNT(*) FROM sales").fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM sale_lines").fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM stock_movements").fetchone()[0] == 0
    assert (
        db.execute("SELECT quantity FROM inventory WHERE product_id='prod-1'").fetchone()[
            "quantity"
        ]
        == 48
    )


def test_insufficient_stock_rolls_back(client, cashier, db):
    response = client.post(
        "/api/sales",
        json=sale_payload(
            items=[
                {"product_id": "prod-1", "quantity": 1},
                {"product_id": "prod-13", "quantity": 1},   # 0 in stock
            ]
        ),
    )
    assert response.status_code == 409
    assert db.execute("SELECT COUNT(*) FROM sales").fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM sale_lines").fetchone()[0] == 0
    assert (
        db.execute("SELECT quantity FROM inventory WHERE product_id='prod-1'").fetchone()[
            "quantity"
        ]
        == 48
    )


def test_invalid_discount_rolls_back(client, cashier, db):
    response = client.post(
        "/api/sales",
        json=sale_payload(discount={"type": "FIXED", "value": 999_999}),
    )
    assert response.status_code == 400
    assert db.execute("SELECT COUNT(*) FROM sales").fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM outbox").fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM bill_counters").fetchone()[0] == 0


def test_database_failure_rolls_back(client, cashier, db, monkeypatch):
    from app.database import transaction
    from app.services import sales_service

    def explode(*_args, **_kwargs):
        raise RuntimeError("audit log unavailable")

    monkeypatch.setattr(sales_service, "audit", explode)

    with pytest.raises(RuntimeError):
        with transaction(db):
            sales_service.create_sale(
                db,
                {
                    "client_sale_id": "cs-phase3-rollback",
                    "device_id": DEVICE_ID,
                    "items": [{"product_id": "prod-1", "quantity": 2}],
                    "payment_method": "CASH",
                    "amount_received_paise": 10000,
                },
                actor_id="usr-owner",
            )

    assert db.execute("SELECT COUNT(*) FROM sales").fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM payments").fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM stock_movements").fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM outbox").fetchone()[0] == 0
    assert (
        db.execute("SELECT quantity FROM inventory WHERE product_id='prod-1'").fetchone()[
            "quantity"
        ]
        == 48
    )


# ================================================================ receipt

def test_receipt_contains_sale(client, cashier):
    receipt = client.post("/api/sales", json=sale_payload()).json()["data"]
    sale = receipt["sale"]
    assert sale["id"]
    assert sale["bill_no"].startswith("INV-")
    assert sale["created_at"]
    assert sale["status"] == "COMPLETED"
    assert set(("id", "bill_no", "created_at")) <= set(sale.keys())


def test_receipt_contains_lines(client, cashier):
    receipt = client.post("/api/sales", json=sale_payload()).json()["data"]
    line = receipt["lines"][0]
    assert line["product_id"] == "prod-1"
    assert line["product_name_snapshot"] == "Coca Cola 750ml Bottle"
    assert line["sku_snapshot"] == "BEV-COC-750"
    assert line["quantity"] == 2
    assert line["unit_price_paise"] == 4000
    assert line["gst_rate"] == 28


def test_receipt_contains_payment(client, cashier):
    receipt = client.post(
        "/api/sales", json=sale_payload(amount_received_paise=9000)
    ).json()["data"]
    assert receipt["payment"]["payment_method"] == "CASH"
    assert receipt["payment"]["amount_paise"] == 9000
    assert receipt["payment"]["change_paise"] == 1000


def test_receipt_contains_cashier(client, cashier):
    receipt = client.post("/api/sales", json=sale_payload()).json()["data"]
    assert receipt["cashier_name"] == "Rohan Sharma"


def test_receipt_totals_are_correct(client, cashier):
    receipt = client.post(
        "/api/sales",
        json=sale_payload(
            items=[{"product_id": "prod-1", "quantity": 2,
                    "discount": {"type": "FIXED", "value": 500}}],
            discount={"type": "PERCENT", "value": 10},
            amount_received_paise=8000,
        ),
    ).json()["data"]
    sale = receipt["sale"]
    # subtotal 8000 - line 500 = 7500 eligible; bill 10% = 750; net 6750
    assert sale["subtotal_paise"] == 8000
    assert sale["discount_paise"] == 1250
    assert sale["total_paise"] - sale["round_off_paise"] == 6750
    assert sale["tax_paise"] == sum(l["tax_paise"] for l in receipt["lines"])
    assert receipt["view"]["total"] == sale["total_paise"] / 100


# ================================================================== sales

def test_sales_history_returns_completed_sales(client, cashier):
    client.post("/api/sales", json=sale_payload(client_sale_id="cs-h-1"))
    client.post(
        "/api/sales",
        json=sale_payload(
            client_sale_id="cs-h-2",
            items=[{"product_id": "prod-16", "quantity": 1}],
            amount_received_paise=1000,
        ),
    )
    response = client.get("/api/sales")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["total"] == 2
    assert data["pages"] == 1
    assert all(item["sale"]["status"] == "COMPLETED" for item in data["items"])
    assert all(item["lines"] and item["payment"] for item in data["items"])


def test_sales_history_search_and_date_filters(client, cashier):
    created = client.post("/api/sales", json=sale_payload()).json()["data"]
    bill_no = created["sale"]["bill_no"]

    by_bill = client.get("/api/sales", params={"q": bill_no})
    assert by_bill.json()["data"]["total"] == 1
    assert by_bill.json()["data"]["items"][0]["sale"]["id"] == created["sale"]["id"]

    by_id = client.get("/api/sales", params={"q": created["sale"]["id"]})
    assert by_id.json()["data"]["total"] == 1

    today = client.get(
        "/api/sales", params={"date_from": _today(), "date_to": _today()}
    )
    assert today.json()["data"]["total"] == 1

    empty = client.get("/api/sales", params={"date_from": "2999-01-01"})
    assert empty.json()["data"]["total"] == 0

    bad = client.get("/api/sales", params={"date_from": "04-10-2026"})
    assert bad.status_code == 400


def test_individual_sale_can_be_retrieved(client, cashier):
    created = client.post("/api/sales", json=sale_payload()).json()["data"]
    by_id = client.get(f"/api/sales/{created['sale']['id']}")
    assert by_id.status_code == 200
    assert by_id.json()["data"]["sale"]["bill_no"] == created["sale"]["bill_no"]

    by_bill = client.get(f"/api/sales/{created['sale']['bill_no']}")
    assert by_bill.status_code == 200
    assert by_bill.json()["data"]["sale"]["id"] == created["sale"]["id"]


def test_completed_sale_is_immutable(client, cashier, db):
    created = client.post("/api/sales", json=sale_payload()).json()["data"]
    sale_id = created["sale"]["id"]

    assert client.put(f"/api/sales/{sale_id}", json={}).status_code == 405
    assert client.patch(f"/api/sales/{sale_id}", json={}).status_code == 405
    assert client.delete(f"/api/sales/{sale_id}").status_code == 405

    reread = client.get(f"/api/sales/{sale_id}").json()["data"]
    assert reread["sale"] == created["sale"]


# =================================================================== auth

def test_anonymous_checkout_rejected(client, db):
    response = client.post("/api/sales", json=sale_payload())
    assert response.status_code == 401
    assert db.execute("SELECT COUNT(*) FROM sales").fetchone()[0] == 0


def test_unauthorized_checkout_rejected(client, cashier, db):
    client.cookies.set("yb_session", "not-a-real-session-token")
    response = client.post("/api/sales", json=sale_payload())
    assert response.status_code == 401
    assert db.execute("SELECT COUNT(*) FROM sales").fetchone()[0] == 0


def test_authorized_cashier_can_sell(client, cashier):
    response = client.post("/api/sales", json=sale_payload())
    assert response.status_code == 201


# ======================================================= POS product search

def test_pos_search_by_name_and_sku(client, cashier):
    by_name = client.get("/api/products/search", params={"q": "coca"})
    assert by_name.status_code == 200
    items = by_name.json()["data"]["items"]
    assert [p["id"] for p in items] == ["prod-1"]

    by_sku = client.get("/api/products/search", params={"q": "BEV-COC-750"})
    assert [p["id"] for p in by_sku.json()["data"]["items"]] == ["prod-1"]


def test_pos_search_exact_barcode_lookup(client, cashier):
    response = client.get(
        "/api/products/search", params={"barcode": "8901764012015"}
    )
    items = response.json()["data"]["items"]
    assert len(items) == 1
    assert items[0]["id"] == "prod-1"
    assert items[0]["barcode"] == "8901764012015"
    assert items[0]["is_active"] == 1


def test_pos_search_hides_inactive_products(client, owner):
    owner.patch("/api/products/prod-2/status", json={"is_active": False})
    response = owner.get("/api/products/search", params={"q": "pepsi"})
    assert response.json()["data"]["items"] == []

    by_barcode = owner.get(
        "/api/products/search", params={"barcode": "8902080000049"}
    )
    assert by_barcode.json()["data"]["items"] == []


def test_pos_search_returns_live_stock(client, cashier):
    response = client.get("/api/products/search", params={"q": "coca"})
    item = response.json()["data"]["items"][0]
    assert item["stock"] == 48
    assert item["stock_status"] == "IN_STOCK"
    assert item["selling_price_paise"] == 4000
