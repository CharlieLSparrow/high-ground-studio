from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os

from app.routers import media, research
from app.core.config import settings

app = FastAPI(
    title="High Ground Engine",
    description="Python MLOps Microservice for Media Generation and Semantic Research",
    version="1.0.0"
)

# CORS configuration to allow the Next.js apps to communicate
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "High Ground Engine"}

# Include routers
app.include_router(media.router, prefix="/api/v1/media", tags=["media"])
app.include_router(research.router, prefix="/api/v1/research", tags=["research"])
