"""Bootstrap data (STEP 5 / STEP 25).

Runs only when the target tables are empty, so it is safe on every start.

    python -m app.db.seed            # explicit
    # or set YB_SEED_ON_EMPTY=1 (default) — app.startup does it automatically

Default credentials are DEV credentials and MUST be changed on a real device
(override with YB_SEED_*_PASSWORD env vars before first boot).
"""

from __future__ import annotations

import os
import sqlite3
from typing import Any

from ..utils.ids import new_id
from ..utils.money import to_paise
from ..utils.security import hash_secret

NOW = "2026-10-03T09:00:00.000+00:00"

DEFAULT_USERS: list[dict[str, Any]] = [
    {
        "id": "usr-owner",
        "username": "owner",
        "email": "owner@ybinventory.local",
        "password_env": "YB_SEED_OWNER_PASSWORD",
        "password": "Owner@1234",
        "role": "OWNER",
        "display_name": "Yogabalan K.",
        "pin": "9999",
    },
    {
        "id": "usr-admin",
        "username": "admin",
        "email": "admin@ybinventory.local",
        "password_env": "YB_SEED_ADMIN_PASSWORD",
        "password": "Admin@1234",
        "role": "ADMIN",
        "display_name": "Vikramaditya S.",
        "pin": "8888",
    },
    {
        "id": "usr-cashier",
        "username": "cashier",
        "email": "cashier@ybinventory.local",
        "password_env": "YB_SEED_CASHIER_PASSWORD",
        "password": "Cashier@1234",
        "role": "CASHIER",
        "display_name": "Rohan Sharma",
        "pin": "1234",
    },
]

# id, sku, barcode, name, brand, category_id, category, unit, hsn, gst_rate,
# purchase, selling, mrp, wholesale, stock, min_stock, image, batch_tracked
DEFAULT_PRODUCTS: list[tuple] = [
    ("prod-1", "BEV-COC-750", "8901764012015", "Coca Cola 750ml Bottle", "Coca Cola",
     "cat-bev", "Beverages", "Bottle", "220210", 28, 32.50, 40.00, 40.00, 35.00, 48, 15,
     "/src/assets/images/pos_product_beverage_1791045575535.jpg", 1),
    ("prod-2", "BEV-PEP-750", "8902080000049", "Pepsi 750ml Pet Bottle", "PepsiCo",
     "cat-bev", "Beverages", "Bottle", "220210", 28, 31.80, 40.00, 40.00, 34.50, 36, 12,
     "/src/assets/images/pos_product_beverage_1791045575535.jpg", 1),
    ("prod-3", "DAI-AMU-1L", "8901262010052", "Amul Taaza Toned Milk 1L", "Amul",
     "cat-bev", "Beverages", "Pack", "040120", 5, 62.00, 72.00, 72.00, 66.00, 22, 10, None, 1),
    ("prod-4", "SNK-BRI-GD200", "8901063012028", "Britannia Good Day Butter 200g", "Britannia",
     "cat-snk", "Snacks & Biscuits", "Pack", "190531", 18, 28.00, 35.00, 35.00, 30.50, 64, 20,
     "/src/assets/images/pos_product_snacks_1791045599980.jpg", 1),
    ("prod-5", "SNK-PAR-G1K", "8901719101037", "Parle-G Gold Biscuits 1kg", "Parle",
     "cat-snk", "Snacks & Biscuits", "Pack", "190531", 18, 110.00, 130.00, 130.00, 118.00, 18, 15,
     "/src/assets/images/pos_product_snacks_1791045599980.jpg", 0),
    ("prod-6", "SNK-CAD-SLK60", "8901233024842", "Cadbury Dairy Milk Silk 60g", "Cadbury",
     "cat-snk", "Snacks & Biscuits", "Bar", "180632", 18, 65.00, 85.00, 85.00, 72.00, 42, 10,
     "/src/assets/images/pos_product_snacks_1791045599980.jpg", 1),
    ("prod-7", "SNK-HAL-BHU200", "8904063200115", "Haldiram Nagpur Bhujia Sev 200g", "Haldiram",
     "cat-snk", "Snacks & Biscuits", "Pouch", "210690", 12, 42.00, 55.00, 55.00, 46.00, 5, 15, None, 1),
    ("prod-8", "GRO-AAS-ATT5K", "8901725181122", "Aashirvaad Shudh Chakki Atta 5kg", "Aashirvaad",
     "cat-gro", "Grocery & Staples", "Bag", "110100", 5, 220.00, 265.00, 275.00, 235.00, 30, 10,
     "/src/assets/images/pos_product_fmcg_1791045587600.jpg", 1),
    ("prod-9", "GRO-TAT-SLT1K", "8904004400109", "Tata Salt Vacuum Evaporated 1kg", "Tata",
     "cat-gro", "Grocery & Staples", "Pouch", "250100", 5, 21.00, 28.00, 28.00, 23.50, 95, 25,
     "/src/assets/images/pos_product_fmcg_1791045587600.jpg", 0),
    ("prod-10", "GRO-FOR-OIL1L", "8906007280041", "Fortune Sunlite Sunflower Oil 1L", "Fortune",
     "cat-gro", "Grocery & Staples", "Pouch", "151219", 5, 125.00, 148.00, 155.00, 132.00, 24, 12,
     "/src/assets/images/pos_product_fmcg_1791045587600.jpg", 1),
    ("prod-11", "GRO-MAG-MAS280", "8901058852394", "Maggi 2-Minute Masala Noodles 280g", "Nestle",
     "cat-gro", "Grocery & Staples", "Pack", "190230", 18, 45.00, 58.00, 60.00, 49.00, 4, 15, None, 1),
    ("prod-12", "PER-SRF-DET1K", "8901030381014", "Surf Excel Quick Wash Detergent 1kg", "Surf Excel",
     "cat-per", "Personal Care", "Pouch", "340220", 18, 185.00, 220.00, 230.00, 195.00, 19, 8, None, 0),
    ("prod-13", "PER-COL-MAX150", "8901314010214", "Colgate MaxFresh Peppermint 150g", "Colgate",
     "cat-per", "Personal Care", "Tube", "330610", 18, 92.00, 115.00, 120.00, 99.00, 0, 10, None, 1),
    ("prod-14", "PER-DET-SOP3X", "8901396388042", "Dettol Original Bathing Soap 125g (Pack of 3)", "Dettol",
     "cat-per", "Personal Care", "Bundle", "340111", 18, 130.00, 165.00, 175.00, 140.00, 35, 10, None, 1),
    ("prod-15", "STA-CLA-NB172", "8902519001402", "Classmate Pulse Notebook A4 172p", "Classmate",
     "cat-sta", "Stationery", "Book", "482010", 12, 58.00, 75.00, 80.00, 62.00, 52, 20, None, 0),
    ("prod-16", "STA-REY-045BLU", "8901246001014", "Reynolds 045 Fine Carbure Ball Pen Blue", "Reynolds",
     "cat-sta", "Stationery", "Piece", "960810", 18, 7.50, 10.00, 10.00, 8.00, 140, 30, None, 0),
]


