"""Phase 4 — customers, suppliers, khata ledger + payments.

Covers the Phase 4 scenarios end to end:
  * customer/supplier CRUD with server-assigned codes (CUST-0001 / SUPP-0001)
  * search + pagination + active filter on both directories
  * CREDIT sale -> append-only DEBIT ledger entry, credit limit enforced
    server-side (limit 0 == credit disabled), inactive customers blocked
  * khata payments -> CREDIT ledger entry, partial payments, over-payment
    rejected, idempotency key replay-safe (200/`idempotent` vs 201)
  * atomicity: a rejected credit sale writes nothing (sale, stock, ledger,
    outbox and audit all roll back together)
  * no receivable entry for CASH/UPI/CARD sales
  * supplier payable ledger reads + payment primitive (SUPPLIER_INACTIVE)
  * RBAC: read for every role, profile edits + money collection for ADMIN/OWNER

Phase 1-3 assertions live in the other test files and must keep passing.
"""

from __future__ import annotations

import json

from conftest import DEVICE_ID, login, sale_payload

from app.utils.money import MAX_MONEY_PAISE

GSTIN = "29AAAAA0000A1Z5"


def new_customer(admin, **overrides) -> dict:
    payload = {
        "name": "Ramesh Babu",
        "phone": "9845011223",
        "credit_limit_paise": 50000,
    }
    payload.update(overrides)
    response = admin.post("/api/customers", json=payload)
    assert response.status_code == 200, response.text
    return response.json()["data"]


def new_supplier(admin, **overrides) -> dict:
    payload = {
        "name": "Parle Agro Logistics",
        "contact_person": "Suresh Kumar",
        "phone": "9886011223",
    }
    payload.update(overrides)
    response = admin.post("/api/suppliers", json=payload)
    assert response.status_code == 200, response.text
    return response.json()["data"]


def credit_sale(customer_id: str, **overrides) -> dict:
    payload = sale_payload(
        payment_method="CREDIT",
        customer_id=customer_id,
        amount_received_paise=None,
    )
    payload.update(overrides)
    return payload


def ledger_rows(db, customer_id: str):
    return db.execute(
        "SELECT * FROM customer_ledger_entries WHERE customer_id = ?"
        " ORDER BY rowid",
        (customer_id,),
    ).fetchall()


def seed_supplier_payable(db, supplier_id: str, credit_paise: int) -> None:
    """Write the PURCHASE entry the purchases phase will one day post.

    The payable book is real in Phase 4 but only payments can read from it
    until then, so tests seed one credit row directly (never via the API).
    """
    db.execute(
        """
        INSERT INTO supplier_ledger_entries(id, supplier_id, entry_type,
                                            debit_paise, credit_paise,
                                            balance_after_paise, description,
                                            created_at)
        VALUES('sle-seed', ?, 'PURCHASE', 0, ?, ?, 'Seed purchase',
               '2026-10-01T09:00:00+00:00')
        """,
        (supplier_id, credit_paise, credit_paise),
    )


# ---------------------------------------------------------------- customers

def test_create_customer_assigns_code_and_defaults(admin):
    data = new_customer(admin, credit_limit_paise=75000)
    assert data["code"] == "CUST-0001"
    assert data["name"] == "Ramesh Babu"
    assert data["phone"] == "9845011223"
    assert data["credit_limit_paise"] == 75000
    assert data["is_active"] is True
    # Fresh account: no ledger rows, nothing owed, full headroom.
    assert data["outstanding_paise"] == 0
    assert data["available_credit_paise"] == 75000
    assert data["total_credit_sales_paise"] == 0
    assert data["total_payments_paise"] == 0
    assert data["sale_count"] == 0
    assert data["recent_sales"] == []
    assert data["recent_ledger"] == []


def test_customer_codes_increment(admin):
    first = new_customer(admin, name="Asha")
    second = new_customer(admin, name="Vikram")
    assert first["code"] == "CUST-0001"
    assert second["code"] == "CUST-0002"


def test_create_customer_validates_input(admin):
    missing_name = admin.post("/api/customers", json={"phone": "9845011223"})
    assert missing_name.status_code == 422
    assert missing_name.json()["code"] == "VALIDATION_ERROR"

    missing_phone = admin.post("/api/customers", json={"name": "No Phone"})
    assert missing_phone.status_code == 422

    bad_phone = admin.post(
        "/api/customers", json={"name": "Bad Phone", "phone": "123"}
    )
    assert bad_phone.status_code == 400
    assert bad_phone.json()["code"] == "INVALID_PHONE"

    blank_name = admin.post(
        "/api/customers", json={"name": "   ", "phone": "9845011223"}
    )
    assert blank_name.status_code == 400
    assert blank_name.json()["code"] == "INVALID_NAME"

    assert admin.get("/api/customers").json()["data"]["total"] == 0


def test_customer_search_covers_name_phone_code_and_gstin(admin):
    new_customer(admin, name="Gstin Ramesh", phone="9845011223", gstin=GSTIN)
    new_customer(admin, name="Other Person", phone="9777000111")

    by_name = admin.get("/api/customers", params={"q": "gstin ramesh"}).json()["data"]
    assert by_name["total"] == 1
    assert by_name["items"][0]["name"] == "Gstin Ramesh"

    by_phone = admin.get("/api/customers", params={"q": "9777000111"}).json()["data"]
    assert by_phone["total"] == 1
    assert by_phone["items"][0]["name"] == "Other Person"

    by_code = admin.get("/api/customers", params={"q": "CUST-0001"}).json()["data"]
    assert by_code["total"] == 1

    by_gstin = admin.get("/api/customers", params={"q": GSTIN}).json()["data"]
    assert by_gstin["total"] == 1
    assert by_gstin["items"][0]["gstin"] == GSTIN


