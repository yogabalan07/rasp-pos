# PHASE 4 — Customers + Suppliers + Khata ledger

Phases 1–3 built the sale spine, the catalogue, and a real POS till. Phase 4
adds the **parties** those sales happen with: a persistent customer directory
with server-owned khata (credit) balances, a supplier directory with a payable
ledger, idempotent money collection, and the POS integration that makes a
**CREDIT** sale a real, limit-checked, ledger-posted event.

The layout, components, class names and copy are **rewired, not redesigned**.
Firebase/sync, purchases/PO/GRN, returns, multi-branch, loyalty and reports
remain **out of scope**.

---

## 1. Quick start (development)

```powershell
# --- backend (terminal 1) -------------------------------------------------
cd backend
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
.\.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# --- frontend (terminal 2) ------------------------------------------------
npm install
npm run dev        # http://localhost:3000, /api proxied to 127.0.0.1:8000
```

### Verification

```powershell
cd backend
.\.venv\Scripts\python -m pytest tests     # 217 tests (76 + 31 + 54 + 56)
..\npm run lint                            # tsc --noEmit
..\npm run build                           # vite production build
```

Schema moves **v2 → v3**: five new tables (`customers`, `suppliers`,
`customer_ledger_entries`, `customer_payments`, `supplier_ledger_entries`) plus
`code_counters`. Migration `("3", "UPDATE schema_meta … version")` is all it
takes — the new tables come from `CREATE TABLE IF NOT EXISTS` on both fresh and
upgraded databases. One index is added alongside them:
`idx_sales_customer (customer_id, created_at)`, so khata history and the
customer-list aggregates never scan the `sales` table.

---

## 2. Permission matrix (Phase 4 additions)

Five permissions were **added** to `dependencies.PERMISSIONS`. Nothing existing
was renamed, so every Phase 1–3 session still works.

| Permission | Roles | Phase 4 routes |
|------------|-------|----------------|
| `customer:read` | all roles | `GET /customers`, `GET /customers/summary`, `GET /customers/{id}`, `GET /customers/{id}/sales`, `GET /customers/{id}/ledger` |
| `customer:write` | ADMIN, OWNER | `POST /customers`, `PATCH /customers/{id}` |
| `customer:payment` | ADMIN, OWNER | `POST /customers/{id}/payments` |
| `supplier:read` | all roles | `GET /suppliers`, `GET /suppliers/{id}`, `GET /suppliers/{id}/ledger` |
| `supplier:write` | ADMIN, OWNER | `POST /suppliers`, `PATCH /suppliers/{id}`, `POST /suppliers/{id}/payments` |

**Why reads are open to everyone:** the POS customer selector runs as the
signed-in cashier — the till must be able to *look up* a khata customer to
attach it to a bill. **Why writes are ADMIN/OWNER:** a cashier at the counter
must not be able to write off a dues balance or raise a credit limit. The UI
enforces the same split (`authService.can('customer:write')` etc.) and shows a
helpful read-only state instead of a dead button; the server is still the
authority — a cashier POSTing directly gets `403`.

---

## 3. HTTP API

Base path `/api`, same envelope as Phases 1–3 (`ok/data/message` on success,
`message/status/code` on failure). Money is **INTEGER paise** on the wire in
both directions.

### Customers

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/customers` | `q` (name/phone/code/gstin/email), `active=true\|false`, `has_dues=true`, `page`, `page_size` → `{items, total, page, page_size, pages}` |
| `GET` | `/customers/summary` | `{total_receivables_paise, debtor_count}` summed by SQL over **every** ledger row — the header total must never come from a capped page (`customer:read`) |
| `POST` | `/customers` | `200`, server assigns `CUST-0001` from `code_counters` |
| `GET` | `/customers/{id}` | adds `recent_sales` + `recent_ledger` (10 each) |
| `PATCH` | `/customers/{id}` | partial; **`outstanding_paise` is not editable** → `422 VALIDATION_ERROR` |
| `GET` | `/customers/{id}/sales` | bills, newest first, paged |
| `GET` | `/customers/{id}/ledger` | append-only book, newest first, with `outstanding_paise` |
| `POST` | `/customers/{id}/payments` | `{amount_paise \| amount, payment_method, reference, notes, idempotency_key}` → `201` new / `200` + `idempotent: true` replay / `409` when the key belongs to another customer |

Customer row (response shape): `id, code, name, phone, email, address, gstin,
credit_limit_paise, is_active, notes, created_at, updated_at,
outstanding_paise, available_credit_paise (clamped ≥ 0),
total_credit_sales_paise, total_payments_paise, total_billed_paise, sale_count,
last_sale_at`.

### Suppliers

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/suppliers` | same filter/pagination contract; `q` covers name/contact/phone/code/gstin |
| `POST` | `/suppliers` | `200`, code `SUPP-0001` |
| `GET` | `/suppliers/{id}` | + `recent_ledger`, aggregates |
| `PATCH` | `/suppliers/{id}` | partial; no fields → `400 NO_FIELDS` |
| `GET` | `/suppliers/{id}/ledger` | payable book + `outstanding_paise` |
| `POST` | `/suppliers/{id}/payments` | same money + idempotency contract as customer payments; **cannot succeed yet** — see below |

