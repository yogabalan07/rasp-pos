"""Health + service status (STEP 6)."""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from ..config import settings
from ..dependencies import get_db
from ..services.outbox_service import counts as outbox_counts
from ..utils.api import ok

router = APIRouter(tags=["system"])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


@router.get("/health")
def health(conn: sqlite3.Connection = Depends(get_db)):
    try:
        conn.execute("SELECT 1").fetchone()
        database_ok = True
        error = None
    except Exception as exc:  # pragma: no cover - defensive
        database_ok = False
        error = str(exc)
    return ok(
        {
            "status": "ok" if database_ok else "degraded",
            "database": "ok" if database_ok else "error",
            "error": error,
            "service": "yb-inventory-pos",
            "version": "1.0.0",
            "phase": 1,
            "environment": settings.env,
            "timestamp": _now(),
        },
        "Service is healthy",
    )


@router.get("/status")
def status(conn: sqlite3.Connection = Depends(get_db)):
    """Detailed status used by the existing UI Server Monitor screen."""
    try:
        db = {
            "journal_mode": str(conn.execute("PRAGMA journal_mode").fetchone()[0]).lower(),
            "foreign_keys": bool(conn.execute("PRAGMA foreign_keys").fetchone()[0]),
            "busy_timeout_ms": int(conn.execute("PRAGMA busy_timeout").fetchone()[0]),
        }
        db_error = None
    except Exception as exc:  # pragma: no cover - defensive
        db = {}
        db_error = str(exc)

    try:
        users = int(conn.execute("SELECT COUNT(*) FROM users").fetchone()[0])
        products = int(conn.execute("SELECT COUNT(*) FROM products").fetchone()[0])
        sales = int(conn.execute("SELECT COUNT(*) FROM sales").fetchone()[0])
        db_row = conn.execute("SELECT value FROM schema_meta WHERE key='version'").fetchone()
        schema_version = int(db_row[0]) if db_row else None
        outbox = outbox_counts(conn)
        database_connected = True
    except Exception as exc:  # pragma: no cover - defensive
        users = products = sales = 0
        schema_version = None
        outbox = {"PENDING": 0, "SYNCED": 0, "FAILED": 0, "total": 0}
        database_connected = False
        db_error = str(exc)

    return ok(
        {
            "database": "connected" if database_connected else "disconnected",
            "databaseError": db_error,
            "schemaVersion": schema_version,
            "journalMode": db.get("journal_mode"),
            "users": users,
            "products": products,
            "sales": sales,
            "outbox": outbox,
            "environment": settings.env,
            "phase": 1,
            "timestamp": _now(),
        },
        "Status retrieved",
    )
