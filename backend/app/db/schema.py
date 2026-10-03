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

SCHEMA_VERSION = 1

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
CREATE TABLE IF NOT EXISTS products (
    id                   TEXT PRIMARY KEY,
    sku                  TEXT NOT NULL UNIQUE,
    barcode              TEXT UNIQUE,
    name                 TEXT NOT NULL,
    brand                TEXT DEFAULT '',
    category_id          TEXT DEFAULT '',
    category             TEXT DEFAULT '',
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
    updated_at           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);

-- ------------------------------------------------------------ inventory
CREATE TABLE IF NOT EXISTS inventory (
    product_id        TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
    quantity          INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    reserved_quantity INTEGER NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
    reorder_level     INTEGER NOT NULL DEFAULT 0,
    updated_at        TEXT NOT NULL
);

-- ------------------------------------------------------ stock_movements
CREATE TABLE IF NOT EXISTS stock_movements (
    id            TEXT PRIMARY KEY,
    product_id    TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    movement_type TEXT NOT NULL CHECK (movement_type IN
                    ('SALE','PURCHASE','ADJUSTMENT','RETURN')),
    quantity      INTEGER NOT NULL,
    reference_type TEXT,
    reference_id  TEXT,
    balance_after INTEGER NOT NULL,
    reason        TEXT,
    created_at    TEXT NOT NULL,
    created_by    TEXT REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_movements_product ON stock_movements(product_id, created_at);

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
"""

# Ordered, idempotent migrations applied after SCHEMA_SQL.
MIGRATIONS: list[tuple[str, str]] = [
    ("1", "UPDATE schema_meta SET value='1' WHERE key='version'"),
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
            conn.execute(sql)
            conn.execute(
                "UPDATE schema_meta SET value=? WHERE key='version'", (target,)
            )
            version = int(target)


def table_names(conn: sqlite3.Connection) -> list[str]:
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        " ORDER BY name"
    ).fetchall()
    return [r[0] for r in rows]
