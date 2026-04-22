"""Bearer-token session auth for the FastAPI routes.

Tokens are random strings issued at login/register, stored hashed in SQLite
(`session_tokens`), and sent by the frontend in the `Authorization` header.
`get_current_account` is the FastAPI dependency that resolves a token to an
Account on every protected request.
"""

from datetime import datetime, timedelta
import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from models import Account, SessionToken, get_db
from security import generate_session_token, hash_session_token


SESSION_TTL_DAYS = 14
bearer_scheme = HTTPBearer(auto_error=False)


def create_session(db: Session, account: Account) -> str:
    token = generate_session_token()
    session = SessionToken(
        id=str(uuid.uuid4()),
        account_id=account.id,
        token_hash=hash_session_token(token),
        expires_at=datetime.utcnow() + timedelta(days=SESSION_TTL_DAYS),
    )
    db.add(session)
    db.commit()
    return token


def revoke_session(db: Session, token: str) -> None:
    token_hash = hash_session_token(token)
    session = db.query(SessionToken).filter(SessionToken.token_hash == token_hash).first()
    if not session or session.revoked_at:
        return

    session.revoked_at = datetime.utcnow()
    db.commit()


def revoke_account_sessions(db: Session, account_id: str) -> None:
    db.query(SessionToken).filter(
        SessionToken.account_id == account_id,
        SessionToken.revoked_at.is_(None),
    ).update({"revoked_at": datetime.utcnow()})
    db.commit()


def get_current_account(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> Account:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    token_hash = hash_session_token(credentials.credentials)
    session = db.query(SessionToken).filter(
        SessionToken.token_hash == token_hash,
        SessionToken.revoked_at.is_(None),
        SessionToken.expires_at > datetime.utcnow(),
    ).first()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired or invalid",
        )

    account = db.query(Account).filter(Account.id == session.account_id).first()
    if not account:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account not found",
        )

    return account


def require_account_access(account_id: str, current_account: Account) -> None:
    if current_account.id != account_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this account",
        )
