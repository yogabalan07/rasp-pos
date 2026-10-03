# PHASE 1 BASELINE — YB Inventory & POS

Status: **BASELINE CAPTURED** before any Phase 1 code changes.
Branch: `feature/phase1-real-backend`
Baseline commit: `main @ fc67291` (working tree clean at capture time).

This document records the repository state *before* the real backend is introduced,
what Phase 1 will change, and what must not be touched.

---

## 1. Current architecture (as found)

```
Browser (React 19 SPA)
   └── NO network calls anywhere in src/
         └── src/services/*.ts = in-memory module-level arrays + fake `delay(80)`
               └── lost on every page reload
```

* Frontend framework: **React 19.0.1 + TypeScript + Vite 8 + Tailwind CSS v4**
* Package manager: **npm** (`package.json`, **no lockfile**, `node_modules` not installed)
* Routing: hand-rolled `switch (activeRoute)` in `src/App.tsx` (no react-router, no URL sync)
* State: single React Context `src/context/AppContext.tsx`
* Backend: **none** (no Python, no server, no nginx, no systemd, no DB files)
* Cloud: **none** (no Firebase SDK — intentionally out of scope for Phase 1)
* Tests: **none**
* Total source: 61 files, ~10,533 lines of TS/TSX
* Git: single commit `fc67291 Initial commit`

**Verified by grep:** zero `fetch(`, zero `axios`, zero `localStorage`/`sessionStorage`,
zero `firebase`, one `setInterval` (ServerMonitorPage @ 5000 ms).

---

## 2. Important existing files

| File | Lines | Role | Phase 1 action |
|---|---:|---|---|
| `src/App.tsx` | 152 | Router switch + layout | **Modify** (auth guard only) |
| `src/main.tsx` | 5 | Entry | untouched |
| `src/context/AppContext.tsx` | 138 | Global state, route, toasts | **Modify** (real session bootstrap, logout) |
| `src/types/index.ts` | 295 | All domain types | **untouched** (frontend view models) |
| `src/services/api.ts` | 27 | `delay`/`createResponse` only | **Rewrite** (real HTTP client, keep old exports) |
| `src/services/auth.ts` | 149 | Plaintext users + PINs | **Rewrite** (real login/session) |
| `src/services/products.ts` | 78 | In-memory products | **Rewrite** (real Products API) |
| `src/services/inventory.ts` | 103 | In-memory movements/batches | **Rewrite** (real Inventory API) |
| `src/services/sales.ts` | 118 | In-memory sales | **Rewrite** (real POST /api/sales) |
| `src/services/customers.ts` | 38 | In-memory customers | **keep mock** (TODO Phase 7) |
| `src/services/suppliers.ts` | 37 | In-memory POs/suppliers | **keep mock** (TODO Phase 6) |
| `src/services/sync.ts` | 101 | Simulated offline flag | **keep mock** (TODO Phase 10) |
| `src/services/serverMonitor.ts` | 23 | Jittered fake telemetry | **keep mock** (TODO Phase 12) |
| `src/data/mockData.ts` | 843 | 14 fixture exports | **keep** (used by non-Phase-1 pages + seed source) |
| `src/pages/PosPage.tsx` | 778 | POS screen | **untouched UI**; behavior changes via services |
| `src/pages/AuthPages.tsx` | 248 | Login/PIN/forgot | **Modify** (real errors, remove seeded password) |
| `src/components/layout/TopBar.tsx` | 308 | Status + role switcher | **Modify** (remove demo role switcher → real user menu) |
| `src/components/pos/PaymentModal.tsx` | 276 | Tender UI | **untouched** (payload built in `sales.ts`) |
| `src/components/pos/ReceiptModal.tsx` | 218 | Receipt print | **untouched** (fed by API receipt shape) |
| `vite.config.ts` | 22 | Vite config | **Modify** (add `/api` dev proxy) |
| `package.json` | 36 | Deps/scripts | **Modify** (scripts only if needed) |

### Current POS components (reusable, preserved)
`PosPage`, `PaymentModal`, `ReceiptModal`, `HeldBillsModal`, `CustomerSelectModal` — all preserved as-is.

