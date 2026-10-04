# PHASE 3 — Real POS billing

Phase 1 shipped the local-first sale spine (one `BEGIN IMMEDIATE` transaction,
server pricing, stock deduction, outbox, audit, gapless bill numbers). Phase 2
made the catalogue and inventory server-driven. Phase 3 connects the **POS
screen itself** to that backend: real search, real discounts, real tenders,
a hardened checkout, and a sales history that queries the server.

The POS layout, components, class names and copy are **rewired, not
redesigned**. Firebase/sync, printing hardware, returns, customers/Khata,
split payments and reports remain **out of scope**.

---

## 1. Quick start (development)

```powershell
# --- backend (terminal 1) -------------------------------------------------
cd backend
python -m venv .venv
.\\.venv\Scripts\pip install -r requirements.txt
.\\.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# --- frontend (terminal 2) ------------------------------------------------
npm install
npm run dev        # http://localhost:3000, /api proxied to 127.0.0.1:8000
```

### Verification

```powershell
cd backend
.\\.venv\Scripts\python -m pytest tests     # 161 tests (76 + 31 + 54)
..\npm run lint                            # tsc --noEmit
..\npm run build                           # vite production build
```

No schema change ships with Phase 3: the database stays at **v2**.

---

## 2. Discount instructions (wire format)

Phase 3 adds an explicit `{type, value}` **discount spec**. The browser never
sends computed money for a discount — it sends an instruction that SQLite
evaluates:

```jsonc
{
  "client_sale_id": "…", "device_id": "pos-1",
  "items": [
    { "product_id": "prod-1", "quantity": 2, "discount": { "type": "PERCENT", "value": 10 } },
    { "product_id": "prod-4", "quantity": 1 }
  ],
  "discount": { "type": "PERCENT", "value": 5 },   // bill level
  "payment_method": "CASH",
  "amount_received_paise": 100000
}
```

| Field | Meaning |
|---|---|
| `items[].discount.type` | `FIXED` → `value` is **paise**; `PERCENT` → `value` is a percent (0–100) |
| `discount` (top level) | the **bill-level** discount, same semantics |
| legacy fallback | `items[].discount_paise` and `bill_discount_paise` still work and are treated as `FIXED` |

Precedence is deliberate: an explicit `discount` object always wins over the
legacy paise field, so a client can never send both meanings.

**Validation** (`INVALID_DISCOUNT`): negative values, `PERCENT` above 100, a
`FIXED` amount that is not a whole paise amount, a line discount greater than
its own gross, or a bill discount greater than the discountable subtotal.

---

## 3. Checkout maths (all server-side, integer paise)

Order of operations inside the one sale transaction:

1. **Idempotency first** — `device_id` + `client_sale_id` is looked up *before*
   the cart is parsed, so a replay returns the original receipt even if the
   catalogue changed afterwards (200 + `idempotent: true`, otherwise 201).
2. Products are loaded from SQLite (`selling_price_paise` is authoritative).
   Missing → `PRODUCT_NOT_FOUND`, inactive → `INACTIVE_PRODUCT`.
3. Per line: `gross = unit_price × qty`, then the line discount
   (percent of `gross`, or fixed paise). Over-gross → `INVALID_DISCOUNT`.
4. `discountable = subtotal − Σ line discounts`; the **bill discount** is
   evaluated against that (percent of `discountable`, or fixed paise).
5. `compute_invoice_totals()` (GST service) subtracts the bill discount,
   **allocates it proportionally across lines**, then splits GST-inclusive tax
   per line at its own rate (`tax = net × rate / (100 + rate)`), adds charges
   and rounds the total to the nearest rupee (`round_off_paise`).
6. Payment validation against the **server total**, then stock is checked,
   rows are written, `SALE` movements + outbox + audit land in the same
   transaction.

Worked example (the live smoke case): 2 × Coca Cola ₹40 with a 10 % line
discount + 1 × Good Day ₹35, then a 5 % bill discount:

