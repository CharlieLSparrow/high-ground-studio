from pydantic_settings import BaseSettings
from typing import List, Union
import json

class Settings(BaseSettings):
    PROJECT_NAME: str = "High Ground Engine"
    # Vertex AI / GCP settings
    GCP_PROJECT_ID: str = ""
    GCP_LOCATION: str = "us-central1"
    GCS_BUCKET_NAME: str = ""
    
    # Database
    DATABASE_URL: str = ""
    
    # CORS
    BACKEND_CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:3001"]

    class Config:
        env_file = ".env"

settings = Settings()
