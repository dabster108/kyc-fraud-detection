from fastapi import FastAPI
from app.api.endpoints import health
from app.api.endpoints.ocr import router as ocr_router
from app.api.endpoints.forgery import router as forgery_router
from app.api.endpoints.face import router as face_router
from app.database.supabase_client import get_db_pool
import app.database.supabase_client as db_client

app = FastAPI(title="eSewa Kyc Detection ML Services", version="1.0.0")

app.include_router(health.router, prefix="/api/v1", tags=["health"])
app.include_router(ocr_router, prefix="/api/v1", tags=["OCR"])
app.include_router(forgery_router, prefix="/api/v1", tags=["Forgery"])
app.include_router(face_router, prefix="/api/v1", tags=["Face"])


@app.on_event("startup")
async def startup():
    """Initialise the asyncpg pool used for pgvector duplicate detection."""
    db_client.db_pool = await get_db_pool()


@app.on_event("shutdown")
async def shutdown():
    """Close the asyncpg pool on application shutdown."""
    if db_client.db_pool:
        await db_client.db_pool.close()

@app.get("/")
async def root():
    return {
        "service": "eKS ML Services",
        "version": "1.0.0",
        "status": "operational",
        "endpoints": [
            "/api/v1/health",
            "/api/v1/ocr/extract",
            "/api/v1/ocr/extract-base64",
            "/api/v1/ocr/supported-documents",
            "/api/v1/forgery/verify",
            "/api/v1/forgery/verify-base64",
            "/api/v1/face/extract",
        ]
    }