There is **no `supplier_payments` table**: for a supplier the ledger row *is*
the payment record (`reference`/`notes` are stored on the entry). No `DELETE`
routes exist anywhere in Phase 4 — deactivate with `PATCH {"is_active": false}`.

`POST /suppliers/{id}/payments` is a deliberately kept, **future-facing
primitive** (option A): purchases/GRN are out of scope in Phase 4, so a
supplier's payable is structurally `₹0.00` and every attempt answers
`400 PAYMENT_EXCEEDS_OUTSTANDING` ("Payment ₹x exceeds payable ₹0.00")
without writing anything. No payable is ever invented, and `SuppliersPage`
hides the record-payment button while the payable is zero. The endpoint stays
so the payable book (idempotency, ledger posting, RBAC, audit) is real and
tested — including in `test_supplier_payment_settles_payable_idempotently`,
which seeds the `PURCHASE` row the purchases phase will post.

### Error codes

| Code | Status | Meaning |
|------|--------|---------|
| `CUSTOMER_NOT_FOUND` / `SUPPLIER_NOT_FOUND` | 404 | unknown id |
| `CUSTOMER_INACTIVE` / `SUPPLIER_INACTIVE` | 400 | deactivated party (also the future purchases hook) |
| `CUSTOMER_REQUIRED_FOR_CREDIT` | 400 | `CREDIT` sale with no `customer_id` at all |
| `CUSTOMER_CREDIT_LIMIT_EXCEEDED` | 409 | balance would pass the limit (also fires when the limit is ₹0) |
| `PAYMENT_EXCEEDS_OUTSTANDING` | 400 | collection > owed (customer *or* supplier) |
| `INVALID_PAYMENT_AMOUNT` | 400 | ≤ 0, not numeric, or fractional beyond paise |
| `DUPLICATE_IDEMPOTENCY_KEY` | 409 | same key with a different payload **or a different customer/supplier** |
| `DUPLICATE_CUSTOMER_CODE` / `DUPLICATE_SUPPLIER_CODE` | 409 | counter collision (defensive) |
| `INVALID_NAME` `INVALID_PHONE` `INVALID_EMAIL` `INVALID_GSTIN` `INVALID_CREDIT_LIMIT` `INVALID_PAYMENT_METHOD` `NO_FIELDS` | 400 | field validation |
| `VALIDATION_ERROR` | 422 | Pydantic body shape (missing/extra/wrong type), both amount spellings at once, or a money field outside `[0, MAX_MONEY_PAISE]` (`1e12` paise = ₹1000 crore) |

---

## 4. Domain rules

### The ledger is the balance

`customer_ledger_entries` is **append-only** — no UPDATE/DELETE path exists in
code. A customer's `outstanding_paise` is always
`SUM(debit) − SUM(credit)` computed at read time (no cached balance column to
drift), and every entry stamps `balance_after_paise` at insert time so the UI
can show a trustworthy running total. Ordering is
`created_at DESC, rowid DESC` — the `rowid` tiebreak keeps pages deterministic
even though timestamps are millisecond-precision.

Direction conventions (money words, not accounting-school words):

| | Debit (+) | Credit (−) |
|---|---|---|
| **Customer khata** | credit **sale** — customer owes more | **payment** collected — owes less |
| **Supplier payable** | **payment** made — we owe less | purchase — we owe more (posts in a later phase) |

`CASH`/`UPI`/`CARD` sales create **no ledger entry at all** — only `CREDIT`
does. Cash customers never accrue receivables.

