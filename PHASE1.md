# PHASE 1 — Real local-first backend

Phase 1 turns the React/Vite prototype into a real, offline-capable single-terminal
POS: **FastAPI + SQLite (WAL) on the Raspberry Pi**, with real authentication,
sessions, RBAC, product/inventory management and an **atomic POS sale** that
commits business writes and outbox rows in the *same* SQLite transaction.

Firebase, cloud sync, printers, multi-branch, reports and AI are **out of scope**.

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

The schema is created and seeded automatically on first startup
(`backend/app/db/schema.py`, `backend/app/db/seed.py`). Data lives in
`backend/data/yb_pos.sqlite3` (gitignored).

### Verification

```powershell
cd backend
.\.venv\Scripts\python -m pytest tests     # 76 tests
..\npm run lint                            # tsc --noEmit
..\npm run build                           # vite production build
```

---

## 2. Seeded accounts

| Login        | Password      | Role    | PIN  |
|--------------|---------------|---------|------|
| `owner`      | `Owner@1234`  | `OWNER` | 9999 |
| `admin`      | `Admin@1234`  | `ADMIN` | 8888 |
| `cashier`    | `Cashier@1234`| `CASHIER` | 1234 |

Emails are `<username>@ybinventory.local` (no personal data stored).

Override the passwords on a real deployment:

```bash
YB_SEED_OWNER_PASSWORD=... YB_SEED_ADMIN_PASSWORD=... YB_SEED_CASHIER_PASSWORD=...
```

`YB_SEED_ON_EMPTY=false` disables seeding entirely. **Change these before the
shop goes live** — the API prints a reminder on startup.

---

## 3. Permission matrix

Authorization is enforced **on the API** (`backend/app/dependencies.py`); the
frontend never decides access.

| Permission           | CASHIER | ADMIN | OWNER |
|----------------------|:-------:|:-----:|:-----:|
| `sale:create`        | ✅ | ✅ | ✅ |
| `sale:read`          | ✅ | ✅ | ✅ |
| `sale:void`          | —  | —  | ✅ *(route not built yet, see §7)* |
| `product:read`       | ✅ | ✅ | ✅ |
| `product:write`      | —  | ✅ | ✅ |
| `product:deactivate` | —  | ✅ | ✅ |
| `inventory:read`     | ✅ | ✅ | ✅ |
| `inventory:adjust`   | —  | ✅ | ✅ |
| `stock_audit:read`   | —  | ✅ | ✅ |
| `outbox:read`        | —  | ✅ | ✅ |
| `outbox:retry`       | —  | —  | ✅ |
| `audit:read`         | —  | —  | ✅ |
| `user:read` / `user:write` | — | — | ✅ |

`cashier` hitting a `product:write` route gets `403 Permission denied`.

---

## 4. HTTP API

Base path `/api`. Every response uses one envelope:

```jsonc
// success
{ "ok": true,  "data": <payload>, "message": "..." }
// failure
{ "ok": false, "data": null, "message": "...", "status": 400 }
```

Session is an **HttpOnly cookie** (`yb_session`); the token is never returned in
a body. Every authenticated request should send a stable `X-Device-Id`
(the UI stores `POS-<uuid>` in `localStorage`).

| Method | Path | Required permission |
|--------|------|---------------------|
| GET  | `/api/health` | — |
| GET  | `/api/status` | — |
| POST | `/api/auth/login` | — |
| POST | `/api/auth/login/pin` | — |
| POST | `/api/auth/logout` | — |
| GET  | `/api/auth/session` (optional-auth probe, `data:null` when signed out) | — |
| GET  | `/api/auth/me` | authenticated |
| POST | `/api/auth/change-password` | authenticated |
| POST | `/api/auth/register` | `user:write` |
| GET  | `/api/auth/users` | `user:read` |
| GET  | `/api/products` | `product:read` |
| GET  | `/api/products/categories` | `product:read` |
| GET  | `/api/products/{id}` | `product:read` |
| POST | `/api/products` | `product:write` |
| PATCH| `/api/products/{id}` | `product:write` |
| DELETE| `/api/products/{id}` | `product:deactivate` |
| GET  | `/api/inventory` | `inventory:read` |
| GET  | `/api/inventory/{product_id}` | `inventory:read` |
| GET  | `/api/inventory/movements` | `stock_audit:read` |
| POST | `/api/inventory/{product_id}/adjust` | `inventory:adjust` |
| POST | `/api/sales` | `sale:create` |
| GET  | `/api/sales` (`page`, `page_size`, `q`) | `sale:read` |
| GET  | `/api/sales/{reference}` (id **or** bill no) | `sale:read` |
| GET  | `/api/outbox` | `outbox:read` |
| POST | `/api/outbox/retry` | `outbox:retry` |

`POST /api/sales` returns **201** for a new bill and **200 + `idempotent:true`**
for a replay of an existing `client_sale_id`.

---

## 5. Money, GST and sale rules

* **Integer paise everywhere** on the wire. Rupees only for display.
* Prices are **GST-inclusive**.
  `tax = round_div(gross * rate, 100 + rate)`
