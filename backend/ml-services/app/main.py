from fastapi import FastAPI
from app.api.endpoints import health
from app.api.endpoints.ocr import router as ocr_router
from app.api.endpoints.forgery import router as forgery_router

app = FastAPI(title="eSewa Kyc Detection ML Services", version="1.0.0")

app.include_router(health.router, prefix="/api/v1", tags=["health"])
app.include_router(ocr_router, prefix="/api/v1", tags=["OCR"])
app.include_router(forgery_router, prefix="/api/v1", tags=["Forgery"])

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
        ]
    }