```
subtotal        11500   (8000 + 3500)
line discount    -800   (10 % of 8000)
bill discount    -535   (5 % of 10700)
net            = 10165
round off        +35   → total 10200 paise
tax (allocated)  2003   (6840 @28 % = 1496, 3325 @18 % = 507)
```

The browser shows the same numbers as an **estimate** (labelled *Estimated
GST*); the receipt always comes from the server.

---

## 4. Payment rules

| Tender | Rule |
|---|---|
| `CASH` | `amount_received_paise` is required by the UI; `< total` → `400 INSUFFICIENT_PAYMENT`; change is computed by the server and returned as `change_paise` |
| `UPI` / `CARD` | the tendered amount **is** the bill total — if a client sends `amount_received_paise` it must equal the total (`400 PAYMENT_MISMATCH`); the browser omits it so the server fills it in |
| `CREDIT` | requires `customer_id` (there is no customers table until Phase 4) → `400 CUSTOMER_REQUIRED_FOR_CREDIT`. The UI disables **Khata** for the walk-in customer |
| all | `payment_reference` (max 200 chars) is stored with the payment row — the CARD terminal approval code the cashier types |

Error `code` values a client can branch on:

```
CART_EMPTY, CART_TOO_LARGE, DEVICE_ID_REQUIRED, CLIENT_SALE_ID_REQUIRED,
PRODUCT_NOT_FOUND, INACTIVE_PRODUCT, INVALID_QUANTITY, INVALID_GST_RATE,
INVALID_DISCOUNT, INVALID_PAYMENT_METHOD, INVALID_PAYMENT_AMOUNT,
INSUFFICIENT_PAYMENT, PAYMENT_MISMATCH, CUSTOMER_REQUIRED_FOR_CREDIT,
INSUFFICIENT_STOCK, VALIDATION_ERROR
```

The envelope is unchanged: `{ok:false, message, status, code}` → `ApiError`
in the browser.

---

## 5. Sales history API

`GET /api/sales` (permission `sale:read`) now accepts:

| Param | Behaviour |
|---|---|
| `q` | matches bill number, customer name or phone (SQL `LIKE`, case-insensitive) |
| `date_from`, `date_to` | inclusive `YYYY-MM-DD`, compared against the sale's **UTC** `created_at` prefix |
| `page`, `page_size` | unchanged; the response now also carries `pages` |

`GET /api/sales/{reference}` accepts a sale id, a bill number
(`INV-20261004-000001`) or the original `client_sale_id` — it is what the
receipt **reprint** button calls, so a reprint always re-reads the immutable
stored receipt instead of a stale list row.

---

## 6. Frontend (UI preserved, behaviour hardened)

| File | What changed |
|---|---|
| `src/pages/PosPage.tsx` | server search: 250 ms debounce → `GET /products/search`, exact barcode/SKU lookup on Enter (falls back to text search), *Show more* pagination, loading / error / empty states. Item discount now supports **% presets and a flat ₹ input**; a **Bill Discount** control (% or ₹) sits in the summary. Checkout sets `isProcessing`, clears the cart **only after** the server confirms, refreshes the grid, and shows code-aware toasts |
| `src/components/pos/PaymentModal.tsx` | new `isProcessing` prop → *Processing…*, disabled buttons (no double-submit); passes the CARD approval code as `reference`; **Khata disabled for walk-in** and auto-falls back to Cash |
| `src/services/sales.ts` | payload sends discount **specs** (`items[].discount`, `discount`) plus `payment_reference`; `getAll()` takes `q` / `dateFrom` / `dateTo` / `page` / `pageSize` and returns `meta.pages`; held-bill copy says *browser-local* |
| `src/services/products.ts` | `posSearch()` over `/products/search` |
| `src/pages/BillsPage.tsx` | debounced server `q` + date-range filters, *Showing X of Y*, reprint through `GET /api/sales/{id}` |
| `src/components/pos/HeldBillsModal.tsx` | `Local terminal only` badge + a banner that holds are lost on reload |
| `src/services/api.ts`, `src/context/AppContext.tsx` | network failure copy is exactly **"Unable to reach local POS server."** (checkout adds "Your cart is kept — please retry.") |

