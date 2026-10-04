# PHASE 3 BASELINE — pre-Phase-3 audit of the POS billing surface

Captured on branch `feature/phase3-real-pos` (created from
`feature/phase2-products-inventory` @ `f544a7b`), before any Phase 3 code was
written. Working tree was clean; `pytest tests` = **107 passed** (76 Phase 1 +
31 Phase 2), `npm run lint` / `npm run build` green.

This document records what the POS **already does for real**, what is still
**mock/preview only**, and exactly what Phase 3 will change. Nothing outside
this scope is rewritten.

---

## 1. Current POS behaviour (what happens today when you click PAY)

`src/pages/PosPage.tsx` renders the existing, visually complete POS screen
(preserved as-is by Phase 3):

1. `loadData()` calls `productsService.getAll()` → **`GET /api/products?page_size=500`**
   (real server rows, active products only) and filters them **in the browser**
   (`filteredProducts`, `src/pages/PosPage.tsx:340`).
2. `handleBarcodeSubmit()` matches the typed text against the **already loaded**
   array (exact `barcode`, case-insensitive `sku`) and adds the product.
3. Cart state (`CartItem[]`) lives in React memory. Quantity `+/-`, item
   percent-discount presets (0/5/10 %) and remove are all client-side. Adding
   to the cart **never** touches inventory.
4. The bill summary (subtotal / discount / estimated GST / round-off / total)
   is computed client-side in floating-point rupees — **display only**.
5. `PaymentModal` collects tender (CASH amount received, CARD ref, UPI panel,
   CREDIT/KHATA panel) and calls `onComplete`.
6. `handleCompletePayment()` → `salesService.createSale()` → **`POST /api/sales`**
   with `client_sale_id`, `device_id`, `{product_id, quantity, discount_paise}`
   per line, `payment_method`, `bill_discount_paise`, `amount_received_paise`.
   **No price, subtotal, tax or total is sent** — the server recomputes all of
   them from SQLite (server is already authoritative).
7. On success: receipt modal opens with the server receipt (`receiptToSale`),
   a toast shows the bill number, products are re-fetched to refresh stock.
   The cart is only cleared when the cashier presses *New Sale (F1)*.
8. On failure: toast with the server message; **the cart is kept**.

So the Phase 1 spine (atomic sale, stock deduction, movements, outbox, audit,
idempotency, bill numbers) is already real. What is *not* yet a real,
complete POS workflow is listed in §4.

## 2. Existing APIs used (or to be used) by the POS

| Concern | Endpoint (already shipped) | Status today |
|---|---|---|
| Product search | `GET /api/products/search` (`q`, exact `barcode`/`sku`, `category`) | exists (Phase 2), **POS does not call it** |
| Product browse | `GET /api/products` (`q`, filters, `page`, `page_size`) | used once with `page_size=500` |
| Categories | `GET /api/products/categories` | used |
| Checkout | `POST /api/sales` (`sale:create`) | real, 201 new / 200 idempotent replay |
| Receipt reprint | `GET /api/sales/{id|bill_no|client_sale_id}` | exists; POS/Bills use list rows instead |
| Sales history | `GET /api/sales` (`page`, `page_size`, `q`) | exists; **no `date_from`/`date_to`** |
| Inventory read | `GET /api/inventory/{product_id}` | exists (not used by POS) |
| Session | `GET /api/auth/session`, `POST /api/auth/login` | real, HttpOnly cookie |

Error envelope already carries machine-readable `code`
(`{ok:false, message, status, code}`), but **sales errors raise `ApiError`
without a `code`** — Phase 3 adds them (`INSUFFICIENT_STOCK`, …).

## 3. Existing POS components (all preserved)

| File | Role | Phase 3 treatment |
|---|---|---|
| `src/pages/PosPage.tsx` | catalog grid, search bar, cart, totals, shortcuts | keep layout; swap data source to paged/debounced server search; add real bill-discount control; harden checkout |
| `src/components/pos/PaymentModal.tsx` | tender selection (CASH/UPI/CARD/CREDIT), SPLIT deliberately removed | keep; add `isProcessing` guard + pass CARD/UPI reference |
| `src/components/pos/ReceiptModal.tsx` | thermal + A4 receipt from `Sale` view-model | keep; fed only by the server receipt |
| `src/components/pos/HeldBillsModal.tsx` | held bill queue | keep; label honesty (`Local terminal only`) |
| `src/components/pos/CustomerSelectModal.tsx` | customer picker (mock list) | untouched — customers are Phase 4 |
| `src/services/sales.ts` | sale payload builder, idempotency key, receipt mapper, browser-local holds | send discount **specs** (not computed money); keep idempotency; honest hold labels |
| `src/services/products.ts` | paged catalogue client | add a `posSearch()` wrapper over `/products/search` |
| `src/pages/BillsPage.tsx` | sales history + reprint | wire server `q` + date range; reprint through `GET /api/sales/{id}` |
| `src/services/api.ts` | fetch envelope, `ApiError(code)`, 401 event | clearer network-failure copy |

