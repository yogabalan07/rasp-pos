"""Outbox routes (STEP 17).

Phase 1 exposes the local outbox for inspection. It does NOT sync to any
remote service — that is a later phase. `POST /retry` only re-arms FAILED rows.
"""

from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, Query

from ..dependencies import get_db, require
from ..errors import ApiError
from ..services import outbox_service
from ..utils.api import ok

router = APIRouter(prefix="/outbox", tags=["outbox"])


@router.get("")
def list_outbox(
    limit: int = Query(default=100, ge=1, le=1000),
    status: str | None = Query(default=None, pattern="^(PENDING|SYNCED|FAILED)$"),
    conn: sqlite3.Connection = Depends(get_db),
    _user: sqlite3.Row = Depends(require("outbox:read")),
):
    rows = outbox_service.list_rows(conn, limit=limit, status=status)
    items = [{k: r[k] for k in r.keys()} for r in rows]
    return ok({"items": items, "counts": outbox_service.counts(conn)},
              "Outbox retrieved")


@router.post("/retry")
def retry_failed(
    conn: sqlite3.Connection = Depends(get_db),
    _user: sqlite3.Row = Depends(require("outbox:retry")),
):
    cur = conn.execute(
        "UPDATE outbox SET status='PENDING', last_error=NULL WHERE status='FAILED'"
    )
    conn.commit()
    return ok({"requeued": cur.rowcount}, "Failed events requeued")
