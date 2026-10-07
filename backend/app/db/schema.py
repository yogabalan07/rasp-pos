"""SQLite schema (STEP 5) + migrations.

Idempotent: `init_db()` creates anything that is missing.  Future schema
changes are added as numbered `MIGRATIONS` statements executed in order.

Design notes
------------
* All money columns are INTEGER paise (RULE 4).
* Completed sales are append-only (RULE 5) — there is no UPDATE path for
  `sales` / `sale_lines` in the application code.
* `sales.client_sale_id` + `sales.device_id` is UNIQUE (STEP 13 idempotency).
* `products.sku` UNIQUE, `products.barcode` UNIQUE when present.
* `bill_counters` gives gapless human bill numbers per day (STEP 15).
"""

from __future__ import annotations

import sqlite3

SCHEMA_VERSION = 3

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS schema_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- ---------------------------------------------------------------- users
CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    email         TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('OWNER','ADMIN','CASHIER')),
    display_name  TEXT NOT NULL,
    pin_hash      TEXT,
    is_active     INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);

-- ------------------------------------------------------------- sessions
-- Raw tokens are NEVER stored: only sha256(token). Survives process restart.
CREATE TABLE IF NOT EXISTS sessions (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash   TEXT NOT NULL UNIQUE,
    created_at   TEXT NOT NULL,
    expires_at   TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    revoked_at   TEXT,
    device_id    TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- ------------------------------------------------------------- products
-- `subcategory` / `created_by` / `updated_by` were added by migration 2 but are
-- declared here too so a brand-new database is created in its final shape.
CREATE TABLE IF NOT EXISTS products (
    id                   TEXT PRIMARY KEY,
    sku                  TEXT NOT NULL UNIQUE,
    barcode              TEXT UNIQUE,
    name                 TEXT NOT NULL,
    brand                TEXT DEFAULT '',
    category_id          TEXT DEFAULT '',
    category             TEXT DEFAULT '',
    subcategory          TEXT NOT NULL DEFAULT '',
    unit                 TEXT DEFAULT 'Piece',
    selling_price_paise  INTEGER NOT NULL CHECK (selling_price_paise >= 0),
    purchase_price_paise INTEGER NOT NULL DEFAULT 0 CHECK (purchase_price_paise >= 0),
    mrp_paise            INTEGER NOT NULL DEFAULT 0 CHECK (mrp_paise >= 0),
    wholesale_price_paise INTEGER NOT NULL DEFAULT 0 CHECK (wholesale_price_paise >= 0),
    gst_rate             INTEGER NOT NULL DEFAULT 0,
    hsn_code             TEXT DEFAULT '',
    image                TEXT,
    min_stock            INTEGER NOT NULL DEFAULT 0,
    batch_tracked        INTEGER NOT NULL DEFAULT 0,
    is_active            INTEGER NOT NULL DEFAULT 1,
    created_at           TEXT NOT NULL,
    updated_at           TEXT NOT NULL,
    created_by           TEXT,
    updated_by           TEXT
);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);
-- sku / barcode are UNIQUE columns, so SQLite already maintains an index for
-- each — do not duplicate them here. The Phase 2 indexes (brand, subcategory)
-- live in PHASE2_INDEX_SQL: a Phase 1 database does not have the columns yet.

-- ------------------------------------------------------------ inventory
CREATE TABLE IF NOT EXISTS inventory (
    product_id        TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
    quantity          INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    reserved_quantity INTEGER NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
    reorder_level     INTEGER NOT NULL DEFAULT 0,
    updated_at        TEXT NOT NULL
);

