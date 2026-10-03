# PHASE 2 BASELINE — Real Products + Inventory

Inspection snapshot taken **before** any Phase 2 code was written.

* Branch: `feature/phase2-products-inventory`
* Base commit: `fb9af23` ("phase 1") — working tree clean at inspection time
* Docs read: `PHASE1.md`, `README.md`
* No behaviour was changed during this inspection stage.

---

## 1. Existing product functionality (Phase 1 — already real)

| Layer | State |
|-------|-------|
| Table `products` | exists, SQLite, money in INTEGER paise |
| Service `product_service.py` | validate / create / update / deactivate / list / categories |
| Routes `routes/products.py` | GET list, GET categories, GET one, POST, PATCH, DELETE(=deactivate) |
| Frontend `src/services/products.ts` | fully wired to the API (no mock products) |
| Frontend `src/pages/ProductsPage.tsx` | list/create/edit/delete wired; search + category filter are **client-side** |
| Seed | `backend/app/db/seed.py` inserts 16 products directly (not via `create_product`) |

**Fields present today**

```
id, sku (UNIQUE), barcode (UNIQUE, nullable), name, brand,
category_id, category, unit,
selling_price_paise, purchase_price_paise, mrp_paise, wholesale_price_paise,
gst_rate, hsn_code, image, min_stock, batch_tracked, is_active,
created_at, updated_at
```

**Validation already enforced server-side** (`validate_product_payload`):
name required, SKU required + `.upper()` normalised, barcode 8–14 chars,
money → paise via `to_paise()` (Decimal, half-up), non-negative prices,
`gst_rate ∈ {0,5,12,18,28}` (from `gst_service.VALID_GST_RATES`),
selling price > 0, duplicate SKU/barcode → 409 from the DB `UNIQUE` constraint
(app-level `IntegrityError` mapping *and* DB constraint both present).

**Gaps vs the Phase 2 spec**

* no `subcategory`
* no `created_by` / `updated_by`
* no `PUT /products/{id}`
* no `PATCH /products/{id}/status`
* no `GET /products/search?q=`
* no `GET /products/brands`
* list response has `items,total,page,page_size` but **no `pages`**
* list filters support only `q`, `category`, `include_inactive` — missing
  `search` alias, `subcategory`, `brand`, `is_active`, `barcode`, `sku`
* no indexes on `brand` / `subcategory` (`sku`/`barcode` are `UNIQUE`, so SQLite
  already indexes them; `name`, `category_id`, `is_active` are indexed)
* product create records its initial stock as movement type **`PURCHASE`**
  (spec requires `OPENING_STOCK`)
* `created_by` / `updated_by` are not recorded on the product row (they *are*
  recorded in `audit_log`)

## 2. Existing inventory functionality (Phase 1 — already real)

**Table `inventory`**

```
product_id (PK, FK products ON DELETE CASCADE),
quantity        INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
reserved_quantity INTEGER NOT NULL DEFAULT 0 CHECK (>= 0),
reorder_level   INTEGER NOT NULL DEFAULT 0,
updated_at      TEXT
```

**Table `stock_movements`**

```
id, product_id (FK), movement_type CHECK IN ('SALE','PURCHASE','ADJUSTMENT','RETURN'),
quantity, reference_type, reference_id, balance_after, reason, created_at, created_by
index: idx_movements_product(product_id, created_at)
```

**Routes today**

| Method | Path | Permission |
|--------|------|-----------|
| GET | `/api/inventory` (`low_stock_only`, `q`) | `inventory:read` |
| GET | `/api/inventory/movements` (`product_id`, `limit`) | `stock_audit:read` |
| GET | `/api/inventory/{product_id}` | `inventory:read` |
| POST | `/api/inventory/{product_id}/adjust` (`delta`,`reason`,`reason_code`) | `inventory:adjust` |

**Behaviour already correct**

* `adjust_stock()` rejects `delta == 0`, rejects negative results, writes an
  `ADJUSTMENT` movement + `STOCK_ADJUST` audit + outbox row, and rolls back as a
  unit (Python `sqlite3` opens an implicit transaction; `get_db()` rolls back on
  exception, routes call `conn.commit()` only on success).
