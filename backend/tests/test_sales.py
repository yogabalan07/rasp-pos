"""Atomic POS sale tests: totals, stock, idempotency, bill numbers, rollback."""

import pytest

from conftest import DEVICE_ID, sale_payload


# ---------------------------------------------------------------- totals

def test_cash_sale_completes(client, cashier, db):
    response = client.post("/api/sales", json=sale_payload())
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["ok"] is True
    receipt = body["data"]
    assert receipt["idempotent"] is False

    sale = receipt["sale"]
    assert sale["subtotal_paise"] == 8000          # 2 x ₹40.00
    assert sale["discount_paise"] == 0
    assert sale["tax_paise"] == 1750               # 8000 * 28 / 128
    assert sale["total_paise"] == 8000
    assert sale["round_off_paise"] == 0
    assert sale["status"] == "COMPLETED"

    assert receipt["cgst_paise"] + receipt["sgst_paise"] == 1750
    assert receipt["payment"]["payment_method"] == "CASH"
    assert receipt["payment"]["amount_paise"] == 10000
    assert receipt["change_due_paise"] == 2000
    assert receipt["view"]["total"] == 80.0
    assert receipt["view"]["amountPaid"] == 100.0
    assert receipt["view"]["changeDue"] == 20.0
    assert receipt["view"]["taxAmount"] == 17.5

    assert sale["bill_no"].startswith("INV-")
    assert len(receipt["lines"]) == 1
    line = receipt["lines"][0]
    assert line["quantity"] == 2
    assert line["unit_price_paise"] == 4000
    assert line["tax_paise"] == 1750
    assert line["line_total_paise"] == 8000
    assert line["product_name_snapshot"] == "Coca Cola 750ml Bottle"
    assert line["sku_snapshot"] == "BEV-COC-750"


def test_sale_decrements_stock_and_writes_ledger(client, cashier, db):
    before = db.execute(
        "SELECT quantity FROM inventory WHERE product_id='prod-1'"
    ).fetchone()["quantity"]
    assert before == 48

    client.post("/api/sales", json=sale_payload())

    after = db.execute(
        "SELECT quantity FROM inventory WHERE product_id='prod-1'"
    ).fetchone()["quantity"]
    assert after == 46

    movement = db.execute(
        "SELECT * FROM stock_movements WHERE product_id='prod-1'"
    ).fetchone()
    assert movement["movement_type"] == "SALE"
    assert movement["quantity"] == -2
    assert movement["balance_after"] == 46
    assert movement["reference_type"] == "SALE"


def test_sale_writes_outbox_and_audit_in_same_transaction(client, cashier, db):
    response = client.post("/api/sales", json=sale_payload())
    sale_id = response.json()["data"]["sale"]["id"]

    outbox = db.execute(
        "SELECT * FROM outbox WHERE entity_type='sale' AND entity_id=?",
        (sale_id,),
    ).fetchone()
    assert outbox is not None
    assert outbox["operation"] == "CREATE"
    assert outbox["status"] == "PENDING"
    assert "bill_no" in outbox["payload_json"]

    audit = db.execute(
        "SELECT * FROM audit_log WHERE action='SALE_CREATE' AND entity_id=?",
        (sale_id,),
    ).fetchone()
    assert audit is not None


def test_partial_cash_payment_rejected(client, cashier, db):
    response = client.post(
        "/api/sales", json=sale_payload(amount_received_paise=5000)
    )
    assert response.status_code == 400
    assert "Insufficient cash" in response.json()["message"]
    assert db.execute("SELECT COUNT(*) FROM sales").fetchone()[0] == 0


def test_upi_payment_must_match_exactly(client, cashier, db):
    under = client.post(
        "/api/sales", json=sale_payload(payment_method="UPI", amount_received_paise=7900)
    )
    assert under.status_code == 400

    exact = client.post(
        "/api/sales", json=sale_payload(payment_method="UPI", amount_received_paise=8000)
    )
    assert exact.status_code == 201

    over = client.post(
        "/api/sales",
        json=sale_payload(
            client_sale_id="cs-other",
            payment_method="UPI",
            amount_received_paise=8100,
        ),
    )
    assert over.status_code == 400


def test_invalid_payment_method_rejected(client, cashier):
    response = client.post(
        "/api/sales", json=sale_payload(payment_method="BITCOIN")
    )
    assert response.status_code == 422


def test_empty_cart_rejected(client, cashier):
    response = client.post(
        "/api/sales", json=sale_payload(items=[], amount_received_paise=0)
    )
    assert response.status_code == 422  # min_items = 1