-- ------------------------------------------------------ stock_movements
-- OPENING_STOCK + the reserved Phase-later types are accepted by the CHECK so
-- no future table rebuild is needed; the service layer only *writes* the types
-- it actually implements (see inventory_service.MOVEMENT_TYPES).
CREATE TABLE IF NOT EXISTS stock_movements (
    id            TEXT PRIMARY KEY,
    product_id    TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    movement_type TEXT NOT NULL CHECK (movement_type IN (
                    'OPENING_STOCK','SALE','PURCHASE','ADJUSTMENT','RETURN',
                    'PURCHASE_RETURN','SALE_RETURN','TRANSFER_IN','TRANSFER_OUT',
                    'DAMAGE','EXPIRY')),
    quantity      INTEGER NOT NULL,
    reference_type TEXT,
    reference_id  TEXT,
    balance_after INTEGER NOT NULL,
    reason        TEXT,
    created_at    TEXT NOT NULL,
    created_by    TEXT REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_movements_product ON stock_movements(product_id, created_at);
CREATE INDEX IF NOT EXISTS idx_movements_type ON stock_movements(movement_type, created_at);
CREATE INDEX IF NOT EXISTS idx_movements_created ON stock_movements(created_at);

-- ---------------------------------------------------------------- sales
CREATE TABLE IF NOT EXISTS sales (
    id                  TEXT PRIMARY KEY,
    client_sale_id      TEXT NOT NULL,
    device_id           TEXT NOT NULL,
    bill_no             TEXT NOT NULL UNIQUE,
    customer_id         TEXT,
    customer_name       TEXT,
    customer_phone      TEXT,
    subtotal_paise      INTEGER NOT NULL,
    discount_paise      INTEGER NOT NULL DEFAULT 0,
    tax_paise           INTEGER NOT NULL DEFAULT 0,
    additional_charges_paise INTEGER NOT NULL DEFAULT 0,
    round_off_paise     INTEGER NOT NULL DEFAULT 0,
    total_paise         INTEGER NOT NULL,
    status              TEXT NOT NULL DEFAULT 'COMPLETED'
                          CHECK (status IN ('COMPLETED','VOID')),
    created_at          TEXT NOT NULL,
    created_by          TEXT NOT NULL REFERENCES users(id),
    UNIQUE (device_id, client_sale_id)
);
CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_bill_no ON sales(bill_no);
-- Phase 4: every khata query filters `sales` by customer and orders by time
-- (customer history, the customer-list aggregates). `created_at` alone cannot
-- serve `WHERE customer_id = ?`, and this composite also covers the
-- `GROUP BY customer_id` subquery, so it is not a duplicate of the two above.
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id, created_at);

