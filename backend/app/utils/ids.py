"""Stable, sortable unique identifiers.

STEP 6 — every important business record gets a UUIDv7 (RFC 9562):
48-bit millisecond timestamp prefix + random payload => lexicographically
sortable by creation time, unique without a central counter.

Device IDs are NOT generated here; they are provisioned once and persisted
(browser localStorage / config file) — see `device_id` in the frontend.
"""

from __future__ import annotations

import os
import time
import uuid


def new_id() -> str:
    """Return a canonical UUIDv7 string, e.g. '01994f3a-7c2e-7b41-9f6a-1d2f3e4a5b6c'."""
    ts_ms = int(time.time() * 1000)
    if ts_ms >= (1 << 48):
        raise ValueError("timestamp out of range for uuidv7")
    b = bytearray(16)
    b[0:6] = ts_ms.to_bytes(6, "big")
    b[6:16] = os.urandom(10)
    b[6] = (b[6] & 0x0F) | 0x70  # version 7
    b[8] = (b[8] & 0x3F) | 0x80  # RFC 4122 variant
    return str(uuid.UUID(bytes=bytes(b)))


def new_event_id() -> str:
    """Outbox event id (UUIDv7)."""
    return new_id()
