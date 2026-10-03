# YB INVENTORY & POS

**YB Inventory & POS** is a modern, commercial-grade Point of Sale (POS) and Inventory Management web application engineered to operate with an offline-first architecture on a **Raspberry Pi 3B+ Edge Server** while synchronizing with a **Firebase Cloud** backend.

---

## 🏗️ Architecture Overview

```
                 INTERNET
                    │
                    ▼
              FIREBASE CLOUD
              (Firestore DB)
                    ▲
                    │
           AUTO DIFFERENTIAL SYNC
                    │
                    ▼
          RASPBERRY PI 3B+ EDGE
         (10.205.100.50 / SQLite)
                    │
          ┌─────────┼─────────┐
          ▼         ▼         ▼
     POS Station 1  POS 2   ADMIN / OWNER
```

- **Edge Server**: Runs locally on Raspberry Pi 3B+ with SQLite, serving local POS terminals even during complete internet failure.
- **Cloud Backend**: Synchronizes with Firebase Cloud Firestore for multi-branch consolidation, remote owner analytics, and cloud backups.
- **Frontend Service Layer**: Isolated in `src/services/` with unified API contracts ready to be connected to local SQLite REST endpoints and Firebase SDK.

---

## ⚡ Key Features

1. **High-Speed POS Billing (`/pos`)**:
   - Barcode scanning with instant quantity increments
   - SKU and name quick search
   - Category button filters
   - Inline cart editing: `[-] Qty [+]`, item discounts, GST calculations
   - Customer selection (Walk-in or registered)
   - Multi-tender checkout: **Cash, UPI QR, Card, Khata Credit, Split Payment**
   - Immediate change calculation
   - Hold & Resume bills queue (F4 / F5)
   - Printable Thermal Receipt (58mm/80mm) and A4 Tax Invoice with CGST/SGST breakdown

2. **Keyboard Shortcuts**:
   - `F1` : New Bill / Clear Cart
   - `F2` : Focus Product Search / Barcode Input
   - `F3` : Customer Select / Quick Add
   - `F4` : Hold Current Bill
   - `F5` : Recall Held Bills
   - `F6` : Open Payment Modal
   - `F7` : Previous Invoices Archive
   - `ESC` : Dismiss any active modal

3. **Offline-First Resilience**:
   - Persistent TopBar telemetry:
     - 🟢 **Local Server**: 10.205.100.50 Online
     - 🟢 **Cloud**: Connected or 🔴 Offline
     - 🟢 **Sync**: Synchronized / 🔄 Syncing / 🟠 Pending
   - **Interactive Simulation**: Click `[ Simulate Offline ]` in the top bar to test immediate disconnect. POS continues billing locally, incrementing the pending queue. Click `[ Restore Internet ]` to simulate differential cloud replay.

4. **Catalog & Inventory Master**:
   - HSN codes, Indian GST slabs (0%, 5%, 12%, 18%, 28%)
   - Batch & Expiry tracking with **FEFO** (First Expiry First Out) prioritization
   - Stock valuation (Cost vs Retail projection)
   - Physical stock counting with barcode scanner audit reconciliation
   - Inter-warehouse transfers

5. **Financials & Khata**:
   - Customer Credit (Khata) ledger with credit limits and payment collection
   - Cash register with opening float, petty cash expenses, and variance tracking
   - Shift management with **X-Report** (mid-day reading) and **Z-Report** (end-of-day drawer lock)

6. **Role-Based Access Control (Demo Switcher in Top Bar)**:
   - `OWNER`: Full executive control, multi-branch, cloud settings, analytics
   - `ADMIN`: Operational management, pricing slabs, user accounts
   - `MANAGER`: Store supervision, discounts, audit logs, supplier POs
   - `CASHIER`: Focused POS billing, customer attachment, returns, till closing
   - `INVENTORY_MANAGER`: Products, stock audits, batches, warehouses, purchases
   - `ACCOUNTANT`: GST reports, tax slabs, Khata ledgers, invoices

---

## 🛠️ Development & Production Instructions

### Development Server
```bash
# Install dependencies
npm install

# Start Vite dev server on port 3000
npm run dev
```

### Production Build
```bash
# Compile and build production bundle
npm run build

# Preview build locally
npm run preview
```

### Type Checking & Linting
```bash
npm run lint
```
