"""FastAPI application entrypoint (STEP 6).

Run locally:
    uvicorn app.main:app --host 127.0.0.1 --port 8000
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import PHASE, settings
from .database import connect, transaction
from .db.schema import init_db
from .db.seed import seed_if_empty
from .errors import register_error_handlers
from .routes import (
    auth,
    customers,
    health,
    inventory,
    outbox,
    products,
    sales,
    suppliers,
)

log = logging.getLogger("ybpos")


@asynccontextmanager
async def lifespan(app: FastAPI):
    conn = connect()
    try:
        # `init_db` uses executescript(), which implicitly commits, so it must
        # run OUTSIDE our explicit BEGIN IMMEDIATE wrapper.
        init_db(conn)
        if settings.seed_on_empty:
            with transaction(conn):
                seeded = seed_if_empty(conn)
        else:
            seeded = {"users": 0, "products": 0}
        if any(seeded.values()):
            log.warning(
                "SEEDED INITIAL DATA: %s (change default credentials!)", seeded
            )
    finally:
        conn.close()
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version="1.0.0",
        description=(
            "Local-first inventory + POS API. SQLite is authoritative offline; "
            "business writes and outbox rows share one transaction."
        ),
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Set-Cookie"],
    )

    register_error_handlers(app)

    app.include_router(health.router, prefix="/api")
    app.include_router(auth.router, prefix="/api")
    app.include_router(products.router, prefix="/api")
    app.include_router(inventory.router, prefix="/api")
    app.include_router(sales.router, prefix="/api")
    app.include_router(outbox.router, prefix="/api")
    app.include_router(customers.router, prefix="/api")
    app.include_router(suppliers.router, prefix="/api")

    @app.get("/", include_in_schema=False)
    def root():
        return {
            "service": settings.app_name,
            "phase": PHASE,
            "docs": "/docs",
            "health": "/api/health",
        }

    return app


app = create_app()