* POS sales deduct stock inside an explicit `BEGIN IMMEDIATE` transaction and
  write a `SALE` movement (`sales_service.py:409-430`).
* `test_sales.py` proves failed sales roll back inventory *and* movements.

**Gaps vs the Phase 2 spec**

* movement type **`OPENING_STOCK` is missing** (DB `CHECK` constraint would
  reject it) and the future types (`PURCHASE_RETURN`, `SALE_RETURN`,
  `TRANSFER_IN/OUT`, `DAMAGE`, `EXPIRY`) are not modelled yet
* no `GET /api/inventory/{product_id}/movements` (only the flat
  `/api/inventory/movements?product_id=`)
* movement ledger has **no pagination, no `movement_type`, no `date_from` /
  `date_to` filters**
* no `POST /api/inventory/opening-stock`
* no `stock_status` filter (`IN_STOCK` / `LOW_STOCK` / `OUT_OF_STOCK`) and
  **no stock status computed on the server**
* no server-side pagination on `/api/inventory` at all (returns every row)
* no valuation columns (`quantity * purchase_price_paise`)
* `list_inventory` computes `is_low_stock` in Python from `products.min_stock`
  **OR** `inventory.reorder_level` — two competing thresholds (spec: one)
* `adjust_stock()` uses read → modify in Python → write instead of a
  single conditional SQL update

## 3. Two competing low-stock thresholds — decision

Today:

* `products.min_stock` — edited by the Product form ("Min Alert Stock
  Threshold"), returned as `min_stock` on the product API, used by the POS and
  Products pages.
* `inventory.reorder_level` — seeded to the **same value** as `min_stock`
  (`seed.py:149-152`), returned on the inventory API, but **not** used for
  status in `list_inventory` (which ORs both).

**Phase 2 decision — one canonical field: `inventory.reorder_level`.**

* Stock status is computed **only** from `inventory.reorder_level`.
* `products.min_stock` stays as the *product-master editor field* the existing
  Product form already writes; `create_product` / `update_product` mirror it
  into `inventory.reorder_level` in the same transaction (the seed already does
  exactly this), so the two can never disagree.
* The API exposes `reorder_level` (canonical) alongside `stock_status`.
* Documented reason for keeping both columns: `reorder_level` lives on the
  inventory row as required by the inventory model; `min_stock` is the master
  data field the existing UI owns. Only `reorder_level` is ever *read*.

## 4. Money / GST foundations already in place (reuse, do not duplicate)

* `app/utils/money.py` — `to_paise()`, `from_paise()`, `round_to_rupee()`,
  `round_div()`. `to_paise()` converts via `Decimal(str(x))` half-up, so
  `to_paise("125.50") == 12550`. **No second money parser is needed.**
* `app/services/gst_service.py` — `VALID_GST_RATES = (0, 5, 12, 18, 28)`,
  inclusive-GST maths, `compute_invoice_totals()`. Phase 1 POS uses it and it
  is server-authoritative. **No second GST system may be created.**
* All product/inventory money columns are `INTEGER ... CHECK (>= 0)` paise.

## 5. RBAC already in place (`app/dependencies.py`)

| Permission | CASHIER | ADMIN | OWNER |
|------------|:-------:|:-----:|:-----:|
| `product:read` | ✅ | ✅ | ✅ |
| `product:write` | — | ✅ | ✅ |
| `product:deactivate` | — | ✅ | ✅ |
| `inventory:read` | ✅ | ✅ | ✅ |
| `inventory:adjust` | — | ✅ | ✅ |
| `stock_audit:read` | — | ✅ | ✅ |
| `outbox:read` | — | ✅ | ✅ |

This already satisfies the Phase 2 matrix (`PRODUCT_READ`→`product:read`,
`PRODUCT_WRITE`→`product:write`, `INVENTORY_READ`→`inventory:read`,
`INVENTORY_WRITE`/`STOCK_ADJUST`→`inventory:adjust`). Permission names are kept
in Phase 1's `domain:action` form — renaming would break the POS for no gain.
Tests already exist for cashier-403 / admin-200 on both product and inventory
writes.

## 6. Existing tests (must keep passing)

`backend/tests/` — **76 tests**:

| File | Covers |
|------|--------|
| `test_health.py` | health/status |
| `test_auth.py` | login, PIN, session, RBAC |
| `test_gst.py` | inclusive GST maths |
| `test_products.py` | list/search/categories/create/duplicate SKU+barcode/GST/price update/deactivate/404 |
| `test_inventory.py` | list/low-stock/get/adjust RBAC/negative/zero/movement ledger/audit |
| `test_sales.py` | atomic sale, idempotency, rollback, bill numbers, snapshots |
| `test_outbox.py` | outbox permissions + retry |

Known Phase 1 assertions that constrain Phase 2 (do **not** break):

* `test_sales.py` — after one sale, `SELECT * FROM stock_movements WHERE
  product_id='prod-1'` must be a **single** `SALE` row ⇒ **the seeder must not
  write opening-stock movement rows** (the 16 demo products are inserted
  directly with their quantity and have no history).
* `test_sales.py:261,307` — failed operations must leave
  `COUNT(stock_movements) == 0`.
* `test_inventory.py:118` — one adjustment on `prod-2` ⇒ exactly 1 movement.
* `test_products.py` — `total == 16` seeded products; `cat-snk` has 4 items.

Consequence: seeded demo stock has **no opening-stock history**. That is
documented honestly rather than faked. `OPENING_STOCK` movements are produced by
the real API paths (`POST /products` with stock, `POST /inventory/opening-stock`).

## 7. Frontend components to be reused (UI must NOT be redesigned)

| File | What it already does | Phase 2 change |
|------|----------------------|----------------|
| `src/pages/ProductsPage.tsx` | header, filter/search bar, table, create/edit modal, GST select, price grid, stock/min-stock grid, batch checkbox | wire server-side paging/search/filters, loading + empty + error states, add subcategory + Active toggle, honest deactivate label, surface backend validation errors |
| `src/pages/InventoryPage.tsx` | KPI valuation cards, search, CURRENT tab table, MOVEMENTS tab table, stock-adjustment modal | read `stock_status` / `reorder_level` / valuation paise from the server, server-side search/filter/paging, add opening-stock action |
| `src/pages/StockAuditPage.tsx` | barcode fast-count input, expected vs counted table, reconcile button → real adjustments | add a real movement-history tab (no fake rows) |
| `src/pages/PurchasesPage.tsx` | goods-receiving posts one real audited adjustment | leave as-is (no fake GRN) |
| `src/pages/PricingPage.tsx`, `WarehousesPage.tsx`, `BatchesPage.tsx` | read from `productsService` / `inventoryService` | must keep compiling |
| `src/services/products.ts` | real API, `rowToProduct`, paise conversion | add paged list + filters + `PUT` + status endpoint |
| `src/services/inventory.ts` | real movements + adjust; batches/warehouses still mock | add paged movements, opening stock, status; keep batches/warehouses labelled TODO |
| `src/components/layout/Sidebar.tsx`, `TopBar.tsx`, themes, tables, modals | navigation/styling | untouched |
| `src/data/mockData.ts` | `INITIAL_PRODUCTS` is **no longer a data source** for these pages (used only by `PricingPage`? — verify) | keep isolated; never re-introduce as source of truth |

Mock data still used elsewhere (out of Phase 2 scope, must stay isolated):
`INITIAL_BATCHES`, `INITIAL_WAREHOUSES` (via `inventoryService`),
`INITIAL_AUDIT_LOGS`, `INITIAL_ONLINE_ORDERS`, customers/suppliers/sync mocks.

## 8. Planned Phase 2 changes

### Database (schema version 1 → 2, idempotent migration)

1. `products` += `subcategory TEXT NOT NULL DEFAULT ''`,
   `created_by TEXT`, `updated_by TEXT` (`ALTER TABLE ADD COLUMN`).
2. Rebuild `stock_movements` with an expanded `movement_type CHECK` that includes
   `OPENING_STOCK` plus the reserved future types, so no later migration is
   needed when they are implemented.
3. New indexes: `idx_products_brand`, `idx_products_subcategory`,
   `idx_movements_type`, `idx_movements_created`.
   (`sku`/`barcode` already have implicit indexes from their `UNIQUE`
   constraints; `name`/`category_id`/`is_active` are already indexed — no
   redundant duplicates.)
4. `inventory.reorder_level` remains the canonical low-stock threshold
   (mirrored from `products.min_stock`).
5. Seeded demo stock deliberately has **no** movement rows (see §6).

### Backend API (Phase 1 conventions unchanged: `/api`, `ok()`/`fail()` envelope,
HttpOnly cookie, `require(permission)`)