def test_customer_list_pagination(admin):
    for i in range(3):
        new_customer(admin, name=f"Bulk {i}")
    page = admin.get(
        "/api/customers", params={"page": 2, "page_size": 2}
    ).json()["data"]
    assert page["total"] == 3
    assert page["pages"] == 2
    assert page["page"] == 2
    assert len(page["items"]) == 1


def test_customer_active_filter(admin):
    keep = new_customer(admin, name="Active One")
    drop = new_customer(admin, name="Retired One")

    patched = admin.patch(
        f"/api/customers/{drop['id']}", json={"is_active": False}
    )
    assert patched.status_code == 200
    assert patched.json()["data"]["is_active"] is False

    active_only = admin.get("/api/customers", params={"active": True}).json()["data"]
    assert [c["id"] for c in active_only["items"]] == [keep["id"]]

    inactive_only = admin.get(
        "/api/customers", params={"active": False}
    ).json()["data"]
    assert [c["id"] for c in inactive_only["items"]] == [drop["id"]]


def test_update_customer_patch(admin):
    customer = new_customer(admin)
    response = admin.patch(
        f"/api/customers/{customer['id']}",
        json={"name": "Ramesh Kumar", "credit_limit_paise": 90000, "notes": "VIP"},
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["name"] == "Ramesh Kumar"
    assert data["credit_limit_paise"] == 90000
    assert data["notes"] == "VIP"
    assert data["code"] == customer["code"]  # identity never changes
    assert data["available_credit_paise"] == 90000


def test_outstanding_is_not_editable(admin):
    customer = new_customer(admin)
    response = admin.patch(
        f"/api/customers/{customer['id']}", json={"outstanding_paise": 0}
    )
    # `extra="forbid"` rejects the field outright: balances are derived from
    # ledger rows and can never be written by a client.
    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"


def test_update_unknown_customer_is_404(admin):
    response = admin.patch("/api/customers/cust-does-not-exist", json={"name": "X"})
    assert response.status_code == 404
    assert response.json()["code"] == "CUSTOMER_NOT_FOUND"

    detail = admin.get("/api/customers/cust-does-not-exist")
    assert detail.status_code == 404
    assert detail.json()["code"] == "CUSTOMER_NOT_FOUND"


def test_cashier_can_read_but_not_write_customers(client, cashier):
    assert client.get("/api/customers").status_code == 200

    denied = client.post(
        "/api/customers", json={"name": "Nope", "phone": "9845011223"}
    )
    assert denied.status_code == 403


# ------------------------------------------------------------- credit sales

def test_credit_sale_posts_debit_ledger_entry(admin, db):
    customer = new_customer(admin, credit_limit_paise=50000)

    response = admin.post("/api/sales", json=credit_sale(customer["id"]))
    assert response.status_code == 201, response.text
    receipt = response.json()["data"]
    assert receipt["sale"]["customer_id"] == customer["id"]

    rows = ledger_rows(db, customer["id"])
    assert len(rows) == 1
    entry = rows[0]
    assert entry["entry_type"] == "CREDIT_SALE"
    # 2 x prod-1 @ Rs.40 = Rs.80.00 = 8000 paise, all on credit.
    assert entry["debit_paise"] == 8000
    assert entry["credit_paise"] == 0
    assert entry["balance_after_paise"] == 8000
    assert entry["reference_type"] == "SALE"
    assert entry["reference_id"] == receipt["sale"]["id"]

    detail = admin.get(f"/api/customers/{customer['id']}").json()["data"]
    assert detail["outstanding_paise"] == 8000
    assert detail["available_credit_paise"] == 42000
    assert detail["total_credit_sales_paise"] == 8000
    assert detail["sale_count"] == 1
    assert detail["recent_ledger"][0]["entry_type"] == "CREDIT_SALE"


def test_credit_sale_over_limit_rejected_atomically(admin, db):
    customer = new_customer(admin, credit_limit_paise=50000)
    stock_before = db.execute(
        "SELECT quantity FROM inventory WHERE product_id = 'prod-1'"
    ).fetchone()[0]

    # 20 x Rs.40 = Rs.800 > Rs.500 limit.
    response = admin.post(
        "/api/sales",
        json=credit_sale(customer["id"], items=[{"product_id": "prod-1", "quantity": 20}]),
    )
    assert response.status_code == 409
    assert response.json()["code"] == "CUSTOMER_CREDIT_LIMIT_EXCEEDED"

    # Everything rolls back together: no sale, no stock drop, no ledger row,
    # no outbox event, no audit row.
    assert db.execute("SELECT COUNT(*) FROM sales").fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM sale_lines").fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM payments").fetchone()[0] == 0
    assert db.execute(
        "SELECT COUNT(*) FROM outbox WHERE entity_type = 'sale'"
    ).fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM customer_ledger_entries").fetchone()[0] == 0
    assert db.execute(
        "SELECT COUNT(*) FROM audit_log WHERE action = 'CUSTOMER_CREDIT_SALE'"
    ).fetchone()[0] == 0
    stock_after = db.execute(
        "SELECT quantity FROM inventory WHERE product_id = 'prod-1'"
    ).fetchone()[0]
    assert stock_after == stock_before


def test_credit_disabled_when_limit_is_zero(admin):
    customer = new_customer(admin, credit_limit_paise=0)
    response = admin.post("/api/sales", json=credit_sale(customer["id"]))
    assert response.status_code == 409
    assert response.json()["code"] == "CUSTOMER_CREDIT_LIMIT_EXCEEDED"