### CREDIT sales are gated inside the sale transaction

`POST /api/sales` with `payment_method: "CREDIT"` runs, inside the same
`BEGIN IMMEDIATE` transaction that writes the sale, stock and outbox:

1. `customer_id` present? else `CUSTOMER_REQUIRED_FOR_CREDIT` (400);
2. row exists? else `CUSTOMER_NOT_FOUND` (404);
3. `is_active`? else `CUSTOMER_INACTIVE` (400);
4. `limit > 0` **and** `balance + total_paise <= limit_paise`, else
   `CUSTOMER_CREDIT_LIMIT_EXCEEDED` (409) — **a ₹0 limit means credit is
   disabled for that customer**, not "unlimited";
5. post the DEBIT entry (`entry_type = CREDIT_SALE`, `reference_type = SALE`,
   `reference_id = sale id`) and enqueue an outbox event
   (`entity_type=customer`, `operation=UPDATE`, payload
   `event=CUSTOMER_CREDIT_SALE`) + audit row.

Any failure rolls back **everything** — no sale row, no stock movement, no
outbox, no ledger entry (covered by an atomicity test). A non-CREDIT sale may
still *carry* a `customer_id` for the receipt snapshot; unknown ids are kept
as-is for Phase 3 legacy compat and are never validated.

### Payments are idempotent and server-authoritative

- `idempotency_key` is looked up **inside** `BEGIN IMMEDIATE`. A racing
  duplicate waits on the lock, finds the original row, and returns
  `200 {idempotent: true}`; a *different* payload under the same key — or the
  same payload against a **different customer** — is `409
  DUPLICATE_IDEMPOTENCY_KEY` (the key is globally `UNIQUE`, so it is compared
  against `customer_id` too; a unique index backstops this — `IntegrityError`
  maps to the same code).
- `amount_paise` is the only money field the service sees. `amount` is a
  public **rupee alias**, normalised with `to_paise()` in the request model
  (`schemas.PaymentRequest`) before any service logic; sending both spellings
  is `422`, and either field is ceilinged at `MAX_MONEY_PAISE`
  (`utils.money`) so an absurd value is a `422`, never a `500`.
- The balance is re-read inside the transaction; `amount > outstanding` →
  `400 PAYMENT_EXCEEDS_OUTSTANDING`, `amount <= 0` → `400
  INVALID_PAYMENT_AMOUNT`. The browser blocks these too, but only as UX — the
  server is the authority.
- The payment writes `customer_payments` + a CREDIT ledger entry in one
  transaction, then enqueues `entity_type=customer_payment, operation=CREATE`
  and audits `CUSTOMER_PAYMENT`.
- Supplier payments mirror everything except there is no payments table (the
  ledger row is the record); `require_active_supplier()` runs first, which is
  also the real code path behind `SUPPLIER_INACTIVE`.

### Codes

`code_counters` (`kind` → `next_value`, bumped inside the caller's
transaction, so a rollback returns the number) assigns `CUST-0001`,
`CUST-0002` … and `SUPP-0001` … Human-typed codes are not accepted; codes are
unique by construction and unique-indexed as a backstop.

---

## 5. Frontend (UI preserved, data swapped)

| Screen | What changed |
|--------|--------------|
| `CustomersPage` | server list (debounced search, Active/Inactive filter, pagination), create/edit modal (GSTIN, notes, credit limit, active toggle), detail modal with **Sales History** and **Khata Ledger** tabs (both server-paginated), collect-dues dialog |
| `CreditPage` | list from `GET /customers?has_dues=true`; the **header total + debtor count come from `GET /customers/summary`** (SQL over the whole ledger — never a sum of a capped `page_size=500` page), with a note when the table shows fewer rows than the real debtor count; utilisation bars, collect dialog |
| `SuppliersPage` | server list + cards, create/edit, detail modal with the payable ledger, record-payment dialog (idempotency-key safe) |
| `PosPage` | loads **active** customers only; F3 selector is server-searched; quick-add surfaces 403/409/422 as toasts; `handleResetCart` returns to a **walk-in** customer (the old demo auto-attached the first customer — unsafe when credit is real); walk-in carries `creditLimit: 0` |
| `CustomerSelectModal` | fetches its own list from the server (250 ms debounce, `active=true`), shows code/outstanding/limit, hides the New button without `customer:write` |
| `PaymentModal` | khata panel shows outstanding, limit, **available credit** and the post-sale balance; blocks submit with a clear red panel when the limit is exceeded or is ₹0; walk-in shows "Select a customer for credit sale. (F3)" |

