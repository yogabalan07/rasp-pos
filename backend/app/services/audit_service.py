"""Append-only audit trail (STEP 18). Never logs passwords or tokens."""

from __future__ import annotations

import json
import sqlite3
from typing import Any

from ..utils.ids import new_id
from .auth_service import utcnow_iso


def record(
    conn: sqlite3.Connection,
    *,
    actor_user_id: str | None,
    action: str,
    entity_type: str | None = None,
    entity_id: str | None = None,
    before: Any = None,
    after: Any = None,
    device_id: str | None = None,
) -> str:
    audit_id = new_id()
    conn.execute(
        """
        INSERT INTO audit_log(id, actor_user_id, action, entity_type, entity_id,
                              before_json, after_json, created_at, device_id)
        VALUES(?,?,?,?,?,?,?,?,?)
        """,
        (
            audit_id,
            actor_user_id,
            action,
            entity_type,
            entity_id,
            json.dumps(before, default=str) if before is not None else None,
            json.dumps(after, default=str) if after is not None else None,
            utcnow_iso(),
            device_id,
        ),
    )
    return audit_id


def recent(conn: sqlite3.Connection, limit: int = 100) -> list[sqlite3.Row]:
    return conn.execute(
        "SELECT * FROM audit_log ORDER BY created_at DESC, id DESC LIMIT ?",
        (limit,),
    ).fetchall()