Rules that did **not** change: money is integer paise on the wire, display-only
floats stay in rupees, no split payments, no floating-point arithmetic in
checkout logic, and a failed checkout **never** empties the cart.

---

## 7. Verification

```powershell
# backend — 161 tests
cd backend; .\.venv\Scripts\python -m pytest tests --tb=line
# frontend
npm run lint ; npm run build
```

`backend/tests/test_phase3_pos_billing.py` adds **54** tests covering:

- product/stock/price/GST authority (client prices are ignored)
- line discounts: percent and fixed, merging rules, over-gross rejection
- bill discounts: percent and fixed, precedence over the legacy paise field,
  clamped to the discountable subtotal
- GST-inclusive tax split after discounts, round-off, additional charges
- tenders: CASH change, `INSUFFICIENT_PAYMENT`, `PAYMENT_MISMATCH`,
  `CUSTOMER_REQUIRED_FOR_CREDIT`, `payment_reference` storage
- idempotent replay (before and after catalogue changes), transaction
  rollback (`INSUFFICIENT_STOCK` leaves no sale, no movements, no outbox)
- receipt reprint by id / bill number / `client_sale_id`
- sales list search + `date_from`/`date_to` + pagination, RBAC on every route
- POS `/products/search` (text, exact barcode, exact SKU, category, paging)

### Live smoke

11 checks against `uvicorn` on a throwaway database: `phase: 3` health, cashier
login, text + barcode search, a real checkout with a 10 % line discount and a
5 % bill discount (server total `10200`, discount `1335`, round-off `35`),
idempotent replay of the same `client_sale_id`, date-filtered sales list,
receipt by bill number, stock 48 → 46, and `400` for a credit sale without a
customer. The Vite dev server was started and served the built app (HTTP 200).

---

## 8. Honest TODO list — **not** implemented in Phase 3

| Area | Status |
|------|--------|
| Firebase / Firestore sync | not started — outbox rows are queued, nothing consumes them |
| Split payments | deliberately absent; one tender per bill |
| Held bills (server-side) | still browser-tab memory; the UI labels them *Local terminal only* |
| Thermal / ESC-POS printing | on-screen receipt + reprint only |
| Sales returns, voids | `salesService.processReturn()` throws `501` |
| Customers / Khata ledger | `customer_id` is stored but never validated (no table until Phase 4); Khata UI disabled for walk-in |
| Batch/expiry, warehouses, purchases | untouched (Phase 2 scope) |
| Reports, GST returns, analytics | untouched |
| Cloud sync status column | `syncedToCloud` is always `false` in the mapper |

Two Phase 1 assertions were **intentionally updated**: `test_health.py` now
expects `phase == 3` (schema stays v2).

---

## 9. Layout

```
backend/
  app/
    config.py            PHASE = 3
    schemas.py            DiscountSpec + `discount` on lines/bill, payment_reference
    services/
      sales_service.py    discount specs, idempotency-first, payment rules,
                          date-filtered list_sales, error codes, receipt
      gst_service.py      unchanged — authoritative tax maths
    routes/sales.py       POST /sales, GET /sales (+q/date_from/date_to), GET /sales/{ref}
  tests/
    test_phase3_pos_billing.py   54 tests
src/
  pages/PosPage.tsx              server search, discount controls, hardened checkout
  pages/BillsPage.tsx            server q + date filters, reprint via GET /sales/{id}
  components/pos/PaymentModal.tsx  isProcessing, card reference, Khata guard
  components/pos/HeldBillsModal.tsx "Local terminal only" honesty
  services/sales.ts              discount specs, filters, held-bill copy
  services/products.ts           posSearch()
  services/api.ts                network-failure copy
```

See also: [PHASE3_BASELINE.md](./PHASE3_BASELINE.md) (pre-Phase-3 audit),
[PHASE1.md](./PHASE1.md), [PHASE2.md](./PHASE2.md).