# ------------------------------------------------------------ idempotency

def test_idempotent_replay_returns_same_sale(client, cashier, db):
    first = client.post("/api/sales", json=sale_payload())
    assert first.status_code == 201
    first_receipt = first.json()["data"]

    replay = client.post("/api/sales", json=sale_payload())
    assert replay.status_code == 200
    second_receipt = replay.json()["data"]

    assert second_receipt["idempotent"] is True
    assert second_receipt["sale"]["id"] == first_receipt["sale"]["id"]
    assert second_receipt["sale"]["bill_no"] == first_receipt["sale"]["bill_no"]

    # Stock deducted exactly once.
    assert (
        db.execute("SELECT quantity FROM inventory WHERE product_id='prod-1'").fetchone()[
            "quantity"
        ]
    ) == 46
    assert db.execute("SELECT COUNT(*) FROM sales").fetchone()[0] == 1
    assert db.execute("SELECT COUNT(*) FROM outbox").fetchone()[0] == 1


def test_different_device_same_client_id_are_distinct_sales(client, cashier, db):
    first = client.post("/api/sales", json=sale_payload())
    second = client.post(
        "/api/sales",
        json=sale_payload(device_id="POS-other-terminal", amount_received_paise=10000),
    )
    assert first.status_code == 201
    assert second.status_code == 201
    assert (
        first.json()["data"]["sale"]["bill_no"]
        != second.json()["data"]["sale"]["bill_no"]
    )
    assert (
        db.execute("SELECT quantity FROM inventory WHERE product_id='prod-1'").fetchone()[
            "quantity"
        ]
    ) == 44


def test_missing_device_id_rejected(client, cashier):
    payload = sale_payload()
    payload.pop("device_id")
    assert client.post("/api/sales", json=payload).status_code == 422


def test_missing_client_sale_id_rejected(client, cashier):
    payload = sale_payload()
    payload.pop("client_sale_id")
    assert client.post("/api/sales", json=payload).status_code == 422


# ----------------------------------------------------------- bill numbers

def test_bill_numbers_are_gapless_and_sequential(client, cashier, db):
    first = client.post(
        "/api/sales", json=sale_payload(client_sale_id="cs-1")
    ).json()["data"]
    second = client.post(
        "/api/sales",
        json=sale_payload(
            client_sale_id="cs-2",
            items=[{"product_id": "prod-9", "quantity": 1}],
            amount_received_paise=10000,
        ),
    ).json()["data"]
    third = client.post(
        "/api/sales",
        json=sale_payload(
            client_sale_id="cs-3",
            items=[{"product_id": "prod-16", "quantity": 3}],
            amount_received_paise=10000,
        ),
    ).json()["data"]

    bills = [first["sale"]["bill_no"], second["sale"]["bill_no"], third["sale"]["bill_no"]]
    assert len(set(bills)) == 3
    assert all(b.startswith("INV-") for b in bills)
    assert all(b.endswith(("-000001", "-000002", "-000003")) for b in bills)

    # Bill numbers are unique across the table.
    assert (
        db.execute("SELECT COUNT(DISTINCT bill_no) FROM sales").fetchone()[0] == 3
    )

    counter = db.execute(
        "SELECT next_value FROM bill_counters"
    ).fetchone()
    assert counter["next_value"] == 4


# ---------------------------------------------------------- failure paths

def test_unknown_product_rolls_back(client, cashier, db):
    response = client.post(
        "/api/sales",
        json=sale_payload(
            items=[{"product_id": "prod-does-not-exist", "quantity": 1}]
        ),
    )
    assert response.status_code == 404
    assert db.execute("SELECT COUNT(*) FROM sales").fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM sale_lines").fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM outbox").fetchone()[0] == 0
    assert (
        db.execute("SELECT quantity FROM inventory WHERE product_id='prod-1'").fetchone()[
            "quantity"
        ]
    ) == 48


def test_insufficient_stock_rolls_back(client, cashier, db):
    """prod-13 has 0 units — the whole request must leave no trace."""
    response = client.post(
        "/api/sales",
        json=sale_payload(
            items=[
                {"product_id": "prod-1", "quantity": 1},
                {"product_id": "prod-13", "quantity": 1},
            ]
        ),
    )
    assert response.status_code == 409
    assert db.execute("SELECT COUNT(*) FROM sales").fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM stock_movements").fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM outbox").fetchone()[0] == 0
    assert (
        db.execute("SELECT quantity FROM inventory WHERE product_id='prod-1'").fetchone()[
            "quantity"
        ]
    ) == 48


