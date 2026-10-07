"""Outbox writer (STEP 17).

RULE 3: every business write that must eventually reach the cloud enqueues its
outbox row inside the SAME SQLite transaction as the business rows.

Phase 1 deliberately performs NO network sync — it only proves the local
outbox is written atomically and is queryable.
"""

from __future__ import annotations

import json
import sqlite3
from typing import Any

from ..utils.ids import new_event_id
from .auth_service import utcnow_iso


def enqueue(
    conn: sqlite3.Connection,
    *,
    entity_type: str,
    entity_id: str,
    operation: str,
    payload: Any,
    event_id: str | None = None,
) -> str:
    if operation not in ("CREATE", "UPDATE", "DELETE"):
        raise ValueError(f"invalid operation: {operation}")
    eid = event_id or new_event_id()
    conn.execute(
        """
        INSERT INTO outbox(id, event_id, entity_type, entity_id, operation,
                           payload_json, created_at, attempts, status, last_error)
        VALUES(?,?,?,?,?,?,?,0,'PENDING',NULL)
        """,
        (
            new_event_id(),
            eid,
            entity_type,
            entity_id,
            operation,
            json.dumps(payload, default=str, separators=(",", ":")),
            utcnow_iso(),
        ),
    )
    return eid


def counts(conn: sqlite3.Connection) -> dict[str, int]:
    rows = conn.execute(
        "SELECT status, COUNT(*) AS n FROM outbox GROUP BY status"
    ).fetchall()
    out = {"PENDING": 0, "SYNCED": 0, "FAILED": 0}
    for r in rows:
        out[r["status"]] = int(r["n"])
    out["total"] = sum(out.values())
    return out


def list_rows(conn: sqlite3.Connection, limit: int = 100, status: str | None = None):
    if status:
        return conn.execute(
            "SELECT * FROM outbox WHERE status = ? ORDER BY created_at DESC LIMIT ?",
            (status, limit),
        ).fetchall()
    return conn.execute(
        "SELECT * FROM outbox ORDER BY created_at DESC LIMIT ?", (limit,)
    ).fetchall()