## 4. Current mock / preview-only behaviour (honest list)

1. **Product search is client-side** over a 500-row download — no debounce, no
   pagination, no exact barcode-first server lookup.
2. **Discounts are percent-only and client-computed**: item presets (0/5/10 %)
   are turned into `discount_paise` in the browser; `billDiscountPercent` /
   `additionalCharges` state exist but **have no UI at all** (always 0).
3. **No discount specs on the wire** — the API only understands fixed paise.
4. **No checkout processing guard** — the PAY button can be double-clicked
   (server idempotency is the only protection).
5. **CREDIT (Khata) sales are recorded with an unvalidated `customer_id`**
   (there is no customers table yet) — anonymous credit must be refused.
6. **Sales history** downloads page 1 (`page_size=200`) and filters in the
   browser; no server date range; reprint reuses the list row instead of
   re-reading the immutable sale.
7. **Held bills are browser-memory only** — honest, but the copy says
   "this terminal only" without making the local-only limitation obvious.
8. **No `date_from`/`date_to`** on `GET /api/sales`.
9. **Sales error responses have no `code`**, so the UI can only show prose.
10. Product cards show live stock, but the cart does not surface stock while
    editing quantity (server rejects at checkout anyway).

## 5. Existing sale transaction (Phase 1 — unchanged)

`backend/app/services/sales_service.py` inside the route's
`BEGIN IMMEDIATE` (`app/routes/sales.py`):

1. idempotency lookup `(device_id, client_sale_id)` → replay returns the
   original receipt with `idempotent: true` (HTTP 200, no writes)
2. product load (active check) + **pre-check** stock
3. line maths from **DB prices** (`selling_price_paise`), line discount,
   bill discount, `compute_invoice_totals()` (centralised GST service)
4. payment validation (CASH ≥ total, non-CASH == total)
5. bill number from `bill_counters` → `INV-YYYYMMDD-NNNNNN`
6. INSERT `sales` + `sale_lines` (snapshot name/hsn/unit/price/gst) + `payments`
7. guarded `UPDATE inventory ... quantity - sold` (re-checked inside the tx) +
   `SALE` row in `stock_movements` (`balance_after`)
8. `outbox` row (`sale`/`CREATE`/`PENDING`) + `audit_log` (`SALE_CREATE`)
9. COMMIT — any failure rolls everything back (asserted by Phase 1 tests)

Price authority, stock re-validation, immutability and idempotency are
therefore **already server-side**; Phase 3 extends them rather than replacing
them.

## 6. Planned Phase 3 changes

**Backend (extend, don't rewrite)**

- `POST /api/sales` accepts `discount: {type: "FIXED"|"PERCENT", value: n}`
  at **line** level and at **bill** level (legacy `discount_paise` /
  `bill_discount_paise` still accepted → no Phase 1/2 break). Percentages are
  evaluated server-side with Decimal → integer paise, `0 ≤ value ≤ 100`.
- Sales error `code`s: `INSUFFICIENT_STOCK`, `PRODUCT_NOT_FOUND`,
  `INACTIVE_PRODUCT`, `INVALID_QUANTITY`, `INVALID_DISCOUNT`,
  `INSUFFICIENT_PAYMENT`, `PAYMENT_MISMATCH`, `CUSTOMER_REQUIRED_FOR_CREDIT`,
  `INVALID_PAYMENT_METHOD`, `CART_EMPTY`.
- `CREDIT` requires a `customer_id` (else `400 CUSTOMER_REQUIRED_FOR_CREDIT`).
- `GET /api/sales` gains `date_from`, `date_to` (UTC date prefix of
  `created_at`); `q` already matches bill no / sale id / customer.
- `PHASE = 3` in `app/config.py` (schema stays v2 — no migration needed).

**Frontend (existing UI preserved)**

- POS grid → debounced `/products/search` + paged fetch; Enter = exact
  barcode/SKU lookup that adds straight to the cart; only active products.
- Cart: item discount as **percent or fixed ₹**, bill discount **percent or
  fixed ₹** (new compact control in the existing summary block), stock shown
  per line, quantity guards unchanged.
- Checkout: `Processing…` guard (double-click), server `code`-aware toasts,
  cart cleared **only** after a confirmed success, honest
  "Unable to reach local POS server." on network failure.
- Bills page: server search + date range; reprint via `GET /api/sales/{id}`.
- Held bills labelled **Local terminal only**.

**Explicitly out of scope (Phase 3)**: Firebase/sync, split payments,
customers/Khata, returns/void, hardware (printer/cash drawer/scale), offline
queue, advanced promotions, schema migration.
