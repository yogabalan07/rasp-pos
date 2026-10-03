# YB INVENTORY & POS

**YB Inventory & POS** is a commercial-grade Point of Sale (POS) and Inventory
Management web application built for a **Raspberry Pi 3B+ edge server** with an
offline-first architecture. The shop floor keeps billing when the internet does
not; a **Firebase Cloud** sync layer is planned for a later phase.

> **Current status: Phase 1 complete** — real FastAPI + SQLite backend, real
> auth/sessions/RBAC, real products & inventory, atomic POS sales with
> idempotency and bill numbers. See **[PHASE1.md](./PHASE1.md)** for the API,
> permission matrix, deployment steps and the honest list of what is *not* built
> yet (sync, printing, returns, reports, AI).

---

## 🏗️ Architecture Overview

```
                 INTERNET
                    │
                    ▼
              FIREBASE CLOUD          (Phase 2+ — not wired yet)
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
   - Barcode scanning with instant quantity increments
   - SKU and name quick search, category button filters
   - Inline cart editing: `[-] Qty [+]`, item discounts, GST calculations
   - Customer selection (Walk-in or registered)
   - Checkout tenders: **Cash, UPI QR, Card, Khata Credit**
     *(split payment: TODO phase 2)*
   - Immediate change calculation
   - Hold & resume bills queue (F4 / F5) — browser-local for now
   - Printable-looking thermal (58mm/80mm) and A4 tax invoice layouts
     *(actual printing: TODO phase 2)*

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
   - Stock valuation (cost vs retail)
   - Physical stock counting with audited adjustment movements
   - Batch/expiry (FEFO) and warehouses: UI present, **TODO phase 2**

5. **Financials & Khata**:
   - Customer credit (Khata) ledger, cash register, shifts with X/Z reports:
     UI present, **TODO phase 2** (no server backing yet)

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
.\.venv\Scripts\python -m pytest tests    # 76 tests
```

### 6. Raspberry Pi deployment

See **[PHASE1.md §6](./PHASE1.md#6-deploying-on-the-raspberry-pi)** —
`backend/deploy/yb-pos-api.service` (systemd) and
`backend/deploy/nginx-yb-pos.conf` (SPA + `/api` reverse proxy) are included.

---

## 📁 Further reading

- [PHASE1.md](./PHASE1.md) — API reference, permission matrix, rules, TODOs
- [PHASE1_BASELINE.md](./PHASE1_BASELINE.md) — pre-Phase-1 code audit