def test_inactive_customer_cannot_take_credit(admin):
    customer = new_customer(admin, credit_limit_paise=50000)
    admin.patch(f"/api/customers/{customer['id']}", json={"is_active": False})

    response = admin.post("/api/sales", json=credit_sale(customer["id"]))
    assert response.status_code == 400
    assert response.json()["code"] == "CUSTOMER_INACTIVE"


def test_unknown_customer_cannot_take_credit(admin, db):
    response = admin.post("/api/sales", json=credit_sale("cust-ghost"))
    assert response.status_code == 404
    assert response.json()["code"] == "CUSTOMER_NOT_FOUND"
    assert db.execute("SELECT COUNT(*) FROM sales").fetchone()[0] == 0


def test_cash_sale_with_customer_writes_no_ledger_entry(admin, db):
    customer = new_customer(admin, credit_limit_paise=50000)
    response = admin.post(
        "/api/sales", json=sale_payload(customer_id=customer["id"])
    )
    assert response.status_code == 201, response.text
    assert response.json()["data"]["sale"]["customer_id"] == customer["id"]

    # A paid bill creates NO receivable: cash sales never touch the khata book.
    assert db.execute("SELECT COUNT(*) FROM customer_ledger_entries").fetchone()[0] == 0
    detail = admin.get(f"/api/customers/{customer['id']}").json()["data"]
    assert detail["outstanding_paise"] == 0
    assert detail["sale_count"] == 1


def test_non_credit_sale_accepts_unknown_customer_id(admin, db):
    # Legacy Phase 3 carts may still carry a walk-in id on paid bills; only
    # CREDIT sales demand a real customer row.
    response = admin.post(
        "/api/sales", json=sale_payload(customer_id="cust-walkin-legacy")
    )
    assert response.status_code == 201, response.text
    assert db.execute("SELECT COUNT(*) FROM customer_ledger_entries").fetchone()[0] == 0


def test_credit_headroom_uses_payments(admin):
    customer = new_customer(admin, credit_limit_paise=50000)

    first = admin.post(
        "/api/sales",
        json=credit_sale(customer["id"], items=[{"product_id": "prod-1", "quantity": 10}]),
    )
    assert first.status_code == 201, first.text  # Rs.400 <= Rs.500

    # Rs.400 + Rs.100 > Rs.500 -> rejected.
    over = admin.post(
        "/api/sales",
        json=credit_sale(
            customer["id"],
            items=[{"product_id": "prod-1", "quantity": 3}],
            client_sale_id="cs-over-1",
        ),
    )
    assert over.status_code == 409
    assert over.json()["code"] == "CUSTOMER_CREDIT_LIMIT_EXCEEDED"

    # Paying Rs.300 frees headroom: Rs.100 + Rs.200 <= Rs.500.
    payment = admin.post(
        f"/api/customers/{customer['id']}/payments",
        json={"amount_paise": 30000, "payment_method": "UPI"},
    )
    assert payment.status_code == 201, payment.text

    after_pay = admin.post(
        "/api/sales",
        json=credit_sale(
            customer["id"],
            items=[{"product_id": "prod-1", "quantity": 5}],
            client_sale_id="cs-after-pay-1",
        ),
    )
    assert after_pay.status_code == 201, after_pay.text

    detail = admin.get(f"/api/customers/{customer['id']}").json()["data"]
    # Rs.400 - Rs.300 + Rs.200 = Rs.300.
    assert detail["outstanding_paise"] == 30000


def test_credit_sale_queues_customer_outbox_event(admin, db):
    customer = new_customer(admin, credit_limit_paise=50000)
    response = admin.post("/api/sales", json=credit_sale(customer["id"]))
    sale_id = response.json()["data"]["sale"]["id"]

    rows = db.execute(
        "SELECT entity_type, operation, payload_json FROM outbox"
        " WHERE entity_type = 'customer' AND entity_id = ?"
        " ORDER BY rowid",
        (customer["id"],),
    ).fetchall()
    # CREATE (profile) + UPDATE (credit sale) for the same account.
    assert [r["operation"] for r in rows] == ["CREATE", "UPDATE"]
    payload = json.loads(rows[1]["payload_json"])
    assert payload["event"] == "CUSTOMER_CREDIT_SALE"
    assert payload["sale_id"] == sale_id
    assert payload["debit_paise"] == 8000

    # The sale still queues its own event (Phase 1/3 contract unchanged).
    assert db.execute(
        "SELECT COUNT(*) FROM outbox WHERE entity_type = 'sale'"
    ).fetchone()[0] == 1


def test_credit_sale_writes_audit_row(admin, db):
    customer = new_customer(admin, credit_limit_paise=50000)
    admin.post("/api/sales", json=credit_sale(customer["id"]))

    row = db.execute(
        "SELECT actor_user_id, entity_type, entity_id, after_json"
        " FROM audit_log WHERE action = 'CUSTOMER_CREDIT_SALE'"
    ).fetchone()
    assert row is not None
    assert row["entity_type"] == "customer"
    assert row["entity_id"] == customer["id"]
    after = json.loads(row["after_json"])
    assert after["debit_paise"] == 8000


def test_replayed_credit_sale_does_not_double_post(admin, db):
    customer = new_customer(admin, credit_limit_paise=50000)
    payload = credit_sale(customer["id"])

    first = admin.post("/api/sales", json=payload)
    replay = admin.post("/api/sales", json=payload)
    assert first.status_code == 201
    assert replay.status_code == 200
    assert replay.json()["data"]["idempotent"] is True

    rows = ledger_rows(db, customer["id"])
    assert len(rows) == 1
    detail = admin.get(f"/api/customers/{customer['id']}").json()["data"]
    assert detail["outstanding_paise"] == 8000


