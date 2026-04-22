"""FastAPI application entry point.

Wires together the routers (accounts, classes), starts the background
scheduler that auto-books selections at T-5 days, and seeds the Upace
accounts from environment variables on startup.

Run locally with `python main.py` (uvicorn wraps the app).
"""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from jobs.scheduler import start_scheduler
from routes.accounts import router as accounts_router
from routes.classes import router as classes_router
from seed import seed_accounts


BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(BACKEND_DIR / ".env", override=False)

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _parse_cors_origins() -> list[str]:
    origins_value = os.getenv(
        "CORS_ORIGINS",
        "http://localhost:3000,http://localhost:5173",
    )
    return [origin.strip() for origin in origins_value.split(",") if origin.strip()]


def _should_auto_seed() -> bool:
    return os.getenv("AUTO_SEED_ACCOUNTS", "true").lower() in {"1", "true", "yes", "on"}


def _should_reload() -> bool:
    return os.getenv("UVICORN_RELOAD", "true").lower() in {"1", "true", "yes", "on"}


app = FastAPI(title="Grandparents Workout Class Bot API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_parse_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(accounts_router)
app.include_router(classes_router)


@app.on_event("startup")
def startup_event():
    logger.info("Starting application...")

    if _should_auto_seed():
        try:
            logger.info("Seeding Upace accounts from environment...")
            seed_accounts()
        except Exception as exc:
            logger.error("Error seeding Upace accounts: %s", exc)
    else:
        logger.info("AUTO_SEED_ACCOUNTS disabled; skipping seed step")

    start_scheduler()


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/")
def root():
    return {"message": "Grandparents Workout Class Bot API"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=os.getenv("UVICORN_HOST", "0.0.0.0"),
        port=int(os.getenv("UVICORN_PORT", "8000")),
        reload=_should_reload(),
    )
