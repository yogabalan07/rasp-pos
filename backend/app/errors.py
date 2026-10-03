"""Application error type + handlers.

Production mode never exposes stack traces to the browser (STEP 27).
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

log = logging.getLogger("ybpos")


class ApiError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def register_error_handlers(app: FastAPI) -> None:
    from .utils.api import fail

    @app.exception_handler(ApiError)
    async def _api_error(_request: Request, exc: ApiError):
        return JSONResponse(
            status_code=exc.status_code,
            content=fail(exc.message, exc.status_code),
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_request: Request, exc: RequestValidationError):
        first = exc.errors()[0] if exc.errors() else {}
        loc = ".".join(str(p) for p in first.get("loc", []) if p != "body")
        msg = first.get("msg", "Invalid request body")
        detail = f"{loc}: {msg}" if loc else msg
        return JSONResponse(status_code=422, content=fail(detail, 422))

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception):
        log.exception("unhandled error on %s", request.url.path)
        from .config import settings

        if settings.is_production:
            return JSONResponse(
                status_code=500, content=fail("Internal server error", 500)
            )
        return JSONResponse(
            status_code=500,
            content=fail(f"{type(exc).__name__}: {exc}", 500),
        )