# ----------------------------------------------------------------- payments

def test_payment_reduces_outstanding_and_writes_credit_entry(admin, db):
    customer = new_customer(admin, credit_limit_paise=50000)
    admin.post("/api/sales", json=credit_sale(customer["id"]))  # Rs.80 due

    response = admin.post(
        f"/api/customers/{customer['id']}/payments",
        json={
            "amount_paise": 5000,
            "payment_method": "UPI",
            "reference": "UPI-4421",
            "notes": "Part settlement",
        },
    )
    assert response.status_code == 201, response.text
    payment = response.json()["data"]
    assert payment["amount_paise"] == 5000
    assert payment["payment_method"] == "UPI"
    assert payment["outstanding_paise"] == 3000
    assert payment["balance_after_paise"] == 3000
    assert payment["idempotent"] is False

    rows = ledger_rows(db, customer["id"])
    assert [r["entry_type"] for r in rows] == ["CREDIT_SALE", "PAYMENT"]
    assert rows[1]["credit_paise"] == 5000
    assert rows[1]["balance_after_paise"] == 3000
    assert rows[1]["reference_type"] == "CUSTOMER_PAYMENT"
    assert rows[1]["reference_id"] == payment["id"]

    detail = admin.get(f"/api/customers/{customer['id']}").json()["data"]
    assert detail["outstanding_paise"] == 3000
    assert detail["total_payments_paise"] == 5000


def test_payment_idempotent_replay_returns_original(admin, db):
    customer = new_customer(admin, credit_limit_paise=50000)
    admin.post("/api/sales", json=credit_sale(customer["id"]))

    body = {"amount_paise": 2000, "idempotency_key": "pay-key-1"}
    first = admin.post(f"/api/customers/{customer['id']}/payments", json=body)
    replay = admin.post(f"/api/customers/{customer['id']}/payments", json=body)

    assert first.status_code == 201
    assert replay.status_code == 200
    assert replay.json()["data"]["idempotent"] is True
    assert replay.json()["data"]["id"] == first.json()["data"]["id"]

    # Exactly one payment row and one CREDIT entry despite two requests.
    assert db.execute(
        "SELECT COUNT(*) FROM customer_payments WHERE customer_id = ?",
        (customer["id"],),
    ).fetchone()[0] == 1
    types = [r["entry_type"] for r in ledger_rows(db, customer["id"])]
    assert types == ["CREDIT_SALE", "PAYMENT"]
    detail = admin.get(f"/api/customers/{customer['id']}").json()["data"]
    assert detail["outstanding_paise"] == 6000  # 8000 - 2000, not 4000


def test_payment_same_key_different_payload_conflicts(admin):
    customer = new_customer(admin, credit_limit_paise=50000)
    admin.post("/api/sales", json=credit_sale(customer["id"]))

    admin.post(
        f"/api/customers/{customer['id']}/payments",
        json={"amount_paise": 1000, "idempotency_key": "reuse-me"},
    )
    conflicting = admin.post(
        f"/api/customers/{customer['id']}/payments",
        json={"amount_paise": 2000, "idempotency_key": "reuse-me"},
    )
    assert conflicting.status_code == 409
    assert conflicting.json()["code"] == "DUPLICATE_IDEMPOTENCY_KEY"


def test_payment_cannot_exceed_outstanding(admin, db):
    customer = new_customer(admin, credit_limit_paise=50000)
    admin.post("/api/sales", json=credit_sale(customer["id"]))  # Rs.80 due

    response = admin.post(
        f"/api/customers/{customer['id']}/payments", json={"amount_paise": 9000}
    )
    assert response.status_code == 400
    assert response.json()["code"] == "PAYMENT_EXCEEDS_OUTSTANDING"

    # The rejected payment posted nothing.
    assert db.execute(
        "SELECT COUNT(*) FROM customer_payments"
    ).fetchone()[0] == 0
    detail = admin.get(f"/api/customers/{customer['id']}").json()["data"]
    assert detail["outstanding_paise"] == 8000


def test_payment_amount_must_be_positive(admin):
    customer = new_customer(admin, credit_limit_paise=50000)
    admin.post("/api/sales", json=credit_sale(customer["id"]))

    zero = admin.post(
        f"/api/customers/{customer['id']}/payments", json={"amount_paise": 0}
    )
    assert zero.status_code == 400
    assert zero.json()["code"] == "INVALID_PAYMENT_AMOUNT"

    missing = admin.post(f"/api/customers/{customer['id']}/payments", json={})
    assert missing.status_code == 400
    assert missing.json()["code"] == "INVALID_PAYMENT_AMOUNT"

    bad_method = admin.post(
        f"/api/customers/{customer['id']}/payments",
        json={"amount_paise": 100, "payment_method": "CHEQUE"},
    )
    assert bad_method.status_code == 422


def test_payment_for_unknown_customer_is_404(admin):
    response = admin.post(
        "/api/customers/cust-ghost/payments", json={"amount_paise": 100}
    )
    assert response.status_code == 404
    assert response.json()["code"] == "CUSTOMER_NOT_FOUND"


def test_inactive_customer_can_still_pay_dues(admin):
    customer = new_customer(admin, credit_limit_paise=50000)
    admin.post("/api/sales", json=credit_sale(customer["id"]))
    admin.patch(f"/api/customers/{customer['id']}", json={"is_active": False})

    response = admin.post(
        f"/api/customers/{customer['id']}/payments", json={"amount_paise": 8000}
    )
    assert response.status_code == 201, response.text
    detail = admin.get(f"/api/customers/{customer['id']}").json()["data"]
    assert detail["outstanding_paise"] == 0


