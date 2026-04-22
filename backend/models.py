"""SQLAlchemy ORM models and SQLite setup.

Defines the four tables: Account (Upace credentials, encrypted), SelectedClass
(scheduled / manual / booked / failed selections), BookingHistory (audit log of
attempted Upace reservations), and SessionToken (browser session tokens).

Also runs idempotent in-place migrations on import so older databases pick up
new columns without a separate migration tool.
"""

import os
from pathlib import Path
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, String, create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker


DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./grandparents_bot.db")


def _prepare_sqlite_database_path(database_url: str) -> None:
    sqlite_prefix = "sqlite:///"
    if not database_url.startswith(sqlite_prefix):
        return

    raw_path = database_url[len(sqlite_prefix):]
    if raw_path == ":memory:":
        return

    database_path = Path(raw_path)
    if not database_path.is_absolute():
        database_path = Path.cwd() / database_path

    database_path.parent.mkdir(parents=True, exist_ok=True)


_prepare_sqlite_database_path(DATABASE_URL)

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


class Account(Base):
    __tablename__ = "accounts"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, index=True)
    email = Column(String, unique=True, index=True)
    password = Column(String, nullable=True)
    password_hash = Column(String, nullable=True)
    upace_password_encrypted = Column(String, nullable=True)
    api_key = Column(String, nullable=True)
    api_key_encrypted = Column(String, nullable=True)
    user_login_key = Column(String, nullable=True)
    user_login_key_encrypted = Column(String, nullable=True)
    barcode = Column(String, nullable=True)
    barcode_encrypted = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class SelectedClass(Base):
    __tablename__ = "selected_classes"

    id = Column(String, primary_key=True, index=True)
    account_id = Column(String, index=True)
    class_id = Column(String)
    class_name = Column(String)
    day = Column(String)
    time = Column(String)
    instructor = Column(String)
    slot_id = Column(String)
    status = Column(String, default="scheduled", index=True)
    attempted_at = Column(DateTime, nullable=True)
    last_message = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class BookingHistory(Base):
    __tablename__ = "booking_history"

    id = Column(String, primary_key=True, index=True)
    account_id = Column(String, index=True)
    class_id = Column(String)
    class_name = Column(String)
    booking_date = Column(DateTime, default=datetime.utcnow)
    success = Column(Boolean, default=False)
    message = Column(String, nullable=True)


class SessionToken(Base):
    __tablename__ = "session_tokens"

    id = Column(String, primary_key=True, index=True)
    account_id = Column(String, index=True)
    token_hash = Column(String, unique=True, index=True)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    revoked_at = Column(DateTime, nullable=True)


def _get_columns(table_name: str) -> set[str]:
    with engine.connect() as connection:
        rows = connection.execute(text(f"PRAGMA table_info({table_name})")).mappings()
        return {row["name"] for row in rows}


def _table_exists(table_name: str) -> bool:
    with engine.connect() as connection:
        row = connection.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name=:table_name"),
            {"table_name": table_name},
        ).first()
        return row is not None


def _add_column_if_missing(table_name: str, definition: str) -> None:
    column_name = definition.split()[0]
    if column_name in _get_columns(table_name):
        return

    with engine.begin() as connection:
        connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {definition}"))


def _migrate_accounts_table() -> None:
    if not _table_exists("accounts"):
        return

    account_columns = {
        "password_hash TEXT",
        "upace_password_encrypted TEXT",
        "api_key_encrypted TEXT",
        "user_login_key_encrypted TEXT",
        "barcode_encrypted TEXT",
    }

    for definition in account_columns:
        _add_column_if_missing("accounts", definition)


def _migrate_selected_classes_table() -> None:
    if not _table_exists("selected_classes"):
        return

    selected_class_columns = {
        "status TEXT DEFAULT 'scheduled'",
        "attempted_at DATETIME",
        "last_message TEXT",
    }

    for definition in selected_class_columns:
        _add_column_if_missing("selected_classes", definition)

    with engine.begin() as connection:
        connection.execute(
            text("UPDATE selected_classes SET status = 'scheduled' WHERE status IS NULL")
        )


def _migrate_legacy_account_secrets() -> None:
    from security import decrypt_secret, encrypt_secret, hash_password

    db = SessionLocal()
    try:
        accounts = db.query(Account).all()
        changed = False

        for account in accounts:
            if account.password and not account.password_hash:
                account.password_hash = hash_password(account.password)
                account.upace_password_encrypted = encrypt_secret(account.password)
                account.password = None
                changed = True
            elif account.password_hash and not account.upace_password_encrypted and account.password:
                account.upace_password_encrypted = encrypt_secret(account.password)
                account.password = None
                changed = True

            if account.api_key and not account.api_key_encrypted:
                account.api_key_encrypted = encrypt_secret(account.api_key)
                account.api_key = None
                changed = True

            if account.user_login_key and not account.user_login_key_encrypted:
                account.user_login_key_encrypted = encrypt_secret(account.user_login_key)
                account.user_login_key = None
                changed = True

            if account.barcode and not account.barcode_encrypted:
                account.barcode_encrypted = encrypt_secret(account.barcode)
                account.barcode = None
                changed = True

            if account.password_hash and account.upace_password_encrypted:
                try:
                    decrypt_secret(account.upace_password_encrypted)
                except Exception:
                    if account.password:
                        account.upace_password_encrypted = encrypt_secret(account.password)
                        account.password = None
                        changed = True

        if changed:
            db.commit()
    finally:
        db.close()


def run_migrations() -> None:
    Base.metadata.create_all(bind=engine)
    _migrate_accounts_table()
    _migrate_selected_classes_table()
    Base.metadata.create_all(bind=engine)
    _migrate_legacy_account_secrets()


run_migrations()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
