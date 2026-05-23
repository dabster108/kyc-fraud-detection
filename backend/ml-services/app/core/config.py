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
    
    class Config:
        env_file = Path(__file__).parent.parent.parent.parent / ".env"
        env_file_encoding = 'utf-8'
        case_sensitive = True

settings = Settings()

# Create temp directory if it doesn't exist
os.makedirs(settings.TEMP_DIR, exist_ok=True)