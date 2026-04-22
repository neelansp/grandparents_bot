# This file sets up the SQLite database and defines the tables.
#
# There are three tables:
#   - accounts: one row per grandparent (their Upace login info)
#   - selected_classes: classes someone has picked and wants to book
#   - booking_history: a log of every booking attempt (success or fail)
#
# Call create_tables() once on startup to make the tables if they don't exist.

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, String, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker


DATABASE_FILE = "grandparents_bot.db"
DATABASE_URL = f"sqlite:///./{DATABASE_FILE}"


engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class Account(Base):
    __tablename__ = "accounts"

    id = Column(String, primary_key=True)
    name = Column(String)
    email = Column(String, unique=True)
    # Upace login info. Stored as plain text because this app runs on a
    # home LAN and only trusted family members can reach it.
    upace_password = Column(String)
    api_key = Column(String, nullable=True)
    user_login_key = Column(String, nullable=True)
    barcode = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class SelectedClass(Base):
    __tablename__ = "selected_classes"

    id = Column(String, primary_key=True)
    account_id = Column(String, index=True)
    class_id = Column(String)
    class_name = Column(String)
    day = Column(String)
    time = Column(String)
    instructor = Column(String)
    slot_id = Column(String)
    # One of: scheduled, manual, booked, failed
    status = Column(String, default="scheduled")
    attempted_at = Column(DateTime, nullable=True)
    last_message = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class BookingHistory(Base):
    __tablename__ = "booking_history"

    id = Column(String, primary_key=True)
    account_id = Column(String, index=True)
    class_id = Column(String)
    class_name = Column(String)
    booking_date = Column(DateTime, default=datetime.utcnow)
    success = Column(Boolean, default=False)
    message = Column(String, nullable=True)


def create_tables():
    """Create any tables that don't exist yet."""
    Base.metadata.create_all(bind=engine)


def get_db():
    """FastAPI uses this to give each request its own database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