### Current inventory components (preserved)
`InventoryPage`, `BatchesPage`, `StockAuditPage`, `WarehousesPage`, `PricingPage`, `ProductsPage`.

---

## 3. Current frontend routes (36 pages)

Sidebar (31): `/dashboard /pos /bills /sales-returns /online-orders /products /inventory
/batches /warehouses /stock-audit /purchases /suppliers /customers /credit /gst /invoices
/cash /shifts /offers /pricing /reports /analytics /ai /server /sync /cloud /hardware
/audit /backups /owner /settings`

Router-only (not in sidebar): `/branches`, `/supplier-returns` (mis-wired to SalesReturnsPage),
`/notifications`, `/login`, `/register`, `/pin-login`, `/forgot-password`.
Unknown route → falls back to `<PosPage/>`.

**Phase 1 route impact:** only `/login` becomes genuinely functional + a redirect guard is added.

---

## 4. Current services (what actually happens today)

| Service | Real? | Notes |
|---|---|---|
| `auth.ts` | ❌ mock | password arg ignored (`_password`), PINs hardcoded, no session, defaults to OWNER |
| `products.ts` | ❌ mock | module `let products` from `INITIAL_PRODUCTS` |
| `inventory.ts` | ❌ mock | batches/warehouses/movements arrays |
| `sales.ts` | ❌ mock | `saleNum = 9822 + sales.length` bill numbers, non-atomic stock loop |
| `customers.ts` | ❌ mock | in-memory |
| `suppliers.ts` | ❌ mock | no `create` method → SuppliersPage writes local state only |
| `sync.ts` | ❌ mock | `isSimulatedOffline` boolean; bulk-flip PENDING→SYNCED |
| `serverMonitor.ts` | ❌ mock | random jitter |
| `api.ts` | ❌ fake | `delay()` + `createResponse()` only |

---

## 5. Current mock data

`src/data/mockData.ts` exports 14 constants:
`INITIAL_CATEGORIES` (6) · `INITIAL_PRODUCTS` (**16**, with rupee prices, GST %, HSN, stock) ·
`INITIAL_CUSTOMERS` (5) · `INITIAL_SUPPLIERS` (4) · `INITIAL_BATCHES` (5) ·
`INITIAL_PURCHASE_ORDERS` (3) · `INITIAL_WAREHOUSES` (3) · `INITIAL_BRANCHES` (3) ·
`INITIAL_RECENT_BILLS` (3 Sales) · `INITIAL_SYNC_RECORDS` (5) · `INITIAL_AUDIT_LOGS` (5) ·
`INITIAL_NOTIFICATIONS` (4) · `INITIAL_SERVER_TELEMETRY` (1) · `INITIAL_ONLINE_ORDERS` (2).

**Phase 1 uses `INITIAL_PRODUCTS` only as the *seed source* for the real SQLite catalog**
(16 products → `products` + `inventory` rows). All other fixtures remain as UI-only data
for pages that are explicitly **TODO** in Phase 1.

---

## 6. Problems Phase 1 will fix

| # | Problem | Evidence |
|---|---|---|
| 1 | No backend at all | no `*.py`, no server files |
| 2 | No persistence — reload loses everything | in-memory module arrays |
| 3 | Fake authentication | `services/auth.ts:98` `_password` ignored |
| 4 | No session; app boots as OWNER | `auth.ts:69` |
| 5 | Plaintext PINs in bundle, leaked in UI hints | `auth.ts:4-67`, `AuthPages:175` |
| 6 | Demo role switcher = privilege escalation | `TopBar.tsx:273-289` |
| 7 | Bill numbers collide across devices | `sales.ts:29` `9822 + sales.length` |
| 8 | Non-atomic sale (stock deducted in a loop, no rollback) | `sales.ts:47-50` |
| 9 | No idempotency → duplicate sales on double-click | no `client_sale_id` |
| 10 | Float money everywhere | `types/index.ts` all `number` |
| 11 | GST computed in the component | `PosPage.tsx:279-293` |
| 12 | Split/card tender data discarded | `PaymentModal:70-75` |
| 13 | No outbox, no audit writes | `sync.addRecord` called from sales only |
| 14 | Stock ledger can diverge from product stock | `inventory.ts:95` unclamped vs `Math.max(0,…)` |
| 15 | Double stock adjustment risk | `InventoryPage:60+69` and `StockAuditPage:64+72` call **both** adjust paths |
| 16 | No authorization on any route | grep: 0 role checks in `src/pages` |
| 17 | Typecheck cannot run | `npm run lint` fails (no `node_modules`) |