def test_cashier_cannot_collect_payment(client, admin):
    customer = new_customer(admin)
    login(client, "cashier")
    response = client.post(
        f"/api/customers/{customer['id']}/payments", json={"amount_paise": 100}
    )
    assert response.status_code == 403


def test_payment_writes_outbox_and_audit(admin, db):
    customer = new_customer(admin, credit_limit_paise=50000)
    admin.post("/api/sales", json=credit_sale(customer["id"]))
    payment = admin.post(
        f"/api/customers/{customer['id']}/payments", json={"amount_paise": 3000}
    ).json()["data"]

    event = db.execute(
        "SELECT entity_type, operation, payload_json FROM outbox"
        " WHERE entity_type = 'customer_payment' AND entity_id = ?",
        (payment["id"],),
    ).fetchone()
    assert event is not None
    assert event["operation"] == "CREATE"
    assert json.loads(event["payload_json"])["amount_paise"] == 3000

    audit_row = db.execute(
        "SELECT after_json FROM audit_log WHERE action = 'CUSTOMER_PAYMENT'"
    ).fetchone()
    assert audit_row is not None
    assert json.loads(audit_row["after_json"])["payment_id"] == payment["id"]


def test_has_dues_filter_returns_only_debtors(admin):
    debtor = new_customer(admin, name="Debtor Customer", credit_limit_paise=50000)
    new_customer(admin, name="Settled Customer", credit_limit_paise=50000)
    admin.post("/api/sales", json=credit_sale(debtor["id"]))

    body = admin.get("/api/customers", params={"has_dues": True}).json()["data"]
    assert body["total"] == 1
    assert body["items"][0]["id"] == debtor["id"]
    assert body["items"][0]["outstanding_paise"] == 8000


# ------------------------------------------------- sales + ledger endpoints

def test_customer_sales_endpoint(admin):
    customer = new_customer(admin, credit_limit_paise=50000)
    admin.post("/api/sales", json=credit_sale(customer["id"]))
    admin.post(
        "/api/sales",
        json=sale_payload(client_sale_id="cs-cash-1", customer_id=customer["id"]),
    )

    body = admin.get(
        f"/api/customers/{customer['id']}/sales"
    ).json()["data"]
    assert body["total"] == 2
    methods = {item["payment_method"] for item in body["items"]}
    assert methods == {"CREDIT", "CASH"}
    credit_item = next(i for i in body["items"] if i["payment_method"] == "CREDIT")
    assert credit_item["credit_paise"] == 8000
    cash_item = next(i for i in body["items"] if i["payment_method"] == "CASH")
    assert cash_item["credit_paise"] == 0


def test_customer_sales_endpoint_unknown_customer(admin):
    response = admin.get("/api/customers/cust-ghost/sales")
    assert response.status_code == 404
    assert response.json()["code"] == "CUSTOMER_NOT_FOUND"


def test_customer_ledger_endpoint_pagination_and_running_balance(admin, db):
    customer = new_customer(admin, credit_limit_paise=100000)
    admin.post("/api/sales", json=credit_sale(customer["id"]))  # +8000
    admin.post(
        f"/api/customers/{customer['id']}/payments", json={"amount_paise": 3000}
    )  # -3000

    page = admin.get(
        f"/api/customers/{customer['id']}/ledger", params={"page_size": 1}
    ).json()["data"]
    assert page["total"] == 2
    assert page["pages"] == 2
    assert page["outstanding_paise"] == 5000
    # Newest first: the payment sits on top with the true running balance.
    assert page["items"][0]["entry_type"] == "PAYMENT"
    assert page["items"][0]["balance_after_paise"] == 5000

    page2 = admin.get(
        f"/api/customers/{customer['id']}/ledger",
        params={"page_size": 1, "page": 2},
    ).json()["data"]
    assert page2["items"][0]["entry_type"] == "CREDIT_SALE"
    assert page2["items"][0]["balance_after_paise"] == 8000

    # Append-only: the API exposes rows but offers no way to edit them.
    assert db.execute(
        "SELECT COUNT(*) FROM customer_ledger_entries WHERE customer_id = ?",
        (customer["id"],),
    ).fetchone()[0] == 2


def test_customer_ledger_date_filter(admin):
    customer = new_customer(admin, credit_limit_paise=100000)
    admin.post("/api/sales", json=credit_sale(customer["id"]))

    empty = admin.get(
        f"/api/customers/{customer['id']}/ledger",
        params={"date_from": "2020-01-01", "date_to": "2020-01-02"},
    ).json()["data"]
    assert empty["total"] == 0

    invalid = admin.get(
        f"/api/customers/{customer['id']}/ledger", params={"date_from": "01-02-2020"}
    )
    assert invalid.status_code == 400
    assert invalid.json()["code"] == "VALIDATION_ERROR"


# ---------------------------------------------------------------- suppliers

def test_create_supplier_assigns_code_and_defaults(admin):
    data = new_supplier(admin)
    assert data["code"] == "SUPP-0001"
    assert data["name"] == "Parle Agro Logistics"
    assert data["payment_terms"] == "Net 30 Days"
    assert data["is_active"] is True
    assert data["outstanding_paise"] == 0
    assert data["ledger_entry_count"] == 0
    assert data["recent_ledger"] == []


