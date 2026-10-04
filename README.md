# YB INVENTORY & POS

**YB Inventory & POS** is a commercial-grade Point of Sale (POS) and Inventory
Management web application built for a **Raspberry Pi 3B+ edge server** with an
offline-first architecture. The shop floor keeps billing when the internet does
not; a **Firebase Cloud** sync layer is planned for a later phase.

> **Current status: Phase 3 complete** — real FastAPI + SQLite backend, real
> auth/sessions/RBAC, atomic POS sales, a fully server-driven **Products +
> Inventory** module, and now a fully server-driven **POS billing** workflow
> (debounced server search, item + bill discounts, GST-inclusive totals,
> CASH/UPI/CARD/CREDIT tenders, idempotent checkout, sales history with search
> and date filters). See **[PHASE1.md](./PHASE1.md)** for the core API,
> **[PHASE2.md](./PHASE2.md)** for the catalogue/inventory API and
> **[PHASE3.md](./PHASE3.md)** for the billing rules. Still not built: sync,
> printing, returns, customers/Khata, reports, AI.

---

## 🏗️ Architecture Overview

```
                 INTERNET
                    │
                    ▼
               FIREBASE CLOUD          (later phase — not wired yet)
                    ▲
                    │
           OUTBOX-DRIVEN SYNC        (outbox rows are queued, not consumed)
                    │
                    ▼
          RASPBERRY PI 3B+ EDGE
        FastAPI + SQLite (WAL)  ← transaction authority
                    │
          ┌─────────┼─────────┐
          ▼         ▼         ▼
     POS Station 1  POS 2   ADMIN / OWNER
```

- **Edge server**: FastAPI + SQLite WAL on the Pi. Local POS terminals keep
  billing during a complete internet failure.
- **Single origin**: the built SPA and `/api` are served by nginx from one
  origin, so the HttpOnly session cookie stays `SameSite=Lax`.
- **Money**: integer **paise** everywhere on the wire; prices are GST-inclusive.

---

## ⚡ Key Features

1. **High-Speed POS Billing (`/pos`)**:
   - Debounced **server-side** product search (name / SKU / exact barcode on Enter)
   - Inline cart editing: `[-] Qty [+]`, item discount (% or flat ₹), GST preview
   - Bill-level discount (% or flat ₹) — evaluated by the server
   - Customer selection (Walk-in or registered)
   - Checkout tenders: **Cash, UPI QR, Card, Khata Credit** (one tender per bill
     — split payment not implemented)
   - Server-computed change; checkout is idempotent and keeps the cart on failure
   - Hold & resume bills queue (F4 / F5) — browser-local only, lost on reload
   - Printable-looking thermal (58mm/80mm) and A4 tax invoice layouts
     *(hardware printing: later phase)*

2. **Keyboard Shortcuts**:
   - `F1` New Bill · `F2` Focus search/barcode · `F3` Customer select
   - `F4` Hold bill · `F5` Recall held bills · `F6` Payment modal
   - `F7` Previous invoices · `ESC` Dismiss modal

3. **Offline-First Resilience**:
   - Persistent TopBar telemetry for local/cloud/sync state
   - `[ Simulate Offline ]` / `[ Restore Internet ]` toggles so you can rehearse
     a disconnect; sales still commit to local SQLite either way

4. **Catalog & Inventory Master**:
   - HSN codes and Indian GST slabs (0/5/12/18/28%)
   - Server-paginated catalogue with search, category/brand/subcategory facets
   - Stock valuation (cost vs retail) and stock status computed by the API
   - Physical stock counting with audited adjustment movements
   - Opening stock (once per product) + full stock movement history
    - Batch/expiry (FEFO) and warehouses: UI present, **TODO (later phase)**

5. **Financials & Khata**:
   - Customer credit (Khata) ledger, cash register, shifts with X/Z reports:
      UI present, **TODO (later phase)** (no server backing yet)

6. **Role-Based Access Control (enforced by the API)**:
   - `OWNER` — everything, incl. users, audit log, outbox retry
   - `ADMIN` — catalog + stock management, stock audits, outbox read
   - `CASHIER` — ring up sales, read catalog & inventory

   The old demo role switcher is gone; permissions come from the session.

---

## 🛠️ Development & Production Instructions

### 1. Backend (FastAPI + SQLite)

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
.\.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Schema creation and seeding happen automatically on first start.

**Seeded logins** (change them before going live):

| Login     | Password     | Role    | PIN  |
|-----------|--------------|---------|------|
| `owner`   | `Owner@1234` | OWNER   | 9999 |
| `admin`   | `Admin@1234` | ADMIN   | 8888 |
| `cashier` | `Cashier@1234` | CASHIER | 1234 |

### 2. Frontend

```bash
npm install
npm run dev        # http://localhost:3000 (proxies /api -> 127.0.0.1:8000)
```

### 3. Production build

```bash
npm run build      # outputs dist/
```

### 4. Type checking

```bash
npm run lint       # tsc --noEmit
```

### 5. Tests

```powershell
cd backend
 .\.venv\Scripts\python -m pytest tests    # 161 tests
```

### 6. Raspberry Pi deployment

See **[PHASE1.md §6](./PHASE1.md#6-deploying-on-the-raspberry-pi)** —
`backend/deploy/yb-pos-api.service` (systemd) and
`backend/deploy/nginx-yb-pos.conf` (SPA + `/api` reverse proxy) are included.

---

## 📁 Further reading

- [PHASE1.md](./PHASE1.md) — core API reference, permission matrix, rules, TODOs
- [PHASE2.md](./PHASE2.md) — products + inventory API, stock rules, schema v2
- [PHASE3.md](./PHASE3.md) — real POS billing: discounts, GST, tenders, receipts
- [PHASE3_BASELINE.md](./PHASE3_BASELINE.md) — pre-Phase-3 scope decisions
- [PHASE2_BASELINE.md](./PHASE2_BASELINE.md) — pre-Phase-2 scope decisions
- [PHASE1_BASELINE.md](./PHASE1_BASELINE.md) — pre-Phase-1 code audit
