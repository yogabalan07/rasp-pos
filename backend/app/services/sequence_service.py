"""Gapless human code sequences (Phase 4): CUST-0001, SUPP-0001.

Counters live in the `code_counters` table and are bumped inside the caller's
`BEGIN IMMEDIATE` transaction, so:

  * two concurrent creates can never receive the same code (the write lock is
    taken up front by `database.transaction`);
  * a create that rolls back returns its number to the sequence, because the
    counter bump rolls back with the rest of the transaction.
"""

from __future__ import annotations

import sqlite3


def next_code(
    conn: sqlite3.Connection, kind: str, prefix: str, width: int = 4
) -> str:
    """Reserve and return the next code for `kind` (e.g. ("customer", "CUST"))."""
    row = conn.execute(
        "SELECT next_value FROM code_counters WHERE kind = ?", (kind,)
    ).fetchone()
    if row is None:
        value = 1
        conn.execute(
            "INSERT INTO code_counters(kind, next_value) VALUES(?, ?)",
            (kind, value + 1),
        )
    else:
        value = int(row[0])
        conn.execute(
            "UPDATE code_counters SET next_value = ? WHERE kind = ?",
            (value + 1, kind),
        )
    return f"{prefix}-{value:0{width}d}"
