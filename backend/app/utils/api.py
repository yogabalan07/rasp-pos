"""Response envelope helpers.

Every API response uses the same shape the frontend already expects from its
service layer:

    success:  { "ok": true,  "data": <payload>, "message": "..." }
    error:    { "ok": false, "data": null,      "message": "..." }
"""

from __future__ import annotations

from typing import Any


def ok(data: Any = None, message: str = "OK") -> dict[str, Any]:
    return {"ok": True, "data": data, "message": message}


def fail(message: str, status_code: int) -> dict[str, Any]:
    return {"ok": False, "data": None, "message": message, "status": status_code}
