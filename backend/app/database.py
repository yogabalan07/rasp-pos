"""SQLite connection management.

RULE 2: SQLite is the authoritative local database.
RULE 3: business writes and their outbox rows share ONE transaction.
"""

from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from typing import Iterator

from .config import settings


def connect(db_path: str | None = None) -> sqlite3.Connection:
    path = db_path or settings.resolved_db_path
    parent = os.path.dirname(os.path.abspath(path))
    if parent:
        os.makedirs(parent, exist_ok=True)

    conn = sqlite3.connect(
        path,
        timeout=settings.db_busy_timeout_ms / 1000.0,
        isolation_level=None,  # explicit transaction control
        check_same_thread=False,
    )
    conn.row_factory = sqlite3.Row
    conn.execute(f"PRAGMA busy_timeout={settings.db_busy_timeout_ms}")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    return conn


@contextmanager
def transaction(conn: sqlite3.Connection) -> Iterator[sqlite3.Connection]:
    """BEGIN IMMEDIATE .. COMMIT / ROLLBACK.

    IMMEDIATE takes the write lock up front so two POS terminals cannot both
    read the same stock level and then race on the deduction.
    """
    if conn.in_transaction:
        # Nested call: reuse the outer transaction (single unit of work).
        yield conn
        return
    conn.execute("BEGIN IMMEDIATE")
    try:
        yield conn
        conn.execute("COMMIT")
    except Exception:
        try:
            conn.execute("ROLLBACK")
        except sqlite3.Error:
            pass
        raise


def pragma_status(db_path: str | None = None) -> dict:
    conn = connect(db_path)
    try:
        journal = conn.execute("PRAGMA journal_mode").fetchone()[0]
        return {
            "journal_mode": str(journal).lower(),
            "foreign_keys": bool(conn.execute("PRAGMA foreign_keys").fetchone()[0]),
            "busy_timeout_ms": int(conn.execute("PRAGMA busy_timeout").fetchone()[0]),
            "synchronous": int(conn.execute("PRAGMA synchronous").fetchone()[0]),
        }
    finally:
        conn.close()
