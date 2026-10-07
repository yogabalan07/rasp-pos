"""Response envelope helpers.

Every API response uses the same shape the frontend already expects from its
service layer:

    success:  { "ok": true,  "data": <payload>, "message": "..." }
    error:    { "ok": false, "data": null,      "message": "..." }
"""

from __future__ import annotations

from typing import Any


def ok(
    data: Any = None, message: str = "OK", meta: dict[str, Any] | None = None
) -> dict[str, Any]:
    """Success envelope.

    `meta` is optional and carries pagination/summary alongside an array-shaped
    `data`, so older array consumers keep working unchanged.
    """
    payload: dict[str, Any] = {"ok": True, "data": data, "message": message}
    if meta is not None:
        payload["meta"] = meta
    return payload


def fail(
    message: str, status_code: int, code: str | None = None
) -> dict[str, Any]:
    """Error envelope. `code` is an optional machine-readable error id
    (DUPLICATE_SKU, INSUFFICIENT_STOCK, ...); `message` stays human-readable."""
    payload: dict[str, Any] = {
        "ok": False,
        "data": None,
        "message": message,
        "status": status_code,
    }
    if code:
        payload["code"] = code
    return payload
