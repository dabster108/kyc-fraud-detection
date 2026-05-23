from fastapi import FastAPI
from app.api.endpoints import health

app = FastAPI(title="eKS ML Services", version="1.0.0")

app.include_router(health.router, prefix="/api/v1", tags=["health"])

@app.get("/")
async def root():
    return {
        "service": "eKS ML Services",
        "version": "1.0.0",
        "status": "operational",
        "endpoints": ["/api/v1/health"]
    }