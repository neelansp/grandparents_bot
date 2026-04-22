# This file runs once at startup and fills the "accounts" table with the
# grandparents' Upace logins, read from the .env file.
#
# Set these variables in backend/.env:
#   PASSWORD=shared_upace_password
#   SEED_UPACE_EMAILS=grandma@example.com,grandpa@example.com
#
# Running this twice is safe — if an account already exists, we update it
# instead of creating a duplicate.

import os
import uuid
from pathlib import Path

from dotenv import load_dotenv

from database import Account, SessionLocal
from upace import UpaceClient


BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(BACKEND_DIR / ".env", override=False)


def read_seed_emails_from_env():
    """Read the list of emails from SEED_UPACE_EMAILS in .env."""
    value = os.getenv("SEED_UPACE_EMAILS", "")
    return [email.strip() for email in value.split(",") if email.strip()]


def seed_accounts():
    """Create or update an Account row for every email in .env."""
    password = os.getenv("PASSWORD")
    emails = read_seed_emails_from_env()

    if not password or not emails:
        print("Skipping seed: set PASSWORD and SEED_UPACE_EMAILS in backend/.env")
        return

    db = SessionLocal()
    upace = UpaceClient()

    try:
        for email in emails:
            # Step 1: ask Upace for this user's login key.
            check = upace.check_user(email)
            if check.get("error") not in (None, 0) and "function" not in check:
                print(f"Skipping {email}: could not start Upace login")
                continue

            user_login_key = check.get("user_login_key")
            if not user_login_key:
                print(f"Skipping {email}: missing user_login_key")
                continue

            # Step 2: log in with the password.
            login = upace.login_user(user_login_key, password)
            if login.get("error") not in (None, 0):
                print(f"Skipping {email}: {login.get('message')}")
                continue

            # If this account already exists in the DB, update it.
            existing = db.query(Account).filter(Account.email == email).first()
            if existing:
                existing.name = login.get("user_name") or existing.name
                existing.upace_password = password
                existing.api_key = login.get("api_key")
                existing.user_login_key = user_login_key
                existing.barcode = login.get("barcode")
            else:
                db.add(Account(
                    id=str(uuid.uuid4()),
                    name=login.get("user_name") or email,
                    email=email,
                    upace_password=password,
                    api_key=login.get("api_key"),
                    user_login_key=user_login_key,
                    barcode=login.get("barcode"),
                ))

            db.commit()
            print(f"Seeded account: {email}")
    finally:
        upace.close()
        db.close()


if __name__ == "__main__":
    seed_accounts()