Service layer convention is unchanged from Phases 1–3: `rowToCustomer` /
`rowToSupplier` mappers convert snake_case + paise from the API into the app's
camelCase + rupees types — the browser never computes a balance.

**Loyalty points were removed** from the `Customer` type and every screen
rather than shown as fake data; loyalty is not implemented, so the UI does not
claim it. Mock `INITIAL_CUSTOMERS` / `INITIAL_SUPPLIERS` are gone from
`mockData.ts`.

---

## 6. Verification

```powershell
# backend — 217 tests
cd backend; .\.venv\Scripts\python -m pytest tests --tb=line
# frontend
npm run lint ; npm run build
```

`backend/tests/test_phase4_customers_suppliers.py` adds **56** tests covering:

- CRUD, server codes, duplicate/field validation, search, pagination, active
  filter, `422` for unknown body fields, `outstanding_paise` not editable
- credit sales: DEBIT entry posted, balance/available-credit maths, limit
  enforced (incl. `₹0` limit), inactive + unknown customer, missing
  `customer_id`, atomic rollback, outbox + audit rows, idempotent replay
- cash/UPI/CARD sales writing **no** ledger entry
- payments: partial payments, `PAYMENT_EXCEEDS_OUTSTANDING`,
  `INVALID_PAYMENT_AMOUNT`, idempotent replay (201 → 200), conflicting key →
  409, inactive customer can still pay dues, RBAC (`403` for cashier)
- sales + ledger endpoints (ordering, `balance_after`, date bounds)
- suppliers: CRUD + codes, payable ledger read, payment primitive,
  `SUPPLIER_INACTIVE`, `NO_FIELDS`, outbox + audit
- RBAC on every route for every role

**Analyzer fix-pass regressions** (the 9 tests added with the fixes):

1. `test_payment_idempotency_key_is_scoped_to_one_customer` — a key reused by
   another customer is `409`, with exactly one payment row, one ledger credit
   entry, and neither balance touched twice;
2. `test_payment_accepts_the_rupee_amount_alias` — `{"amount": 50}` →
   `amount_paise: 5000`; both spellings at once → `422`;
3. `test_supplier_payment_accepts_the_rupee_amount_alias` — same for the
   supplier primitive;
4. `test_credit_limit_money_bounds` — `0` / normal / `MAX_MONEY_PAISE` pass,
   `MAX+1`, `10**30` and `-1` → `422` (POST and PATCH);
5. `test_payment_amount_money_bounds` — `0` → `400 INVALID_PAYMENT_AMOUNT`,
   `-1` / alias `-5` / `MAX+1` → `422`, `MAX` clears validation and fails only
   the owed-amount rule (`400`, never `500`);
6. `test_customers_summary_totals_every_debtor` — totals agree with the
   directory and with `has_dues` counts;
7. `test_customers_summary_permissions` — `401` anonymous, `200` cashier/admin;
8. `test_phase4_audits_record_the_device_id` — `CUSTOMER_*` / `SUPPLIER_*` audit
   rows carry `X-Device-Id`;
9. `test_sales_customer_index_exists` — `idx_sales_customer` is present.

