# PHASE 2 — Real products + inventory

Phase 1 proved the local-first spine (auth, RBAC, atomic POS sale, outbox).
Phase 2 replaces the two biggest remaining mock surfaces — the **Products**
catalogue and the **Inventory** module — with server-driven data:

- server-side **pagination, search and filters** (no more loading everything and filtering in the browser),
- a **stock movement ledger** where every stock change is attributable,
- **opening stock** as a first-class, once-only operation,
- **stock status** and **stock valuation** computed in SQLite, not in React,
- the same **permissions, audit trail and outbox hooks** as the sale path.

The frontend pages were **rewired, not redesigned**: `ProductsPage`,
`InventoryPage` and `StockAuditPage` keep their existing layout, components,
class names and copy. `src/index.css`, `Sidebar`, `App.tsx`, the POS page and
every other screen are untouched.

Firebase/sync, purchases/GRN, batches/expiry, warehouses, customers, returns,
printing, reports and AI remain **out of scope**.

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
.\\.venv\Scripts\python -m pytest tests     # 107 tests (76 Phase 1 + 31 Phase 2)
..\npm run lint                            # tsc --noEmit
..\npm run build                           # vite production build
```

An existing **Phase 1 database is migrated in place** on startup (schema v1 →
v2, see §6); no manual step is required.

---

## 2. Permission matrix

Nothing was renamed. Phase 2 only **uses** the permissions Phase 1 already
defined, so a session minted in Phase 1 still works.

| Permission | Phase 2 routes |
|------------|----------------|
| `product:read` | `GET /products`, `/products/search`, `/products/categories`, `/products/brands`, `/products/subcategories`, `GET /products/{id}` |
| `product:write` | `POST /products`, `PUT /products/{id}`, `PATCH /products/{id}` |
| `product:deactivate` | `PATCH /products/{id}/status`, `DELETE /products/{id}` |
| `inventory:read` | `GET /inventory`, `GET /inventory/{id}` |
| `stock_audit:read` | `GET /inventory/movements`, `GET /inventory/{id}/movements` |
| `inventory:adjust` | `POST /inventory/{id}/adjust`, `POST /inventory/opening-stock`, `POST /inventory/{id}/opening-stock` |

A `cashier` mutating stock gets `403 Permission denied`; a `cashier` **can**
still browse the catalogue and the stock list (read-only), which is what the
Inventory page shows them.

---

## 3. HTTP API

Base path `/api`. Two envelope additions over Phase 1:

```jsonc
// success — `meta` is optional
{ "ok": true,  "data": <payload>, "message": "...", "meta": { ... } }
// failure — `code` is optional
{ "ok": false, "data": null, "message": "...", "status": 400, "code": "DUPLICATE_SKU" }
```

`code` lets the UI branch on the failure kind without parsing prose; `message`
stays human-readable and is shown verbatim in the toast.

### Pagination contract (deliberate)

| Endpoint | `data` | pagination / summary |
|----------|--------|----------------------|
| `GET /api/products`, `/products/search` | **object** `{items, total, page, page_size, pages}` | inside `data` |
| `GET /api/inventory` | **raw array** | in `meta` = `{total, page, page_size, pages, summary}` |
| `GET /api/inventory/movements`, `/inventory/{id}/movements` | **raw array** | in `meta` = `{total, page, page_size, pages}` |

The split is intentional. The Phase 1 tests (and any consumer written against
them) already read `data["items"]` for products and assert `len(data) == 16`
for the inventory list and `len(movements) == 1` for movements. Keeping those
`data` shapes byte-identical means **no Phase 1 contract breaks** while the
response still carries full pagination. `meta` is additive — an envelope key
that did not exist before.

### Products

| Method | Path | Permission | Notes |
|--------|------|-----------|-------|
| GET | `/api/products` | `product:read` | `q`, `category`, `subcategory`, `brand`, `barcode`, `sku`, `is_active`, `include_inactive`, `page`, `page_size` (max 500) |
| GET | `/api/products/search` | `product:read` | `q` matches name/SKU/barcode/subcategory; `barcode` / `sku` match **exactly** (POS scan path) |
| GET | `/api/products/categories` | `product:read` | `{id, name, count}` |
| GET | `/api/products/brands` | `product:read` | `{name, count}` |
| GET | `/api/products/subcategories` | `product:read` | `{name, count}` |
| GET | `/api/products/{id}` | `product:read` | 404 `PRODUCT_NOT_FOUND` |
| POST | `/api/products` | `product:write` | `stock > 0` writes an `OPENING_STOCK` movement |
| PUT | `/api/products/{id}` | `product:write` | **full** replace, body = `ProductCreate` |
| PATCH | `/api/products/{id}` | `product:write` | partial update (only supplied fields) |
| PATCH | `/api/products/{id}/status` | `product:deactivate` | body `{"is_active": true\|false}` |
| DELETE | `/api/products/{id}` | `product:deactivate` | soft delete (`is_active = 0`) |

Static sub-resources are declared **before** `/{product_id}` so they are never
swallowed by the detail path.

Each product row is decorated server-side with `stock`, `stock_status` and
`is_low_stock` (LEFT JOIN against `inventory`), so the catalogue page never
needs a second request.

### Inventory

| Method | Path | Permission | Notes |
|--------|------|-----------|-------|
| GET | `/api/inventory` | `inventory:read` | `q`, `category`, `stock_status`, `low_stock_only`, `is_active`, `page`, `page_size` |
| GET | `/api/inventory/movements` | `stock_audit:read` | `product_id`, `movement_type`, `date_from`, `date_to`, `page`, `page_size` (`limit` accepted as an alias) |
| GET | `/api/inventory/{product_id}` | `inventory:read` | row + `opening_recorded` flag |
| GET | `/api/inventory/{product_id}/movements` | `stock_audit:read` | scoped ledger, each row carries `previous_balance` |
| POST | `/api/inventory/opening-stock` | `inventory:adjust` | body includes `product_id` (400 `VALIDATION_ERROR` if missing) |
| POST | `/api/inventory/{product_id}/opening-stock` | `inventory:adjust` | same operation, id in the path |
| POST | `/api/inventory/{product_id}/adjust` | `inventory:adjust` | body `{delta, reason, reason_code?}` |

`GET /api/inventory/movements` is declared before `GET /api/inventory/{product_id}`
for the same reason. `GET /api/inventory` defaults to **active products only**;
pass `is_active=false` (or `true`) to pin it.

### Error `code` values

`PRODUCT_NOT_FOUND` · `DUPLICATE_SKU` · `DUPLICATE_BARCODE` · `INVALID_PRICE`
· `INVALID_GST_RATE` · `INVALID_STOCK_ADJUSTMENT` · `INVALID_MOVEMENT_TYPE` ·
`INVALID_STOCK_STATUS` · `INSUFFICIENT_STOCK` · `STOCK_CONFLICT` ·
`OPENING_STOCK_ALREADY_SET` · `INVENTORY_NOT_FOUND` · `VALIDATION_ERROR` ·
`INTERNAL_ERROR`.

---

## 4. Domain rules

### Stock status

Computed **only** from `inventory.reorder_level` — there is no second threshold
to keep in sync:

```python
quantity <= 0                 -> OUT_OF_STOCK
0 < quantity <= reorder_level -> LOW_STOCK
quantity >  reorder_level     -> IN_STOCK
```

The three states are mutually exclusive and `in_stock + low_stock +
out_of_stock == sku_count` always holds (asserted in the test suite).

`stock_status` is the filter and the badge the UI shows. The **legacy
`is_low_stock` flag** and the Phase 1 `low_stock_only` parameter use the wider
predicate `quantity <= reorder_level`, so a product sitting at **zero counts as
"low"** — that is the behaviour Phase 1 shipped, and it is kept.

### Reorder level vs `min_stock`

The product form has one field, `min_stock`. On create/update the service
mirrors it into `inventory.reorder_level`, and the inventory read exposes it
back as `reorder_level` (plus `min_stock` on the product row). It is the same
number under two names because the two tables already had two columns.

### Opening stock

- Absolute quantity (`quantity`, 0 … 1 000 000), **not** a delta.
- Allowed **once** per product; a second attempt is `409
  OPENING_STOCK_ALREADY_SET`. Products that already have stock (created with
  `stock > 0`, seeded, or already sold) report `opening_recorded: true` and the
  UI hides the action.
- Writes an `OPENING_STOCK` row in `stock_movements`, an `audit_log` entry and
  an `outbox` row in the **same transaction**.
- The seed deliberately writes **no** opening-stock movements (Phase 1 tests
  assert `COUNT(stock_movements) == 0` on a fresh database). Real opening stock
  is recorded by the shop through the UI afterwards.

### Adjustments

- `delta` is a signed integer; `0` is rejected (`INVALID_STOCK_ADJUSTMENT`).
- `reason` is **required** (min 1 char) — an anonymous stock change is a bug,
  not a feature.
- The row is updated with a **conditional (compare-and-swap)
  `UPDATE ... WHERE quantity + ? >= 0`** inside the transaction. If the guarded
  row count is 0 the service re-reads: unknown product → `INVENTORY_NOT_FOUND`,
  would go negative → `INSUFFICIENT_STOCK`, otherwise a concurrent writer →
  `STOCK_CONFLICT` (409). The movement's `balance_after` is therefore always
  the real post-state.
- Every adjustment writes movement + audit + outbox atomically; a failure
  anywhere rolls the whole thing back.

### Movement ledger

Movement types: `OPENING_STOCK`, `SALE`, `PURCHASE`, `ADJUSTMENT`, `RETURN`
(the `stock_movements` CHECK also allows `PURCHASE_RETURN`, `SALE_RETURN`,
`TRANSFER_IN`, `TRANSFER_OUT`, `DAMAGE`, `EXPIRY` for later phases).

Rows are ordered `created_at DESC, id DESC` and carry `product_id`,
`product_name`, `movement_type`, `quantity` (signed), `balance_after`,
`previous_balance`, `reference_type`, `reference_id`, `reason`, `created_by`,
`created_by_name`, `created_at`.

### Valuation

Integer paise, computed in SQL over the **whole filtered set**, not just the
current page:

```
cost_value_paise    = SUM(quantity * purchase_price_paise)
selling_value_paise = SUM(quantity * selling_price_paise)
```

`meta.summary` also carries `sku_count`, `units`, `in_stock`, `low_stock`,
`out_of_stock` and `below_threshold`.

### Atomicity

Every service write in Phase 2 is wrapped in `database.transaction(conn)`
(`BEGIN IMMEDIATE`, nested-safe, rolls back on exception) — the same wrapper
the POS sale uses. Product create/update, adjustments and opening stock each
commit exactly once, at the route level.

---

## 5. Frontend

### Data layer

| File | What changed |
|------|--------------|
| `src/services/api.ts` | `ApiResponse.meta`, `ApiError.code`, `Envelope.meta/code`, new `apiPut` |
| `src/services/products.ts` | `listPage()`, `pageOf()`, `toQuery()`, `getBrands()`, `getSubcategories()`, `replace()` (PUT), `setStatus()` (PATCH `/status`), `deriveStatus` now trusts the server `stock_status` |
| `src/services/inventory.ts` | `InventoryItem/Summary/Page`, `MovementPage`, `listPage()`, `get()`, `listMovements()`, `setOpeningStock()`, `recordStockAdjustment()` returns the server's new quantity |
| `src/types/index.ts` | `Product.subcategory?`, `StockMovement.type` includes `OPENING_STOCK` |

### Pages (UI preserved, data swapped)

- **ProductsPage** — debounced server search, category + status filters, server
  pagination footer, loading / empty / error states, an editable *Subcategory*
  field, Activate / Deactivate actions (honest labels — `DELETE` is a soft
  delete), `replace()` on edit, and a server-checked audited stock adjustment
  when the counted quantity changes.
- **InventoryPage** — Stock tab is server-paginated with a status filter and
  server-computed valuation KPIs; Movements tab is a paged ledger with a type
  filter; *Opening Stock* modal only appears when `openingRecorded` is false;
  the adjustment modal surfaces the API's `message` on failure.
- **StockAuditPage** — loading / error states, honest error handling on
  reconcile, plus a *Recent Stock Movements* section fed by
  `listMovements({ pageSize: 50 })`.

Batches / warehouses tabs still read local mock data and are labelled
`TODO(phase-3)` in `src/services/inventory.ts`.

---

## 6. Database schema v2

`backend/app/db/schema.py`, `SCHEMA_VERSION = 2`.

**Changed tables**

- `products` — added `subcategory TEXT NOT NULL DEFAULT ''`,
  `created_by TEXT`, `updated_by TEXT` (both `REFERENCES users(id)`).
- `stock_movements` — the `movement_type` CHECK gained `OPENING_STOCK`.
- New indexes: `idx_products_brand`, `idx_products_subcategory`.

**Migration 2** is a *callable* migration run on an existing Phase 1 file:

1. `ALTER TABLE ... ADD COLUMN` for the three product columns (safe: all have
   non-null defaults).
2. Rebuild `stock_movements` the SQLite way — create the new table, copy the
   rows, drop the old one, rename — so the CHECK constraint can be widened.
   **Existing sale/adjustment history is copied verbatim.**
3. Recreate the movement indexes.
4. Bump `schema_meta.version` to `2`.

The Phase 2 indexes are created in `PHASE2_INDEX_SQL` **after** the migrations,
because a Phase 1 `products` table has no `subcategory` column until migration 2
adds it (creating them from `SCHEMA_SQL` would fail on an upgraded database).

A brand-new database gets the full v2 schema immediately and skips the
migration.

---

## 7. Verification

```powershell
# backend — 107 tests
cd backend; .\.venv\Scripts\python -m pytest tests --tb=line
# frontend
npm run lint ; npm run build
```

`backend/tests/test_phase2_products_inventory.py` adds 31 tests covering:

- paged product list, filters, search, categories/brands/subcategories facets
- create with opening stock, `PUT` full replace, `PATCH`, status toggle
- duplicate SKU / barcode, invalid price / GST rate error codes
- product history snapshot immutability (editing a product never rewrites a
  printed sale) and RBAC on every new route
- inventory pagination, valuation summary, status filter, single-row read,
  the canonical `stock_status` rule
- opening stock on both routes, once-only enforcement
- adjustment atomicity + rollback (a failing movement leaves the quantity
  untouched)
- movement pagination and the scoped `/{id}/movements` endpoint
- seed honesty (no phantom opening movements) and a POS-sale regression
- **schema migration**: a hand-built Phase 1 database upgrades to v2 with its
  movement history intact

### Live smoke

21 checks against `uvicorn` on `127.0.0.1:8126` with a throwaway database:
health/status report `phase: 2` / `schemaVersion: 2`, every products and
inventory endpoint above, opening stock twice, an adjustment, a real POS sale
decrementing stock and writing exactly one `SALE` movement, and cashier `403`s.

---

## 8. Honest TODO list — **not** implemented in Phase 2

| Area | Status |
|------|--------|
| Firebase / Firestore sync | not started — outbox rows are queued but nothing consumes them |
| Purchases, GRN, suppliers | mock UI only (receiving still posts a plain audited adjustment) |
| Batch / expiry (FEFO), warehouses | no schema, no API; UI reads mock data, labelled `TODO(phase-3)` |
| Customers / Khata ledger | `customer_id` accepted on sales but never validated |
| Sales returns, sale void | `salesService.processReturn()` throws `501`; `sale:void` permission exists, **no route** |
| Split payments, held bills, X/Z reports | client-local demo state |
| Thermal/A4 printing, ESC/POS | on-screen receipt only |
| Reports, GST returns, analytics | not started |
| Product images | `image` is a URL string on the product row; no upload endpoint |
| Bulk CSV import / barcode label printing | not started |
| Audit-log and outbox **viewer pages** | API exists, pages are still static |
| Multi-branch, warehouses, transfers | not started |
| AI insights | not started |

Two Phase 1 test assertions were **intentionally updated**: `test_health.py`
now expects `schemaVersion == 2` and `phase == 2`.

---

## 9. Layout

```
backend/
  app/
    config.py            PHASE = 2 + settings
    errors.py            ApiError now carries an optional `code`
    utils/api.py          ok(data, message, meta=None) / fail(..., code=)
    db/schema.py          schema v2, migration 2, PHASE2_INDEX_SQL
    services/
      product_service.py  validation, paging, facets, decorate, CRUD
      inventory_service.py status, valuation, adjust, opening stock, ledger
    routes/
      products.py         list/search/facets/GET/POST/PUT/PATCH/status/DELETE
      inventory.py        list/movements/get/adjust/opening-stock
  tests/
    test_phase2_products_inventory.py   31 tests
src/
  services/api.ts          meta + code + apiPut
  services/products.ts     paged catalogue client
  services/inventory.ts    paged stock + ledger client
  pages/ProductsPage.tsx   server-driven catalogue (UI unchanged)
  pages/InventoryPage.tsx  server-driven stock + movements (UI unchanged)
  pages/StockAuditPage.tsx counting + recent movements (UI unchanged)
```

