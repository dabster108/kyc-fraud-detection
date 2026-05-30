"""Apply migration 008 (face_embeddings.is_verified + RPC functions)."""

import asyncio
from pathlib import Path

import asyncpg

from app.core.config import settings


async def main() -> None:
    if not settings.DATABASE_URL:
        raise SystemExit("DATABASE_URL not set in .env")

    sql_path = Path(__file__).resolve().parents[1] / "app/database/migrations/008_face_verified_column.sql"
    sql = sql_path.read_text(encoding="utf-8")

    conn = await asyncpg.connect(settings.DATABASE_URL)
    try:
        await conn.execute(sql)
        await conn.execute("NOTIFY pgrst, 'reload schema'")
        col = await conn.fetchval(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'face_embeddings' AND column_name = 'is_verified'"
        )
        fn = await conn.fetchval(
            "SELECT proname FROM pg_proc WHERE proname = 'match_verified_face_embeddings'"
        )
        print("Migration 008 applied successfully.")
        print(f"  is_verified column: {col}")
        print(f"  match_verified_face_embeddings: {fn}")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
