import asyncio
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.endpoints import health
from app.api.endpoints.ocr import router as ocr_router
from app.api.endpoints.forgery import router as forgery_router
from app.api.endpoints.face import router as face_router
from app.api.endpoints.liveness import router as liveness_router
from app.database.supabase_client import get_db_pool
from app.services import face_extractor
import app.database.supabase_client as db_client

logger = logging.getLogger(__name__)

app = FastAPI(title="eSewa Kyc Detection ML Services", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api/v1", tags=["health"])
app.include_router(ocr_router, prefix="/api/v1", tags=["OCR"])
app.include_router(forgery_router, prefix="/api/v1", tags=["Forgery"])
app.include_router(face_router, prefix="/api/v1", tags=["Face"])
app.include_router(liveness_router, prefix="/api/v1", tags=["Liveness"])


async def _load_models_background() -> None:
    """Run blocking model load in the default thread-pool executor."""
    loop = asyncio.get_running_loop()
    try:
        await loop.run_in_executor(None, face_extractor.load_models)
    except Exception:
        logger.exception("Background model loading failed")


@app.on_event("startup")
async def startup():
    """Bind DB pool, then load face models in the background."""
    db_client.db_pool = await get_db_pool()
    asyncio.create_task(_load_models_background())


@app.on_event("shutdown")
async def shutdown():
    """Close the asyncpg pool on application shutdown."""
    if db_client.db_pool:
        await db_client.db_pool.close()


@app.get("/api/v1/ready")
async def ready():
    """Returns whether the face models have finished loading."""
    return {
        "models_ready": face_extractor.is_ready(),
        "status": "ready" if face_extractor.is_ready() else "loading",
    }


@app.get("/")
async def root():
    return {
        "service": "eKS ML Services",
        "version": "1.0.0",
        "status": "operational",
        "models_ready": face_extractor.is_ready(),
        "endpoints": [
            "/api/v1/health",
            "/api/v1/ready",
            "/api/v1/ocr/extract",
            "/api/v1/ocr/extract-base64",
            "/api/v1/ocr/supported-documents",
            "/api/v1/forgery/verify",
            "/api/v1/forgery/verify-base64",
            "/api/v1/face/extract",
            "/api/v1/face/latest",
            "/api/v1/liveness/verify",
        ]
    }