"""Seed Upace accounts from environment variables on startup.

Reads PASSWORD + SEED_UPACE_EMAILS (or EMAIL_1/EMAIL_2) from `backend/.env`,
logs each one into Upace, and stores the resulting api_key / user_login_key
encrypted in the Account table. Safe to re-run — existing rows are updated
in place rather than duplicated.
"""

import os
import uuid
from pathlib import Path

from dotenv import load_dotenv

from models import Account, SessionLocal
from security import encrypt_secret, hash_password
from services.upace_client import UpaceClient


BACKEND_DIR = Path(__file__).resolve().parent
DEFAULT_ENV_FILES = [
    BACKEND_DIR / ".env",
    BACKEND_DIR.parent / "starter" / ".env",
]


for env_file in DEFAULT_ENV_FILES:
    if env_file.exists():
        load_dotenv(env_file, override=False)


def _load_seed_accounts() -> tuple[list[str], str | None, str]:
    password = os.getenv("PASSWORD")
    uid = os.getenv("UID", "110")

    emails_value = os.getenv("SEED_UPACE_EMAILS")
    if emails_value:
        emails = [email.strip() for email in emails_value.split(",") if email.strip()]
        return emails, password, uid

    emails = [
        os.getenv("EMAIL_1", "").strip(),
        os.getenv("EMAIL_2", "").strip(),
    ]
    return [email for email in emails if email], password, uid


def seed_accounts():
    """Seed Upace-backed accounts from environment variables."""

    emails, password, uid = _load_seed_accounts()
    if not emails or not password:
        print("Skipping seed: set PASSWORD and SEED_UPACE_EMAILS or EMAIL_1/EMAIL_2")
        return

    db = SessionLocal()
    upace = UpaceClient()

    try:
        for email in emails:
            check_response = upace.check_user(email, uid)
            if check_response.get("error") not in (None, 0) and "function" not in check_response:
                print(f"Skipping {email}: unable to start Upace login")
                continue

            user_login_key = check_response.get("user_login_key")
            if not user_login_key:
                print(f"Skipping {email}: missing user_login_key")
                continue

            login_response = upace.login_user(user_login_key, password, uid)
            if login_response.get("error") not in (None, 0):
                print(f"Skipping {email}: {login_response.get('message')}")
                continue

            existing = db.query(Account).filter(Account.email == email).first()
            if existing:
                existing.name = login_response.get("user_name") or existing.name
                existing.password_hash = hash_password(password)
                existing.upace_password_encrypted = encrypt_secret(password)
                existing.api_key_encrypted = encrypt_secret(login_response.get("api_key"))
                existing.user_login_key_encrypted = encrypt_secret(user_login_key)
                existing.barcode_encrypted = encrypt_secret(login_response.get("barcode"))
                db.commit()
                continue

            db.add(
                Account(
                    id=str(uuid.uuid4()),
                    name=login_response.get("user_name") or email,
                    email=email,
                    password_hash=hash_password(password),
                    upace_password_encrypted=encrypt_secret(password),
                    api_key_encrypted=encrypt_secret(login_response.get("api_key")),
                    user_login_key_encrypted=encrypt_secret(user_login_key),
                    barcode_encrypted=encrypt_secret(login_response.get("barcode")),
                )
            )
            db.commit()
    finally:
        upace.close()
        db.close()


if __name__ == "__main__":
    seed_accounts()
