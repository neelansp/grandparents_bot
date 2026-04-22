"""HTTP routes for account registration, login, logout, bootstrap.

Mounted at `/accounts`. Every register/login flow validates the password
against Upace before creating a local session, so a successful login
guarantees the stored Upace credentials are still valid.

`/accounts/bootstrap` is a dev convenience that mints sessions for all
seeded accounts when AUTO_LOGIN_ACCOUNTS is true — handy for the family
deployment where two grandparents share one device.
"""

import os
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from auth import create_session, get_current_account, require_account_access, revoke_account_sessions, revoke_session
from models import Account, get_db
from schemas import AccountCreate, AccountLogin, AccountResponse, AuthResponse
from security import encrypt_secret, hash_password, verify_password
from services.upace_client import UpaceClient


router = APIRouter(prefix="/accounts", tags=["accounts"])
logout_scheme = HTTPBearer(auto_error=False)


def _auto_login_enabled() -> bool:
    return os.getenv("AUTO_LOGIN_ACCOUNTS", "false").lower() in {"1", "true", "yes", "on"}


def _authenticate_with_upace(email: str, password: str) -> dict:
    upace = UpaceClient()
    try:
        check_response = upace.check_user(email)
        if check_response.get("error") not in (None, 0) and "function" not in check_response:
            raise HTTPException(status_code=400, detail="Upace account not found")

        user_login_key = check_response.get("user_login_key")
        if not user_login_key:
            raise HTTPException(status_code=400, detail="Upace login key missing")

        login_response = upace.login_user(user_login_key, password)
        if login_response.get("error") not in (None, 0):
            raise HTTPException(status_code=401, detail="Invalid Upace credentials")

        return {
            "user_login_key": user_login_key,
            "login_response": login_response,
        }
    finally:
        upace.close()


@router.post("/register", response_model=AuthResponse)
def register_account(account: AccountCreate, db: Session = Depends(get_db)):
    existing = db.query(Account).filter(Account.email == account.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    upace_auth = _authenticate_with_upace(account.email, account.password)
    login_response = upace_auth["login_response"]
    user_login_key = upace_auth["user_login_key"]

    new_account = Account(
        id=str(uuid.uuid4()),
        name=login_response.get("user_name") or account.name,
        email=account.email,
        password_hash=hash_password(account.password),
        upace_password_encrypted=encrypt_secret(account.password),
        api_key_encrypted=encrypt_secret(login_response.get("api_key")),
        user_login_key_encrypted=encrypt_secret(user_login_key),
        barcode_encrypted=encrypt_secret(login_response.get("barcode")),
    )
    db.add(new_account)
    db.commit()
    db.refresh(new_account)

    token = create_session(db, new_account)
    return {"account": new_account, "token": token}


@router.get("/", response_model=list[AccountResponse])
def list_accounts(db: Session = Depends(get_db)):
    accounts = db.query(Account).all()
    return accounts


@router.get("/bootstrap", response_model=list[AuthResponse])
def bootstrap_accounts(db: Session = Depends(get_db)):
    if not _auto_login_enabled():
        raise HTTPException(status_code=404, detail="Account bootstrap is disabled")

    accounts = db.query(Account).all()
    if not accounts:
        raise HTTPException(status_code=503, detail="No seeded accounts are available")

    responses: list[dict] = []
    for account in accounts:
        revoke_account_sessions(db, account.id)
        token = create_session(db, account)
        responses.append({"account": account, "token": token})

    return responses


@router.get("/me", response_model=AccountResponse)
def get_current_session_account(current_account: Account = Depends(get_current_account)):
    return current_account


@router.get("/{account_id}", response_model=AccountResponse)
def get_account(
    account_id: str,
    current_account: Account = Depends(get_current_account),
):
    require_account_access(account_id, current_account)
    return current_account


@router.post("/{account_id}/login", response_model=AuthResponse)
def login_account(
    account_id: str,
    login: AccountLogin,
    db: Session = Depends(get_db),
):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    if account.email.lower() != login.email.lower():
        raise HTTPException(status_code=401, detail="Email does not match the selected account")

    if not verify_password(login.password, account.password_hash):
        raise HTTPException(status_code=401, detail="Invalid password")

    upace_auth = _authenticate_with_upace(account.email, login.password)
    login_response = upace_auth["login_response"]
    user_login_key = upace_auth["user_login_key"]

    account.name = login_response.get("user_name") or account.name
    account.upace_password_encrypted = encrypt_secret(login.password)
    account.api_key_encrypted = encrypt_secret(login_response.get("api_key"))
    account.user_login_key_encrypted = encrypt_secret(user_login_key)
    account.barcode_encrypted = encrypt_secret(login_response.get("barcode"))
    db.commit()
    db.refresh(account)

    token = create_session(db, account)
    return {"account": account, "token": token}


@router.post("/logout")
def logout_account(
    credentials: HTTPAuthorizationCredentials | None = Depends(logout_scheme),
    db: Session = Depends(get_db),
):
    if credentials and credentials.scheme.lower() == "bearer":
        revoke_session(db, credentials.credentials)
    return {"message": "Logged out"}


@router.delete("/{account_id}")
def delete_account(
    account_id: str,
    db: Session = Depends(get_db),
    current_account: Account = Depends(get_current_account),
):
    require_account_access(account_id, current_account)
    revoke_account_sessions(db, account_id)
    db.delete(current_account)
    db.commit()
    return {"message": "Account deleted"}