---

## 7. Files that will be CHANGED

**Backend (new tree):** everything under `backend/` is new.

**Frontend (surgical edits only):**
1. `src/services/api.ts` — add real `apiRequest()` HTTP client; **keep** `delay`/`createResponse`/`ApiResponse` exports so untouched mock services still compile.
2. `src/services/auth.ts` — real login (email+password, PIN), logout, `/me`, register.
3. `src/services/products.ts` — real CRUD/search, paise→rupee mapping for the existing `Product` view model.
4. `src/services/inventory.ts` — real movements + adjust; batches/warehouses stay mock (TODO).
5. `src/services/sales.ts` — real `POST /api/sales` + list/get; held bills stay mock (TODO).
6. `src/context/AppContext.tsx` — session bootstrap via `/api/auth/me`, `logout()`, remove `switchRole`.
7. `src/App.tsx` — unauthenticated → render `AuthPages`.
8. `src/pages/AuthPages.tsx` — real server error display, remove hardcoded password, fix PIN hint.
9. `src/components/layout/TopBar.tsx` — replace demo role switcher with real user menu + **Logout**.
10. `src/pages/InventoryPage.tsx` — drop the duplicate `productsService.updateStock` call (2 lines).
11. `src/pages/StockAuditPage.tsx` — drop the duplicate `productsService.updateStock` call (1 line).
12. `vite.config.ts` — add `/api` → `http://127.0.0.1:8000` dev proxy.
13. `README.md` — real setup/run/deploy instructions.

**Not changed:** `src/pages/*` layout/visual code (except the 2 duplicate-adjust lines),
`src/components/pos/*`, `src/components/layout/Sidebar.tsx`, `src/components/common/*`,
`src/types/index.ts`, `src/index.css`, `index.html`, `src/data/mockData.ts`.

---

## 8. Files that will remain untouched

* All 36 page components' **visual/JSX structure** (Dashboard, POS grid, tables, modals, theme)
* `src/components/pos/*` (PaymentModal, ReceiptModal, HeldBillsModal, CustomerSelectModal)
* `src/components/layout/Sidebar.tsx`, `OfflineBanner.tsx`, `ToastContainer.tsx`
* `src/types/index.ts`, `src/index.css`, `index.html`, `metadata.json`, `tsconfig.json`
* `src/data/mockData.ts`
* All mock services for customers, suppliers, sync, serverMonitor (explicitly TODO)

---

## 9. Phase 1 scope guard (DO NOT BUILD)

Firebase · Firebase Auth · AI forecasting · online ordering · multi-branch · multi-warehouse ·
advanced analytics · loyalty · complex coupons · thermal/barcode printer · cash drawer ·
weighing scale · mobile owner app · full GST filing · report engine · notifications ·
full sync engine.

---

## 10. Architecture rules enforced in Phase 1

1. The Pi API is the local transaction authority.
2. SQLite is authoritative while operating locally/offline.
3. Every business write and its outbox record commit in the **same** SQLite transaction.
4. Money is integer **paise** — no floats in DB or API.
5. Completed sales are immutable.
6. Product info is snapshotted into `sale_lines`.
7. `client_sale_id` (+ `device_id`) provides idempotency.
8. `device_id` is stable (persisted in `localStorage`, `POS-<uuid>`).
9. Firebase is never required for a POS sale.
10. Backend authorization is mandatory; hiding UI is not security.

---

## 11. Environment detected

* OS: Windows (dev) · Python **3.13.5** · pip 26.1 · Node **v22.14.0** · npm 10.9.2
* Network: PyPI reachable (verified with `pip download fastapi` → `fastapi-0.142.2`)
* Target: Raspberry Pi 3B+ (1 GB), Raspberry Pi OS 64-bit, Nginx, systemd, SQLite WAL
* Known dev-machine quirk: a global `C:\Users\HP\node_modules\typescript@4.9.5` shadows
  `npm run lint` when the project's `node_modules` is absent → run `npm install` first.