def seed_users(conn: sqlite3.Connection, now: str = NOW) -> int:
    count = 0
    for u in DEFAULT_USERS:
        password = os.environ.get(u["password_env"], u["password"])
        conn.execute(
            """
            INSERT INTO users(id, username, email, password_hash, role, display_name,
                              pin_hash, is_active, created_at, updated_at)
            VALUES(?,?,?,?,?,?,?,1,?,?)
            """,
            (
                u["id"],
                u["username"],
                u["email"],
                hash_secret(password),
                u["role"],
                u["display_name"],
                hash_secret(u["pin"]),
                now,
                now,
            ),
        )
        count += 1
    return count


def seed_products(conn: sqlite3.Connection, now: str = NOW) -> int:
    count = 0
    for row in DEFAULT_PRODUCTS:
        (pid, sku, barcode, name, brand, cat_id, cat_name, unit, hsn, gst_rate,
         purchase, selling, mrp, wholesale, stock, min_stock, image, batch_tracked) = row
        conn.execute(
            """
            INSERT INTO products(id, sku, barcode, name, brand, category_id, category,
                                 unit, selling_price_paise, purchase_price_paise, mrp_paise,
                                 wholesale_price_paise, gst_rate, hsn_code, image, min_stock,
                                 batch_tracked, is_active, created_at, updated_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)
            """,
            (
                pid, sku, barcode, name, brand, cat_id, cat_name, unit,
                to_paise(selling), to_paise(purchase), to_paise(mrp), to_paise(wholesale),
                gst_rate, hsn, image, min_stock, batch_tracked, now, now,
            ),
        )
        conn.execute(
            "INSERT INTO inventory(product_id, quantity, reserved_quantity, reorder_level, updated_at)"
            " VALUES(?, ?, 0, ?, ?)",
            (pid, stock, min_stock, now),
        )
        count += 1
    return count


def seed_if_empty(conn: sqlite3.Connection) -> dict[str, int]:
    result = {"users": 0, "products": 0}
    if conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0:
        result["users"] = seed_users(conn)
    if conn.execute("SELECT COUNT(*) FROM products").fetchone()[0] == 0:
        result["products"] = seed_products(conn)
    return result


if __name__ == "__main__":  # pragma: no cover
    from ..database import connect
    from .schema import init_db

    connection = connect()
    init_db(connection)
    outcome = seed_if_empty(connection)
    print(f"seeded: {outcome}")
    connection.close()