-- ----------------------------------------------------------- sale_lines
-- Product info is snapshotted: later catalog edits never rewrite history.
CREATE TABLE IF NOT EXISTS sale_lines (
    id                  TEXT PRIMARY KEY,
    sale_id             TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id          TEXT NOT NULL,
    product_name_snapshot TEXT NOT NULL,
    sku_snapshot        TEXT NOT NULL,
    hsn_snapshot        TEXT DEFAULT '',
    unit_snapshot       TEXT DEFAULT '',
    quantity            INTEGER NOT NULL CHECK (quantity > 0),
    unit_price_paise    INTEGER NOT NULL,
    discount_paise      INTEGER NOT NULL DEFAULT 0,
    gst_rate            INTEGER NOT NULL DEFAULT 0,
    tax_paise           INTEGER NOT NULL DEFAULT 0,
    line_total_paise    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sale_lines_sale ON sale_lines(sale_id);

-- -------------------------------------------------------------- payments
CREATE TABLE IF NOT EXISTS payments (
    id             TEXT PRIMARY KEY,
    sale_id        TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('CASH','UPI','CARD','CREDIT')),
    amount_paise   INTEGER NOT NULL CHECK (amount_paise >= 0),
    reference      TEXT,
    created_at     TEXT NOT NULL,
    created_by     TEXT NOT NULL REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_payments_sale ON payments(sale_id);

-- ---------------------------------------------------------------- outbox
-- Local-first queue. Phase 1 only PROVES the rows are written atomically;
-- there is deliberately no Firebase/network sync yet (STEP 17).
CREATE TABLE IF NOT EXISTS outbox (
    id               TEXT PRIMARY KEY,
    event_id         TEXT NOT NULL UNIQUE,
    entity_type      TEXT NOT NULL,
    entity_id        TEXT NOT NULL,
    operation        TEXT NOT NULL CHECK (operation IN ('CREATE','UPDATE','DELETE')),
    payload_json     TEXT NOT NULL,
    created_at       TEXT NOT NULL,
    attempts         INTEGER NOT NULL DEFAULT 0,
    last_attempt_at  TEXT,
    status           TEXT NOT NULL DEFAULT 'PENDING'
                       CHECK (status IN ('PENDING','SYNCED','FAILED')),
    last_error       TEXT
);
CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox(status, created_at);

-- ------------------------------------------------------------ audit_log
CREATE TABLE IF NOT EXISTS audit_log (
    id            TEXT PRIMARY KEY,
    actor_user_id TEXT,
    action        TEXT NOT NULL,
    entity_type   TEXT,
    entity_id     TEXT,
    before_json   TEXT,
    after_json    TEXT,
    created_at    TEXT NOT NULL,
    device_id     TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

-- ------------------------------------------------------- bill_counters
-- Gapless per-day invoice sequence: INV-YYYYMMDD-000001 (STEP 15).
CREATE TABLE IF NOT EXISTS bill_counters (
    day         TEXT PRIMARY KEY,
    next_value  INTEGER NOT NULL
);

-- ----------------------------------------------------------- customers
-- Phase 4: customer directory + khata (credit) accounts. There is deliberately
-- NO `outstanding_paise` column: the balance is always derived from
-- `customer_ledger_entries` (RULE: balance only via ledger rows).
CREATE TABLE IF NOT EXISTS customers (
    id                TEXT PRIMARY KEY,
    code              TEXT NOT NULL UNIQUE,
    name              TEXT NOT NULL,
    phone             TEXT NOT NULL DEFAULT '',
    email             TEXT NOT NULL DEFAULT '',
    address           TEXT NOT NULL DEFAULT '',
    gstin             TEXT NOT NULL DEFAULT '',
    credit_limit_paise INTEGER NOT NULL DEFAULT 0
                       CHECK (credit_limit_paise >= 0),
    is_active         INTEGER NOT NULL DEFAULT 1,
    notes             TEXT NOT NULL DEFAULT '',
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL,
    created_by        TEXT REFERENCES users(id),
    updated_by        TEXT REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_gstin ON customers(gstin);
CREATE INDEX IF NOT EXISTS idx_customers_active ON customers(is_active);

-- ------------------------------------------------------------ suppliers
-- Phase 4: supplier directory. Purchases/PO/GRN are a LATER phase — only the
-- profile + a reserved payable ledger land now.
CREATE TABLE IF NOT EXISTS suppliers (
    id                TEXT PRIMARY KEY,
    code              TEXT NOT NULL UNIQUE,
    name              TEXT NOT NULL,
    contact_person    TEXT NOT NULL DEFAULT '',
    phone             TEXT NOT NULL DEFAULT '',
    email             TEXT NOT NULL DEFAULT '',
    address           TEXT NOT NULL DEFAULT '',
    gstin             TEXT NOT NULL DEFAULT '',
    payment_terms     TEXT NOT NULL DEFAULT 'Net 30 Days',
    credit_limit_paise INTEGER NOT NULL DEFAULT 0
                       CHECK (credit_limit_paise >= 0),
    is_active         INTEGER NOT NULL DEFAULT 1,
    notes             TEXT NOT NULL DEFAULT '',
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL,
    created_by        TEXT REFERENCES users(id),
    updated_by        TEXT REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);
CREATE INDEX IF NOT EXISTS idx_suppliers_phone ON suppliers(phone);
CREATE INDEX IF NOT EXISTS idx_suppliers_gstin ON suppliers(gstin);
CREATE INDEX IF NOT EXISTS idx_suppliers_active ON suppliers(is_active);

-- -------------------------------------------------- customer_ledger_entries
-- Append-only khata book: rows are INSERTed, never UPDATEd/DELETEd by app
-- code.  Accounting direction for a customer receivable:
--   debit_paise  -> customer owes MORE   (credit sale)
--   credit_paise -> customer owes LESS   (payment collected)
--   balance_after_paise is the running outstanding after this entry.
-- `idempotency_key` is UNIQUE so a replayed request can never double-post.
CREATE TABLE IF NOT EXISTS customer_ledger_entries (
    id                 TEXT PRIMARY KEY,
    customer_id        TEXT NOT NULL REFERENCES customers(id),
    entry_type         TEXT NOT NULL CHECK (entry_type IN (
                        'CREDIT_SALE','PAYMENT','ADJUSTMENT','REVERSAL')),
    reference_type     TEXT,
    reference_id       TEXT,
    debit_paise        INTEGER NOT NULL DEFAULT 0 CHECK (debit_paise >= 0),
    credit_paise       INTEGER NOT NULL DEFAULT 0 CHECK (credit_paise >= 0),
    balance_after_paise INTEGER NOT NULL DEFAULT 0
                        CHECK (balance_after_paise >= 0),
    description        TEXT NOT NULL DEFAULT '',
    idempotency_key    TEXT UNIQUE,
    created_at         TEXT NOT NULL,
    created_by         TEXT REFERENCES users(id),
    CHECK (debit_paise > 0 OR credit_paise > 0)
);
CREATE INDEX IF NOT EXISTS idx_cust_ledger_customer
    ON customer_ledger_entries(customer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_cust_ledger_reference
    ON customer_ledger_entries(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_cust_ledger_type
    ON customer_ledger_entries(entry_type, created_at);

-- ------------------------------------------------------- customer_payments
-- Khata collections recorded against a customer (never against a sale).
-- `idempotency_key` makes POST /customers/{id}/payments replay-safe.
CREATE TABLE IF NOT EXISTS customer_payments (
    id              TEXT PRIMARY KEY,
    customer_id     TEXT NOT NULL REFERENCES customers(id),
    amount_paise    INTEGER NOT NULL CHECK (amount_paise > 0),
    payment_method  TEXT NOT NULL CHECK (payment_method IN ('CASH','UPI','CARD')),
    reference       TEXT NOT NULL DEFAULT '',
    notes           TEXT NOT NULL DEFAULT '',
    idempotency_key TEXT UNIQUE,
    ledger_entry_id TEXT REFERENCES customer_ledger_entries(id),
    created_at      TEXT NOT NULL,
    created_by      TEXT NOT NULL REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_cust_payments_customer
    ON customer_payments(customer_id, created_at);

-- ---------------------------------------------------- supplier_ledger_entries
-- Mirror image of the customer book (payable is credit-nature):
--   credit_paise -> we owe the supplier MORE (purchase)
--   debit_paise  -> we owe the supplier LESS (payment made)
-- Phase 4 ships the table + service primitives only; PURCHASE entries are
-- written by a later phase (purchases/GRN).
CREATE TABLE IF NOT EXISTS supplier_ledger_entries (
    id                 TEXT PRIMARY KEY,
    supplier_id        TEXT NOT NULL REFERENCES suppliers(id),
    entry_type         TEXT NOT NULL CHECK (entry_type IN (
                        'PURCHASE','PAYMENT','ADJUSTMENT','REVERSAL')),
    reference_type     TEXT,
    reference_id       TEXT,
    debit_paise        INTEGER NOT NULL DEFAULT 0 CHECK (debit_paise >= 0),
    credit_paise       INTEGER NOT NULL DEFAULT 0 CHECK (credit_paise >= 0),
    balance_after_paise INTEGER NOT NULL DEFAULT 0
                        CHECK (balance_after_paise >= 0),
    description        TEXT NOT NULL DEFAULT '',
    idempotency_key    TEXT UNIQUE,
    created_at         TEXT NOT NULL,
    created_by         TEXT REFERENCES users(id),
    CHECK (debit_paise > 0 OR credit_paise > 0)
);
CREATE INDEX IF NOT EXISTS idx_sup_ledger_supplier
    ON supplier_ledger_entries(supplier_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sup_ledger_reference
    ON supplier_ledger_entries(reference_type, reference_id);

-- --------------------------------------------------------- code_counters
-- Gapless human codes: CUST-0001 / SUPP-0001. Seeded rows below so a brand
-- new database starts at 1 and an upgraded one keeps its sequence.
CREATE TABLE IF NOT EXISTS code_counters (
    kind        TEXT PRIMARY KEY,
    next_value  INTEGER NOT NULL
);
INSERT OR IGNORE INTO code_counters(kind, next_value) VALUES('customer', 1);
INSERT OR IGNORE INTO code_counters(kind, next_value) VALUES('supplier', 1);
"""

MOVEMENT_TYPE_CHECK_SQL = """(
    'OPENING_STOCK','SALE','PURCHASE','ADJUSTMENT','RETURN',
    'PURCHASE_RETURN','SALE_RETURN','TRANSFER_IN','TRANSFER_OUT',
    'DAMAGE','EXPIRY')"""

# Runs AFTER the migrations, because a Phase 1 `products` table has no
# `subcategory` column until migration 2 adds it.
PHASE2_INDEX_SQL = """
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);
CREATE INDEX IF NOT EXISTS idx_products_subcategory ON products(subcategory);
"""


def _columns(conn: sqlite3.Connection, table: str) -> set[str]:
    return {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}


def _add_column(conn: sqlite3.Connection, table: str, definition: str) -> None:
    """ALTER TABLE ADD COLUMN is not idempotent — check first."""
    name = definition.split()[0]
    if name not in _columns(conn, table):
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {definition}")


def _rebuild_stock_movements(conn: sqlite3.Connection) -> None:
    """SQLite cannot ALTER a CHECK constraint, so rebuild the table in place.

    Only the `movement_type` whitelist changes; every row is preserved.
    """
    conn.executescript(
        f"""
        CREATE TABLE stock_movements_v2 (
            id             TEXT PRIMARY KEY,
            product_id     TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
            movement_type  TEXT NOT NULL CHECK (movement_type IN {MOVEMENT_TYPE_CHECK_SQL}),
            quantity       INTEGER NOT NULL,
            reference_type TEXT,
            reference_id   TEXT,
            balance_after  INTEGER NOT NULL,
            reason         TEXT,
            created_at     TEXT NOT NULL,
            created_by     TEXT REFERENCES users(id)
        );
        INSERT INTO stock_movements_v2
            (id, product_id, movement_type, quantity, reference_type,
             reference_id, balance_after, reason, created_at, created_by)
        SELECT id, product_id, movement_type, quantity, reference_type,
               reference_id, balance_after, reason, created_at, created_by
          FROM stock_movements;
        DROP TABLE stock_movements;
        ALTER TABLE stock_movements_v2 RENAME TO stock_movements;
        """
    )
    conn.executescript(
        """
        CREATE INDEX IF NOT EXISTS idx_movements_product
            ON stock_movements(product_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_movements_type
            ON stock_movements(movement_type, created_at);
        CREATE INDEX IF NOT EXISTS idx_movements_created
            ON stock_movements(created_at);
        """
    )


def migration_2_products_inventory(conn: sqlite3.Connection) -> None:
    """Phase 2: product subcategory + audit columns, wider movement types."""
    _add_column(conn, "products", "subcategory TEXT NOT NULL DEFAULT ''")
    _add_column(conn, "products", "created_by TEXT")
    _add_column(conn, "products", "updated_by TEXT")

    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='stock_movements'"
    ).fetchone()
    if row is not None and "OPENING_STOCK" not in (row["sql"] or ""):
        _rebuild_stock_movements(conn)


# Ordered, idempotent migrations applied after SCHEMA_SQL.
# Entries are (target_version, sql_or_callable).
# Migration 3 (Phase 4) only bumps the meta version: the customers / suppliers /
# ledger tables are brand-new, so `CREATE TABLE IF NOT EXISTS` in SCHEMA_SQL
# builds them on both fresh and upgraded databases.
MIGRATIONS: list[tuple[str, object]] = [
    ("1", "UPDATE schema_meta SET value='1' WHERE key='version'"),
    ("2", migration_2_products_inventory),
    ("3", "UPDATE schema_meta SET value='3' WHERE key='version'"),
]


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA_SQL)
    cur = conn.execute("SELECT value FROM schema_meta WHERE key='version'")
    row = cur.fetchone()
    if row is None:
        conn.execute(
            "INSERT INTO schema_meta(key, value) VALUES('version', ?)",
            (str(SCHEMA_VERSION),),
        )
        version = SCHEMA_VERSION
    else:
        version = int(row[0])

    for target, sql in MIGRATIONS:
        if version < int(target):
            if callable(sql):
                sql(conn)
            else:
                conn.executescript(sql)
            conn.execute(
                "UPDATE schema_meta SET value=? WHERE key='version'", (target,)
            )
            version = int(target)

    # Only now do the Phase 2 columns exist on an upgraded database.
    conn.executescript(PHASE2_INDEX_SQL)


def table_names(conn: sqlite3.Connection) -> list[str]:
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        " ORDER BY name"
    ).fetchall()
    return [r[0] for r in rows]
