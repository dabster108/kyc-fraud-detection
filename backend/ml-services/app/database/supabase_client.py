"""Supabase client singleton and asyncpg connection pool management.

Provides:
- A module-level Supabase :class:`Client` (uses the service key) for table
  operations (inserts/selects through the REST/Postgrest API).
- An :mod:`asyncpg` connection pool for raw SQL, used for ``pgvector``
  similarity queries that the Supabase client cannot express directly.

The pool is created at application startup (see ``app/main.py``) and stored in
the module-level :data:`db_pool`. Use :func:`get_pool` to access it safely.
"""

from __future__ import annotations

import logging
from typing import Optional

import asyncpg
from supabase import Client, create_client

from app.core.config import settings

logger = logging.getLogger(__name__)


def _build_supabase_client() -> Optional[Client]:
    """Create the Supabase client, tolerating missing configuration.

    Returns ``None`` when the URL or service key is not configured so that the
    rest of the application can still boot (face detection will simply skip the
    persistence steps).
    """
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_KEY:
        logger.warning(
            "Supabase URL or service key not configured; "
            "Supabase persistence is disabled."
        )
        return None
    try:
        return create_client(
            settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY
        )
    except Exception:  # noqa: BLE001 - never block startup on client init
        logger.exception("Failed to initialise Supabase client")
        return None


# Module-level singleton Supabase client (service-role).
supabase: Optional[Client] = _build_supabase_client()

# Module-level asyncpg pool, assigned during application startup.
db_pool: Optional[asyncpg.Pool] = None


async def get_db_pool() -> Optional[asyncpg.Pool]:
    """Create and return a new asyncpg connection pool.

    Called once at application startup. Returns ``None`` (and logs a warning)
    when ``DATABASE_URL`` is not configured or the connection fails, so the
    service can still run without raw-SQL duplicate detection.
    """
    if not settings.DATABASE_URL:
        logger.warning(
            "DATABASE_URL not configured; pgvector duplicate detection "
            "is disabled."
        )
        return None
    try:
        return await asyncpg.create_pool(settings.DATABASE_URL)
    except Exception as exc:  # noqa: BLE001 - never block startup on DB connect
        logger.warning(
            "Could not connect to Postgres (pgvector duplicate detection "
            "disabled): %s. If using Supabase, prefer the connection "
            "pooler host (aws-0-<region>.pooler.supabase.com).",
            exc,
        )
        return None


async def get_pool() -> asyncpg.Pool:
    """Return the active asyncpg pool.

    Raises:
        RuntimeError: If the pool has not been initialised at startup.
    """
    if db_pool is None:
        raise RuntimeError(
            "Database pool is not initialised. Ensure the application "
            "startup hook ran and DATABASE_URL is configured."
        )
    return db_pool