```
GET    /api/products                 + search, subcategory, brand, is_active,
                                      barcode(exact), sku(exact); returns `pages`
GET    /api/products/search?q=       NEW (declared before /{product_id})
GET    /api/products/categories      exists
GET    /api/products/brands          NEW
GET    /api/products/{id}            exists
POST   /api/products                 exists (now records OPENING_STOCK movement)
PUT    /api/products/{id}            NEW (full update)
PATCH  /api/products/{id}            exists (partial update, kept)
PATCH  /api/products/{id}/status     NEW (activate / deactivate)
DELETE /api/products/{id}            exists → still deactivates, never destroys

GET    /api/inventory                + search, category, stock_status, page,
                                      page_size; per-row valuation paise,
                                      reorder_level, stock_status; returns `pages`
GET    /api/inventory/{product_id}   exists (+ status/valuation fields)
GET    /api/inventory/{product_id}/movements   NEW
                                      (page, page_size, movement_type,
                                       date_from, date_to)
GET    /api/inventory/movements      exists (flat, + same filters)
POST   /api/inventory/{product_id}/adjust      exists (made single-statement
                                      atomic, reason required)
POST   /api/inventory/opening-stock  NEW (absolute opening quantity →
                                      OPENING_STOCK movement + audit)
```

No duplicate endpoints: `POST /api/inventory/adjust` from the spec is
equivalent to the existing `POST /api/inventory/{product_id}/adjust`, so the
existing path is kept.

### Service rules

* Opening stock: sets quantity, writes `OPENING_STOCK` movement with
  `balance_after`, audit `OPENING_STOCK`, outbox row — all in one transaction.
* Adjustments: one conditional SQL update
  (`UPDATE inventory SET quantity = quantity + ? WHERE product_id = ?`
  + a following check), so concurrent requests cannot lose updates; negative
  results rejected before any write.
* Every stock change writes exactly one movement + one audit row, atomically.
* Products are **deactivated**, never deleted (`is_active = 0`);
  `sale_lines` snapshots keep historical bills intact.
* Product price changes never touch `sales` / `sale_lines` (Phase 1 already
  snapshots; a Phase 2 test will prove it).
* Audit actions added: `PRODUCT_CREATE`, `PRODUCT_UPDATE`,
  `PRODUCT_DEACTIVATE`, `PRODUCT_REACTIVATE`, `OPENING_STOCK`,
  `STOCK_ADJUST`.
* Error codes added to the envelope as an optional `code` field
  (`PRODUCT_NOT_FOUND`, `DUPLICATE_SKU`, `DUPLICATE_BARCODE`, `INVALID_PRICE`,
  `INVALID_GST_RATE`, `INVALID_STOCK_ADJUSTMENT`, `INSUFFICIENT_STOCK`, …)
  while keeping the human-readable `message` the frontend already shows.

### Frontend

* `ProductsPage` — server-driven list (page/page_size/search/category/status),
  loading spinner, empty state, backend error toasts, subcategory field,
  Active/Inactive toggle, "Deactivate" wording, `PUT`/status calls.
* `InventoryPage` — server `stock_status` + `reorder_level` + paise valuation,
  server search/category/status/paging, opening-stock action.
* `StockAuditPage` — real movement history section.
* `PurchasesPage` — unchanged behaviour (real audited adjustment).
* No page is rewritten; only data wiring and honest labels.

## 9. Explicitly out of scope (Phase 2)

Firebase / sync engine, purchases+GRN system, batches & expiry, warehouses,
customers, suppliers, returns, split payment, printing, hardware/scanner
integration (barcode **storage + exact lookup only**), reports, AI, multi-branch,
loyalty, promotions, cloud dashboard.

## 10. Verification plan

```powershell
cd backend
.\.venv\Scripts\python -m pytest tests     # 76 Phase 1 + new Phase 2 tests
npm run lint                               # tsc --noEmit
npm run build                              # vite build
# then a live uvicorn smoke covering the 18 steps in the Phase 2 brief
```