def test_oversized_bill_discount_rejected(client, cashier, db):
    response = client.post(
        "/api/sales",
        json=sale_payload(bill_discount_paise=900_00, amount_received_paise=0),
    )
    assert response.status_code == 400
    assert db.execute("SELECT COUNT(*) FROM sales").fetchone()[0] == 0


def test_mid_transaction_failure_rolls_everything_back(client, db, monkeypatch):
    """If the outbox write fails the sale itself must not persist (RULE 3)."""
    from app.database import transaction
    from app.services import sales_service

    def explode(*_args, **_kwargs):
        raise RuntimeError("outbox storage unavailable")

    monkeypatch.setattr(sales_service, "enqueue", explode)

    with pytest.raises(RuntimeError):
        with transaction(db):
            sales_service.create_sale(
                db,
                {
                    "client_sale_id": "cs-rollback",
                    "device_id": DEVICE_ID,
                    "items": [{"product_id": "prod-1", "quantity": 2}],
                    "payment_method": "CASH",
                    "amount_received_paise": 10000,
                },
                actor_id="usr-owner",
            )

    assert db.execute("SELECT COUNT(*) FROM sales").fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM sale_lines").fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM payments").fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM outbox").fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM stock_movements").fetchone()[0] == 0
    assert (
        db.execute("SELECT quantity FROM inventory WHERE product_id='prod-1'").fetchone()[
            "quantity"
        ]
    ) == 48
    # Bill counter must not have been consumed either.
    assert db.execute("SELECT COUNT(*) FROM bill_counters").fetchone()[0] == 0


# --------------------------------------------------------------- receipts

def test_receipt_fetch_by_bill_no(client, cashier):
    created = client.post("/api/sales", json=sale_payload()).json()["data"]
    bill_no = created["sale"]["bill_no"]

    by_bill = client.get(f"/api/sales/{bill_no}")
    assert by_bill.status_code == 200
    assert by_bill.json()["data"]["sale"]["id"] == created["sale"]["id"]

    by_id = client.get(f"/api/sales/{created['sale']['id']}")
    assert by_id.status_code == 200


def test_receipt_of_unknown_sale_404(client, cashier):
    assert client.get("/api/sales/INV-NOPE").status_code == 404


def test_sales_list_returns_rupee_view(client, cashier):
    client.post("/api/sales", json=sale_payload())
    response = client.get("/api/sales")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["total"] == 1
    item = data["items"][0]
    # List rows are full receipts so the UI never has to re-fetch line items.
    assert item["view"]["total"] == 80.0
    assert item["view"]["subtotal"] == 80.0
    assert item["view"]["taxAmount"] == 17.5
    assert item["payment"]["payment_method"] == "CASH"
    assert len(item["lines"]) == 1
    assert item["lines"][0]["product_name_snapshot"] == "Coca Cola 750ml Bottle"


# ----------------------------------------------------------- multi-line GST

def test_multi_line_mixed_gst_sale(client, cashier, db):
    payload = sale_payload(
        items=[
            {"product_id": "prod-4", "quantity": 3, "discount_paise": 250},   # ₹35 @18%
            {"product_id": "prod-9", "quantity": 2, "discount_paise": 0},     # ₹28 @5%
            {"product_id": "prod-16", "quantity": 5, "discount_paise": 0},    # ₹10 @18%
        ],
        bill_discount_paise=500,
        amount_received_paise=25000,
    )
    response = client.post("/api/sales", json=payload)
    assert response.status_code == 201, response.text
    receipt = response.json()["data"]
    sale = receipt["sale"]

    # subtotal = 3*3500 + 2*2800 + 5*1000 = 10500 + 5600 + 5000 = 21100
    assert sale["subtotal_paise"] == 21100
    # total discount = 250 (line) + 500 (bill) = 750
    assert sale["discount_paise"] == 750
    # net = 21100 - 750 = 20350
    assert sale["total_paise"] - sale["round_off_paise"] == 20350

    lines = receipt["lines"]
    assert len(lines) == 3
    assert sum(l["tax_paise"] for l in lines) == sale["tax_paise"]
    assert sum(l["line_total_paise"] for l in lines) == 20350

    # Stock moved for every line.
    for pid, qty in (("prod-4", 3), ("prod-9", 2), ("prod-16", 5)):
        movement = db.execute(
            "SELECT * FROM stock_movements WHERE product_id=?", (pid,)
        ).fetchone()
        assert movement["quantity"] == -qty

    assert db.execute("SELECT COUNT(*) FROM outbox").fetchone()[0] == 1
    assert db.execute("SELECT COUNT(*) FROM sale_lines").fetchone()[0] == 3