* `line_net_paise` = GST-inclusive per-line amount after *all* discounts.
  `line_total_paise == line_net_paise` (tax is contained inside, not added on top).
* `taxable_paise = line_net_paise - line_tax_paise`.
* Bill discount is allocated **proportionally** across lines before tax split.
* `grand_total = subtotal - discounts + additional_charges`, rounded to the
  nearest rupee (`((p + 50) // 100) * 100`) → `round_off_paise`.
* The POS screen and the server compute the same grand total (the screen only
  differs in how it *splits* tax per line), so cash-tender validation never
  disagrees with the server.
* **Product info is snapshotted** into `sale_lines` — editing the catalogue can
  never rewrite a printed receipt.
* **Sales are immutable.** Corrections are Phase 2 (returns/void).

### Atomicity + idempotency

Every sale runs inside one `BEGIN IMMEDIATE` transaction
(`backend/app/services/sales_service.py`):

1. bill number allocated from `bill_counters`
2. `sales` + `sale_lines` + `payments` inserted
3. stock decremented + `stock_movements` written (fails → whole sale rolls back)
4. `outbox` row queued
5. `audit_log` entry written
6. commit

The pair `(client_sale_id, device_id)` is UNIQUE: retrying after a network
hiccup returns the **same** bill instead of creating a duplicate. The frontend
reuses the pending `client_sale_id` while an identical cart is being retried.

---

## 6. Deploying on the Raspberry Pi

```bash
sudo rsync -a --exclude node_modules --exclude .venv --exclude dist ./ /opt/yb-pos/
cd /opt/yb-pos/backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

# API
sudo cp deploy/yb-pos-api.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now yb-pos-api

# Frontend
cd /opt/yb-pos && npm install && npm run build

# Nginx (SPA on / , API on /api -> 127.0.0.1:8000)
sudo cp deploy/nginx-yb-pos.conf /etc/nginx/sites-available/yb-pos
sudo ln -s /etc/nginx/sites-available/yb-pos /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Notes:

* The systemd unit runs **one** uvicorn worker on `127.0.0.1:8000` — bill
  numbering and `BEGIN IMMEDIATE` locking are simplest in a single process.
* `YB_DB_PATH` points at a dedicated file under `/opt/yb-pos/backend/data`.
* Set `YB_COOKIE_SECURE=true` only when TLS terminates in front of the API.
* The UI hard-codes `API_BASE = '/api'`, so it must be served from the **same
  origin** as the API (that is what the nginx site does).

---

## 7. Honest TODO list — **not** implemented in Phase 1

| Area | Status |
|------|--------|
| Firebase / Firestore sync | not started — outbox rows are queued but nothing consumes them |
| Cloud backend, multi-branch | not started |
| Thermal/A4 printing, ESC/POS | not started (receipt is on-screen only) |
| Sales returns | `salesService.processReturn()` throws `501` — sales are immutable |
| Sale void | permission `sale:void` exists, **no route yet** |
| Split payments | removed from the checkout UI (API accepts one method per bill) |
| Held bills | browser-memory only — lost on reload; server-side holds are Phase 2 |
| Shift open/close (X/Z reports) | client-local demo state |
| Customers / credit (Khata) ledger | customers are still the mock list; `customer_id` is stored but not validated |
| Suppliers, purchase orders, goods receiving | mock UI only (receiving does post a real audited stock adjustment) |
| Batch / expiry (FEFO), warehouses | mock UI only |
| Reports, GST returns, analytics | not started |
| AI insights | not started |
| Forgot-password self-service | shows an honest TODO notice |
| Audit-log / outbox viewer pages | API exists, pages are still static |

Frontend pages whose backing data is still mock are labelled `TODO(phase-2)`
in `src/services/`.

---

## 8. Layout

```
backend/
  app/
    main.py            create_app(), lifespan (init_db + seed_if_empty)
    config.py          env-driven settings
    database.py        connect(), transaction() = BEGIN IMMEDIATE
    errors.py          ApiError + handlers (incl. RequestValidationError)
    schemas.py         pydantic request models
    dependencies.py    get_db, get_current_user, PERMISSIONS, require()
    db/schema.py       schema v1 + migrations
    db/seed.py         3 users, 16 products
    services/          auth, gst, sales, inventory, product, audit, outbox
    routes/            health, auth, products, inventory, sales, outbox
    utils/             ids, money, security, api (envelope)
  tests/               76 tests
  deploy/              systemd unit + nginx site
src/
  services/api.ts      real fetch client (+ envelope types for mock services)
  services/{auth,products,inventory,sales}.ts  real API
  context/AppContext.tsx  session bootstrap, logout, toasts
  App.tsx              signed-out -> AuthPages
```

Untouched by design: `src/types/index.ts`, `src/index.css`, `index.html`,
`src/components/layout/Sidebar.tsx` (beyond null-safety), `src/data/mockData.ts`
(seed source only), and the mock services for customers/suppliers/sync/server
monitor.
