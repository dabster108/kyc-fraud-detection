from pydantic_settings import BaseSettings
from typing import List
import os
from pathlib import Path

class Settings(BaseSettings):
    # API Settings
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "eKS ML Services"
    
    # CORS
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5001",
        "http://localhost:8000"
    ]
    
    # Model paths
    MODEL_PATH: str = "app/models"
    TEMP_DIR: str = "app/temp"
    
    # Detection thresholds
    FORGERY_THRESHOLD: float = 0.7
    FACE_MATCH_THRESHOLD: float = 0.6
    BEHAVIOR_ANOMALY_THRESHOLD: float = 0.8
    
    # File settings
    MAX_FILE_SIZE: int = 10 * 1024 * 1024  # 10MB

    # PaddleOCR settings
    PADDLE_OCR_LANG: str = "en"
    PADDLE_OCR_USE_GPU: bool = False
    MAX_UPLOAD_SIZE_MB: int = 10
    FORGED_JSON_PATH: str = "/Users/dikshanta/Documents/kyc-fraud-detection/backend/ml-services/forged.json"

    # Mistral OCR settings
    MISTRAL_API_KEY: str = ""
    # NOTE: "mistral-ocr-latest" is the pure-OCR endpoint and is NOT compatible
    # with the chat/system-prompt JSON extraction used here. A vision-capable
    # chat model is required (e.g. pixtral-12b-2409, mistral-small-latest).
    MISTRAL_MODEL: str = "pixtral-12b-2409"
    MAX_UPLOAD_MB: int = 10

    class Config:
        # The project's single .env lives at the repository root, five levels
        # up from this file (app/core -> app -> ml-services -> backend -> root).
        env_file = Path(__file__).resolve().parents[4] / ".env"
        env_file_encoding = 'utf-8'
        case_sensitive = True

settings = Settings()

# Create temp directory if it doesn't exist
os.makedirs(settings.TEMP_DIR, exist_ok=True)