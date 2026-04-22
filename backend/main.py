# This is the entry point for the backend. It:
#   1. Loads environment variables from backend/.env
#   2. Creates the database tables (if they don't exist yet)
#   3. Seeds the accounts table from the emails in .env
#   4. Starts the auto-booking background scheduler
#   5. Mounts the HTTP routes
#
# Run locally with:  python main.py

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware


BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(BACKEND_DIR / ".env", override=False)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# Import AFTER load_dotenv so env-var-driven modules see the values.
from database import create_tables
from routes.accounts import router as accounts_router
from routes.classes import router as classes_router
from scheduler import start_scheduler
from seed import seed_accounts


app = FastAPI(title="Grandparents Workout Class Bot")


# The frontend runs on a different port, so the browser blocks API calls
# by default. CORS tells the browser "it's OK, let these origins through."
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(accounts_router)
app.include_router(classes_router)


@app.on_event("startup")
def on_startup():
    logger.info("Starting up...")
    create_tables()

    try:
        seed_accounts()
    except Exception as exc:
        logger.error("Seeding accounts failed: %s", exc)

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
        reload=True,
    )
