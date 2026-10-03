"""Application settings (STEP 4). Env-driven with safe local defaults."""

from __future__ import annotations

import os
from dataclasses import dataclass, field

# Single source of truth for the phase reported by /api/health and /api/status.
PHASE = 2


def _bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def _int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or not raw.strip():
        return default
    try:
        return int(raw)
    except ValueError:
        return default


@dataclass
class Settings:
    app_name: str = "YB Inventory & POS API"
    env: str = field(default_factory=lambda: os.environ.get("YB_ENV", "development"))
    db_path: str = field(default_factory=lambda: os.environ.get("YB_DB_PATH", ""))
    seed_on_empty: bool = field(default_factory=lambda: _bool("YB_SEED_ON_EMPTY", True))

    session_cookie: str = field(
        default_factory=lambda: os.environ.get("YB_SESSION_COOKIE", "yb_session")
    )
    session_ttl_hours: int = field(
        default_factory=lambda: _int("YB_SESSION_TTL_HOURS", 24 * 7)
    )
    cookie_secure: bool = field(default_factory=lambda: _bool("YB_COOKIE_SECURE", False))
    cookie_samesite: str = field(
        default_factory=lambda: os.environ.get("YB_COOKIE_SAMESITE", "lax")
    )

    cors_origins: str = field(
        default_factory=lambda: os.environ.get("YB_CORS_ORIGINS", "http://localhost:5173")
    )
    db_busy_timeout_ms: int = field(
        default_factory=lambda: _int("YB_DB_BUSY_TIMEOUT_MS", 5000)
    )

    @property
    def is_production(self) -> bool:
        return self.env.strip().lower() in ("production", "prod")

    @property
    def resolved_db_path(self) -> str:
        if self.db_path:
            return self.db_path
        base = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        return os.path.join(base, "data", "yb_pos.sqlite3")

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