def test_supplier_search_and_pagination(admin):
    new_supplier(admin, name="Alpha Traders", phone="9886011223")
    new_supplier(admin, name="Beta Distributors", phone="9123456780", gstin=GSTIN)

    by_name = admin.get("/api/suppliers", params={"q": "alpha"}).json()["data"]
    assert by_name["total"] == 1

    by_contact = admin.get(
        "/api/suppliers", params={"q": "Beta Distributors"}
    ).json()["data"]
    assert by_contact["total"] == 1

    by_gstin = admin.get("/api/suppliers", params={"q": GSTIN}).json()["data"]
    assert by_gstin["total"] == 1

    page = admin.get("/api/suppliers", params={"page_size": 1}).json()["data"]
    assert page["total"] == 2
    assert page["pages"] == 2


def test_update_supplier_patch(admin):
    supplier = new_supplier(admin)
    response = admin.patch(
        f"/api/suppliers/{supplier['id']}",
        json={"payment_terms": "Net 15 Days", "credit_limit_paise": 250000},
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["payment_terms"] == "Net 15 Days"
    assert data["credit_limit_paise"] == 250000
    assert data["code"] == supplier["code"]


def test_unknown_supplier_is_404(admin):
    for path in (
        "/api/suppliers/supp-ghost",
        "/api/suppliers/supp-ghost/ledger",
    ):
        response = admin.get(path)
        assert response.status_code == 404, (path, response.text)
        assert response.json()["code"] == "SUPPLIER_NOT_FOUND"

    patched = admin.patch("/api/suppliers/supp-ghost", json={"name": "X"})
    assert patched.status_code == 404
    assert patched.json()["code"] == "SUPPLIER_NOT_FOUND"


def test_supplier_ledger_starts_empty(admin):
    supplier = new_supplier(admin)
    body = admin.get(f"/api/suppliers/{supplier['id']}/ledger").json()["data"]
    assert body["items"] == []
    assert body["total"] == 0
    assert body["outstanding_paise"] == 0


def test_supplier_payment_without_payable_is_rejected(admin, db):
    supplier = new_supplier(admin)
    response = admin.post(
        f"/api/suppliers/{supplier['id']}/payments", json={"amount_paise": 1000}
    )
    assert response.status_code == 400
    assert response.json()["code"] == "PAYMENT_EXCEEDS_OUTSTANDING"
    assert db.execute(
        "SELECT COUNT(*) FROM supplier_ledger_entries"
    ).fetchone()[0] == 0


def test_supplier_payment_settles_payable_idempotently(admin, db):
    supplier = new_supplier(admin)
    # Phase 4 foundation: a PURCHASE entry is written by the later purchases
    # phase; seed one directly to prove the payable book works end to end.
    seed_supplier_payable(db, supplier["id"], 100000)

    body = {"amount_paise": 40000, "idempotency_key": "supp-pay-1"}
    first = admin.post(f"/api/suppliers/{supplier['id']}/payments", json=body)
    assert first.status_code == 201, first.text
    payment = first.json()["data"]
    assert payment["outstanding_paise"] == 60000
    assert payment["idempotent"] is False

    replay = admin.post(f"/api/suppliers/{supplier['id']}/payments", json=body)
    assert replay.status_code == 200
    assert replay.json()["data"]["idempotent"] is True

    detail = admin.get(f"/api/suppliers/{supplier['id']}").json()["data"]
    assert detail["outstanding_paise"] == 60000
    assert detail["ledger_entry_count"] == 2
    assert detail["total_payments_paise"] == 40000


def test_inactive_supplier_blocks_new_transactions(admin):
    supplier = new_supplier(admin)
    admin.patch(f"/api/suppliers/{supplier['id']}", json={"is_active": False})

    response = admin.post(
        f"/api/suppliers/{supplier['id']}/payments", json={"amount_paise": 1000}
    )
    assert response.status_code == 400
    assert response.json()["code"] == "SUPPLIER_INACTIVE"


def test_cashier_can_read_suppliers_but_not_write(client, cashier):
    assert client.get("/api/suppliers").status_code == 200
    denied = client.post(
        "/api/suppliers", json={"name": "Nope", "phone": "9886011223"}
    )
    assert denied.status_code == 403


def test_supplier_writes_enqueue_outbox_and_audit(admin, db):
    supplier = new_supplier(admin)
    event = db.execute(
        "SELECT operation, payload_json FROM outbox"
        " WHERE entity_type = 'supplier' AND entity_id = ?",
        (supplier["id"],),
    ).fetchone()
    assert event is not None
    assert event["operation"] == "CREATE"
    assert json.loads(event["payload_json"])["code"] == "SUPP-0001"

    admin.patch(f"/api/suppliers/{supplier['id']}", json={"phone": "9123456780"})
    audit_row = db.execute(
        "SELECT action FROM audit_log WHERE entity_id = ? AND action = 'SUPPLIER_UPDATE'",
        (supplier["id"],),
    ).fetchone()
    assert audit_row is not None


def test_customer_write_events_enqueue_outbox(admin, db):
    customer = new_customer(admin)
    events = db.execute(
        "SELECT operation FROM outbox WHERE entity_type = 'customer'"
        " AND entity_id = ?",
        (customer["id"],),
    ).fetchall()
    assert [e["operation"] for e in events] == ["CREATE"]

    admin.patch(f"/api/customers/{customer['id']}", json={"name": "Renamed"})
    events = db.execute(
        "SELECT operation FROM outbox WHERE entity_type = 'customer'"
        " AND entity_id = ? ORDER BY rowid",
        (customer["id"],),
    ).fetchall()
    assert [e["operation"] for e in events] == ["CREATE", "UPDATE"]


def test_device_id_header_isolation_still_holds(admin):
    """Phase 4 must not disturb Phase 3 idempotency keys."""
    customer = new_customer(admin, credit_limit_paise=50000)
    payload = credit_sale(customer["id"], device_id=DEVICE_ID)
    first = admin.post("/api/sales", json=payload)
    second = admin.post("/api/sales", json=payload)
    assert first.status_code == 201
    assert second.status_code == 200
    assert second.json()["data"]["idempotent"] is True


# ================================ analyzer fix pass — regression tests

def test_payment_idempotency_key_is_scoped_to_one_customer(admin, db):
    """P1 regression: `customer_payments.idempotency_key` is globally UNIQUE.

    Replaying a key against a DIFFERENT customer - even with an identical
    amount, method and reference - must be a 409. Before the fix it returned
    `200 {idempotent: true}` with the first customer's payment attached and
    posted nothing for the second one (a collected payment silently lost).
    """
    debtor_a = new_customer(admin, name="Khata A", phone="9845011231")
    debtor_b = new_customer(admin, name="Khata B", phone="9845011232")
    assert admin.post("/api/sales", json=credit_sale(debtor_a["id"])).status_code == 201
    assert admin.post(
        "/api/sales", json=credit_sale(debtor_b["id"], client_sale_id="cs-test-0002")
    ).status_code == 201

    body = {
        "amount_paise": 5000,
        "payment_method": "CASH",
        "reference": "REF-SHARED",
        "idempotency_key": "cross-customer-key-1",
    }
    first = admin.post(f"/api/customers/{debtor_a['id']}/payments", json=body)
    assert first.status_code == 201, first.text
    assert admin.get(f"/api/customers/{debtor_a['id']}").json()["data"][
        "outstanding_paise"
    ] == 3000

    conflict = admin.post(f"/api/customers/{debtor_b['id']}/payments", json=body)
    assert conflict.status_code == 409
    assert conflict.json()["code"] == "DUPLICATE_IDEMPOTENCY_KEY"

    # A changed exactly once; B was never touched.
    assert admin.get(f"/api/customers/{debtor_a['id']}").json()["data"][
        "outstanding_paise"
    ] == 3000
    assert admin.get(f"/api/customers/{debtor_b['id']}").json()["data"][
        "outstanding_paise"
    ] == 8000
    assert [r["entry_type"] for r in ledger_rows(db, debtor_b["id"])] == ["CREDIT_SALE"]

    # Exactly one payment row and one ledger credit entry for that key.
    assert db.execute(
        "SELECT COUNT(*) FROM customer_payments WHERE idempotency_key = ?",
        ("cross-customer-key-1",),
    ).fetchone()[0] == 1
    assert db.execute(
        "SELECT COUNT(*) FROM customer_ledger_entries WHERE idempotency_key = ?",
        ("cross-customer-key-1",),
    ).fetchone()[0] == 1

    # Same customer + same payload is still an idempotent replay (200).
    replay = admin.post(f"/api/customers/{debtor_a['id']}/payments", json=body)
    assert replay.status_code == 200
    assert replay.json()["data"]["idempotent"] is True


def test_payment_accepts_the_rupee_amount_alias(admin, db):
    customer = new_customer(admin, credit_limit_paise=50000)
    admin.post("/api/sales", json=credit_sale(customer["id"]))  # Rs.80 due

    response = admin.post(
        f"/api/customers/{customer['id']}/payments", json={"amount": 50}
    )
    assert response.status_code == 201, response.text
    payment = response.json()["data"]
    assert payment["amount_paise"] == 5000  # rupees -> INTEGER paise
    assert payment["outstanding_paise"] == 3000
    assert db.execute(
        "SELECT amount_paise FROM customer_payments WHERE id = ?", (payment["id"],)
    ).fetchone()["amount_paise"] == 5000

    # Sending both spellings is ambiguous -> 422, never a silent pick-one.
    ambiguous = admin.post(
        f"/api/customers/{customer['id']}/payments",
        json={"amount_paise": 1000, "amount": 10},
    )
    assert ambiguous.status_code == 422
    assert ambiguous.json()["code"] == "VALIDATION_ERROR"


def test_supplier_payment_accepts_the_rupee_amount_alias(admin, db):
    supplier = new_supplier(admin)
    seed_supplier_payable(db, supplier["id"], 100000)

    response = admin.post(
        f"/api/suppliers/{supplier['id']}/payments", json={"amount": 400}
    )
    assert response.status_code == 201, response.text
    payment = response.json()["data"]
    assert payment["amount_paise"] == 40000
    assert payment["outstanding_paise"] == 60000


def test_credit_limit_money_bounds(admin):
    """Every credit limit is INTEGER paise inside [0, MAX_MONEY_PAISE]."""
    def create(name: str, phone: str, limit: int):
        return admin.post(
            "/api/customers",
            json={"name": name, "phone": phone, "credit_limit_paise": limit},
        )

    zero = create("No Limit", "9845011301", 0)
    assert zero.status_code == 200  # 0 is legal: it disables credit
    assert zero.json()["data"]["credit_limit_paise"] == 0

    normal = create("Normal Limit", "9845011302", 500000)
    assert normal.status_code == 200

    biggest = create("Max Limit", "9845011303", MAX_MONEY_PAISE)
    assert biggest.status_code == 200
    assert biggest.json()["data"]["credit_limit_paise"] == MAX_MONEY_PAISE

    over = create("Over Limit", "9845011304", MAX_MONEY_PAISE + 1)
    assert over.status_code == 422
    assert over.json()["code"] == "VALIDATION_ERROR"

    # The magnitude that used to reach SQLite as an OverflowError -> 500.
    absurd = create("Absurd Limit", "9845011305", 10**30)
    assert absurd.status_code == 422
    assert absurd.json()["code"] == "VALIDATION_ERROR"

    negative = create("Negative Limit", "9845011306", -1)
    assert negative.status_code == 422
    assert negative.json()["code"] == "VALIDATION_ERROR"

    # PATCH carries the same ceiling as POST.
    patched = admin.patch(
        f"/api/customers/{biggest.json()['data']['id']}",
        json={"credit_limit_paise": MAX_MONEY_PAISE + 1},
    )
    assert patched.status_code == 422
    assert patched.json()["code"] == "VALIDATION_ERROR"


def test_payment_amount_money_bounds(admin):
    customer = new_customer(admin, credit_limit_paise=50000)
    admin.post("/api/sales", json=credit_sale(customer["id"]))
    url = f"/api/customers/{customer['id']}/payments"

    # Zero stays a domain error (a payment must be greater than zero).
    zero = admin.post(url, json={"amount_paise": 0})
    assert zero.status_code == 400
    assert zero.json()["code"] == "INVALID_PAYMENT_AMOUNT"

    negative = admin.post(url, json={"amount_paise": -1})
    assert negative.status_code == 422
    assert negative.json()["code"] == "VALIDATION_ERROR"

    negative_alias = admin.post(url, json={"amount": -5})
    assert negative_alias.status_code == 422
    assert negative_alias.json()["code"] == "VALIDATION_ERROR"

    # Maximum accepted value clears validation and fails only the owed-amount
    # rule (the customer owes Rs.80) - never a 500.
    biggest = admin.post(url, json={"amount_paise": MAX_MONEY_PAISE})
    assert biggest.status_code == 400
    assert biggest.json()["code"] == "PAYMENT_EXCEEDS_OUTSTANDING"

    over = admin.post(url, json={"amount_paise": MAX_MONEY_PAISE + 1})
    assert over.status_code == 422
    assert over.json()["code"] == "VALIDATION_ERROR"


def test_customers_summary_totals_every_debtor(admin):
    """`GET /customers/summary` is SQL over the whole book, not a page sum."""
    empty = admin.get("/api/customers/summary")
    assert empty.status_code == 200
    assert empty.json()["data"] == {
        "total_receivables_paise": 0,
        "debtor_count": 0,
    }

    debtor_a = new_customer(admin, name="Debtor A", phone="9845011401")
    debtor_b = new_customer(admin, name="Debtor B", phone="9845011402")
    settled = new_customer(admin, name="Settled C", phone="9845011403")
    assert admin.post("/api/sales", json=credit_sale(debtor_a["id"])).status_code == 201
    assert admin.post(
        "/api/sales", json=credit_sale(debtor_b["id"], client_sale_id="cs-test-0002")
    ).status_code == 201
    assert admin.post(
        "/api/sales", json=credit_sale(settled["id"], client_sale_id="cs-test-0003")
    ).status_code == 201

    # Settle C completely: it drops out of both figures.
    settled_payment = admin.post(
        f"/api/customers/{settled['id']}/payments", json={"amount_paise": 8000}
    )
    assert settled_payment.status_code == 201

    summary = admin.get("/api/customers/summary").json()["data"]
    assert summary["total_receivables_paise"] == 16000  # 8000 + 8000
    assert summary["debtor_count"] == 2

    # Agrees with the directory (single page here, whole book either way).
    rows = admin.get("/api/customers", params={"page_size": 500}).json()["data"][
        "items"
    ]
    assert sum(r["outstanding_paise"] for r in rows) == summary[
        "total_receivables_paise"
    ]
    assert admin.get(
        "/api/customers", params={"has_dues": True}
    ).json()["data"]["total"] == summary["debtor_count"]


def test_customers_summary_permissions(client):
    assert client.get("/api/customers/summary").status_code == 401  # anonymous

    login(client, "cashier")
    assert client.get("/api/customers/summary").status_code == 200

    login(client, "admin")
    assert client.get("/api/customers/summary").status_code == 200


def test_phase4_audits_record_the_device_id(admin, db):
    """Phase 4 audit rows carry the same `X-Device-Id` as Phases 1-3."""
    device = "POS-khata-terminal-7"
    headers = {"X-Device-Id": device}

    customer = admin.post(
        "/api/customers",
        json={"name": "Device Ramesh", "phone": "9845011501",
              "credit_limit_paise": 50000},
        headers=headers,
    ).json()["data"]
    admin.patch(
        f"/api/customers/{customer['id']}", json={"notes": "Called"}, headers=headers
    )
    admin.post("/api/sales", json=credit_sale(customer["id"]))
    admin.post(
        f"/api/customers/{customer['id']}/payments",
        json={"amount_paise": 1000},
        headers=headers,
    )
    supplier = admin.post(
        "/api/suppliers",
        json={"name": "Device Sup", "phone": "9845011502"},
        headers=headers,
    ).json()["data"]
    admin.patch(
        f"/api/suppliers/{supplier['id']}", json={"notes": "x"}, headers=headers
    )

    for action in (
        "CUSTOMER_CREATE",
        "CUSTOMER_UPDATE",
        "CUSTOMER_PAYMENT",
        "SUPPLIER_CREATE",
        "SUPPLIER_UPDATE",
    ):
        row = db.execute(
            "SELECT device_id FROM audit_log WHERE action = ?", (action,)
        ).fetchone()
        assert row is not None, action
        assert row["device_id"] == device, action


def test_sales_customer_index_exists(db):
    """`sales(customer_id, created_at)` serves khata history + list joins."""
    names = {
        r["name"]
        for r in db.execute(
            "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='sales'"
        )
    }
    assert "idx_sales_customer" in names
