from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv


load_dotenv(Path(__file__).resolve().parents[2] / ".env")


def _csv_env(name: str, default: str) -> list[str]:
    raw = os.getenv(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


@dataclass(slots=True)
class Settings:
    app_name: str = os.getenv("APP_NAME", "AI Smart Proctoring API")
    api_prefix: str = os.getenv("API_PREFIX", "/api/v1")
    environment: str = os.getenv("ENVIRONMENT", "development")
    debug: bool = os.getenv("DEBUG", "true").lower() == "true"
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./smart_proctoring.db")
    cors_origins: list[str] = field(
        default_factory=lambda: _csv_env(
            "CORS_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173",
        )
    )
    admin_email: str = os.getenv("ADMIN_EMAIL", "admin@proctoring.demo")
    admin_password: str = os.getenv("ADMIN_PASSWORD", "admin123")
    student_password: str = os.getenv("STUDENT_PASSWORD", "student123")
    jwt_secret: str = os.getenv("JWT_SECRET", "change-me-in-production")
    jwt_expiry_minutes: int = int(os.getenv("JWT_EXPIRY_MINUTES", "180"))
    exam_score_termination_threshold: int = int(os.getenv("EXAM_SCORE_TERMINATION_THRESHOLD", "100"))
    openai_api_key: str | None = os.getenv("OPENAI_API_KEY")
    openai_model: str = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
    llm_timeout_seconds: int = int(os.getenv("LLM_TIMEOUT_SECONDS", "8"))
    ollama_model: str | None = os.getenv("OLLAMA_MODEL")
    ollama_base_url: str = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
    yolo_model_path: str = os.getenv("YOLO_MODEL_PATH", "./yolov8n.pt")


settings = Settings()
