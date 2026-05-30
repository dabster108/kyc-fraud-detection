"""Apply migration 005 (onboarding_sessions selfie columns)."""

import asyncio
from pathlib import Path

import asyncpg

from app.core.config import settings


async def main() -> None:
    if not settings.DATABASE_URL:
        raise SystemExit("DATABASE_URL not set in .env")

    sql_path = (
        Path(__file__).resolve().parents[1]
        / "app/database/migrations/005_selfie_columns.sql"
    )
    sql = sql_path.read_text(encoding="utf-8")

    conn = await asyncpg.connect(settings.DATABASE_URL)
    try:
        await conn.execute(sql)
        await conn.execute("NOTIFY pgrst, 'reload schema'")
        col = await conn.fetchval(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'onboarding_sessions' AND column_name = 'selfie_url'"
        )
        print("Migration 005 applied successfully.")
        print(f"  selfie_url column: {col}")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