Three older assertions were **intentionally updated** (same precedent as
Phase 3 bumping Phase 1's):

1. `test_health.py` → `phase == 4` (`config.PHASE` bumped);
2. `test_phase2_products_inventory.py::test_migration_2_upgrades_a_phase1_database`
   → asserts `schemaVersion == 3` (migration 3 lands on upgraded DBs);
3. `test_phase3_pos_billing.py::test_credit_requires_customer` → seeds a real
   `customers` row first, because free-text `customer_id`s are no longer
   accepted for CREDIT sales (that is the whole point of Phase 4).

### Live smoke

**33 checks against a real `uvicorn` on a freshly seeded temp database after
the analyzer fix pass, all passing:** `phase: 4` health; owner login;
`CUST-0001`/`CUST-0002`/`SUPP-0001` assignment; CREDIT sales for A and B;
payment for A with `SMOKE-KEY-1` → `201` (A = ₹60.00); replay of that key →
`200 {idempotent: true}` returning the same payment id; **the same key against
customer B → `409 DUPLICATE_IDEMPOTENCY_KEY`** with B's balance untouched and
exactly one payment row + one ledger credit entry for the key; rupee alias
`{"amount": 10}` → `201 amount_paise: 1000`; both spellings at once → `422`;
`amount_paise: 10**30` → `422 VALIDATION_ERROR` (never a `500`); over-payment →
`400 PAYMENT_EXCEEDS_OUTSTANDING`; credit sale over the limit → `409` with
nothing written (outstanding unchanged); `GET /customers/summary` →
`13000` paise / `2` debtors, matching the directory; ledger running balances
`5000 → 6000 → 8000`; inventory down by exactly 4 units; outbox carrying
`sale` + `customer` + `customer_payment`; audit rows for `CUSTOMER_CREATE` /
`CUSTOMER_CREDIT_SALE` / `CUSTOMER_PAYMENT` carrying `X-Device-Id`; supplier
payment primitive with no payable → `400 PAYMENT_EXCEEDS_OUTSTANDING` and an
empty payable ledger; cashier login → `200` but collecting a payment → `403`.

---

## 7. Honest TODO list — **not** implemented in Phase 4

| Area | Status |
|------|--------|
| Firebase / Firestore sync | untouched — outbox rows accumulate, nothing consumes them |
| Purchases / PO / GRN / stock-in | out of scope; `SuppliersPage` PO button and `PurchasesPage` still use the client-local mock PO store (clearly marked in `suppliers.ts`) |
| Supplier purchase entries | the payable ledger is real but only payments can post to it today; purchases will post `PURCHASE` rows |
| Sales returns / credit-note reversals | `REVERSAL`/`ADJUSTMENT` entry types are reserved in `ACCOUNTS` but no route writes them |
| Loyalty points | deliberately removed from the UI rather than faked |
| Multi-branch / sync status | single-branch; `syncedToCloud` still always `false` |
| Statement printing / PDF | ledger views are on-screen only |
| Reports, GST returns | untouched |

---

## 8. Layout

```
backend/
  app/
    config.py            PHASE = 4
    db/schema.py          SCHEMA_VERSION = 3, 5 new tables + code_counters,
                          idx_sales_customer(customer_id, created_at), migration 3
    dependencies.py       +customer:read/write/payment, +supplier:read/write
    schemas.py            CustomerCreate/Update, PaymentRequest base
                          (amount_paise + rupee alias, MAX_MONEY_PAISE ceiling),
                          CustomerPaymentRequest, SupplierCreate/Update,
                          SupplierPaymentRequest
    services/
      sequence_service.py next_code() — CUST-/SUPP- from code_counters
      ledger_service.py   append_entry(), outstanding_paise(), list_entries(),
                          idempotency lookup, ACCOUNTS/ENTRY_TYPES, _date_bound()
      customer_service.py validation, list/get/create/update, customers_summary(),
                          validate_credit_sale(), post_credit_sale(),
                          collect_payment(), sales+ledger lists
      supplier_service.py mirror + require_active_supplier(), pay_supplier()
      sales_service.py    CREDIT gate + ledger debit inside the sale transaction
    routes/
      customers.py        8 routes (incl. GET /customers/summary)
      suppliers.py        6 routes
    main.py               both routers registered under /api
  tests/
    test_phase4_customers_suppliers.py   56 tests
src/
  types/index.ts                 Customer/Supplier rewritten (loyalty removed)
  services/customers.ts          real API: listPage/getById/create/update/sales/
                                 ledger/collectPayment/summary (paise mapping)
  services/suppliers.ts          real API + paySupplier; mock POs kept, marked
  components/customers/CollectPaymentModal.tsx   idempotency-key dialog
  components/pos/CustomerSelectModal.tsx         server search + quick-add
  components/pos/PaymentModal.tsx                credit headroom + walk-in guard
  pages/CustomersPage.tsx         list + detail (sales/ledger tabs) + form
  pages/CreditPage.tsx            has_dues receivables + collect
  pages/SuppliersPage.tsx         cards + detail ledger + pay + form
  pages/PosPage.tsx               active customers, walk-in reset, RBAC toasts
  data/mockData.ts                INITIAL_CUSTOMERS / INITIAL_SUPPLIERS deleted
```

See also: [PHASE1.md](./PHASE1.md), [PHASE2.md](./PHASE2.md),
[PHASE3.md](./PHASE3.md).
