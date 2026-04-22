"""Business logic for browsing classes and reserving them on Upace.

The route handlers (`routes/classes.py`) and the background scheduler
(`jobs/scheduler.py`) both go through this service so the Upace auth +
reservation flow lives in exactly one place. UpaceClient handles the raw
HTTP calls; this layer adds account lookup, credential decryption, status
transitions on SelectedClass rows, and the T-5d "is this due yet" rule.
"""

import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from models import Account, BookingHistory, SelectedClass
from security import decrypt_secret, encrypt_secret
from services.upace_client import UpaceClient


# Upace opens reservations exactly 5 days before class start.
RESERVATION_LEAD_DAYS = 5

_TIME_FORMATS = ("%H:%M:%S", "%H:%M", "%I:%M %p", "%I:%M:%S %p")


def parse_class_datetime(day: str, time: str) -> Optional[datetime]:
    """Parse a SelectedClass.day + .time pair into a naive local datetime."""
    if not day or not time:
        return None

    day_part = day.strip()
    time_part = time.strip()

    for fmt in _TIME_FORMATS:
        try:
            return datetime.strptime(f"{day_part} {time_part}", f"%Y-%m-%d {fmt}")
        except ValueError:
            continue
    return None


def compute_reservation_open_at(day: str, time: str) -> Optional[datetime]:
    """Return the moment auto-booking should fire (T - RESERVATION_LEAD_DAYS)."""
    class_dt = parse_class_datetime(day, time)
    if class_dt is None:
        return None
    return class_dt - timedelta(days=RESERVATION_LEAD_DAYS)


class BookingService:
    """Service to handle Upace authentication, class fetching, and booking."""

    def __init__(self):
        self.upace = UpaceClient()

    def _get_account(self, db: Session, account_id: str) -> Account | None:
        return db.query(Account).filter(Account.id == account_id).first()

    def _set_client_credentials(self, account: Account) -> bool:
        api_key = decrypt_secret(account.api_key_encrypted)
        user_login_key = decrypt_secret(account.user_login_key_encrypted)
        if not api_key or not user_login_key:
            return False

        self.upace.api_key = api_key
        self.upace.user_login_key = user_login_key
        return True

    def _persist_upace_credentials(
        self,
        db: Session,
        account: Account,
        password: str,
        user_login_key: str,
        login_response: Dict[str, Any],
    ) -> None:
        account.name = login_response.get("user_name") or account.name
        account.upace_password_encrypted = encrypt_secret(password)
        account.api_key_encrypted = encrypt_secret(login_response.get("api_key"))
        account.user_login_key_encrypted = encrypt_secret(user_login_key)
        account.barcode_encrypted = encrypt_secret(login_response.get("barcode"))
        db.commit()
        db.refresh(account)
        self._set_client_credentials(account)

    def authenticate_account(
        self,
        db: Session,
        account_id: str,
        password: str | None = None,
    ) -> bool:
        account = self._get_account(db, account_id)
        if not account:
            return False

        resolved_password = password or decrypt_secret(account.upace_password_encrypted)
        if not resolved_password:
            return False

        check_response = self.upace.check_user(account.email)
        if check_response.get("error") not in (None, 0) and "function" not in check_response:
            return False

        user_login_key = check_response.get("user_login_key")
        if not user_login_key:
            return False

        login_response = self.upace.login_user(user_login_key, resolved_password)
        if login_response.get("error") not in (None, 0):
            return False

        self._persist_upace_credentials(
            db,
            account,
            resolved_password,
            user_login_key,
            login_response,
        )
        return True

    def _ensure_authenticated(self, db: Session, account: Account) -> bool:
        if self._set_client_credentials(account):
            return True
        return self.authenticate_account(db, account.id)

    def _is_response_error(self, response: Dict[str, Any]) -> bool:
        error_value = response.get("error")
        return error_value not in (None, 0, "0")

    def book_selected_classes(
        self,
        db: Session,
        account_id: str,
        selection_ids: list[str] | None = None,
    ) -> List[Dict[str, Any]]:
        account = self._get_account(db, account_id)
        if not account:
            raise ValueError("Account not found")

        if not self._ensure_authenticated(db, account):
            raise RuntimeError("Unable to authenticate with Upace")

        selected_classes_query = db.query(SelectedClass).filter(
            SelectedClass.account_id == account_id
        )
        if selection_ids:
            selected_classes_query = selected_classes_query.filter(
                SelectedClass.id.in_(selection_ids)
            )

        selected_classes = selected_classes_query.order_by(
            SelectedClass.day.asc(),
            SelectedClass.time.asc(),
        ).all()

        results = []
        for cls in selected_classes:
            if cls.status == "booked":
                results.append(
                    {
                        "selection_id": cls.id,
                        "class_id": cls.class_id,
                        "class_name": cls.class_name,
                        "day": cls.day,
                        "success": True,
                        "message": cls.last_message or "Already booked",
                        "skipped": True,
                    }
                )
                continue

            reserve_response = self.upace.reserve_class(
                user_id=decrypt_secret(account.user_login_key_encrypted) or "",
                uid="110",
                class_id=cls.class_id,
                slot_id=cls.slot_id,
                date=cls.day,
            )

            if self._is_response_error(reserve_response) and self.authenticate_account(db, account_id):
                refreshed_account = self._get_account(db, account_id)
                reserve_response = self.upace.reserve_class(
                    user_id=decrypt_secret(refreshed_account.user_login_key_encrypted) or "",
                    uid="110",
                    class_id=cls.class_id,
                    slot_id=cls.slot_id,
                    date=cls.day,
                )

            success = not self._is_response_error(reserve_response)
            message = reserve_response.get("message")

            booking_record = BookingHistory(
                id=str(uuid.uuid4()),
                account_id=account_id,
                class_id=cls.class_id,
                class_name=cls.class_name,
                success=success,
                message=message,
            )
            db.add(booking_record)

            cls.status = "booked" if success else "failed"
            cls.attempted_at = datetime.now()
            cls.last_message = message

            results.append(
                {
                    "selection_id": cls.id,
                    "class_id": cls.class_id,
                    "class_name": cls.class_name,
                    "day": cls.day,
                    "success": success,
                    "message": message,
                }
            )

        db.commit()
        return results

    def find_due_selection_ids(self, db: Session, account_id: str) -> list[str]:
        """Return ids of scheduled selections whose T-5d window has opened."""
        now = datetime.now()
        candidates = db.query(SelectedClass).filter(
            SelectedClass.account_id == account_id,
            SelectedClass.status == "scheduled",
        ).all()

        due_ids: list[str] = []
        for cls in candidates:
            open_at = compute_reservation_open_at(cls.day, cls.time)
            if open_at is not None and open_at <= now:
                due_ids.append(cls.id)
        return due_ids

    def fetch_booked_classes(
        self,
        db: Session,
        account_id: str,
    ) -> List[Dict[str, Any]]:
        """Return the user's confirmed Upace reservations (excludes waitlist + cancellations)."""
        account = self._get_account(db, account_id)
        if not account or not self._ensure_authenticated(db, account):
            return []

        response = self.upace.get_my_reservations()
        if self._is_response_error(response):
            if not self.authenticate_account(db, account_id):
                return []
            response = self.upace.get_my_reservations()
            if self._is_response_error(response):
                return []

        reservations = response.get("class_reservations") or []
        booked: List[Dict[str, Any]] = []

        for item in reservations:
            cancelled = (item.get("is_cancelled") or {}).get("cancelled")
            if cancelled:
                continue

            instructor = " ".join(
                part for part in [
                    (item.get("instructor_first_name") or "").strip(),
                    (item.get("instructor_last_name") or "").strip(),
                ] if part
            ).strip() or "TBD"

            booked.append({
                "id": item.get("id"),
                "class_id": item.get("class_id"),
                "slot_id": item.get("slot_id"),
                "name": (item.get("name") or "").strip(),
                "day": item.get("r_date"),
                "time": item.get("reservation_start_time"),
                "end_time": item.get("reservation_end_time"),
                "instructor": instructor,
                "room_name": item.get("room_name"),
                "wait_position": item.get("wait_position") or "",
                "waitlist_id": item.get("waitlist_id") or "",
            })

        return booked

    def fetch_classes_for_date(
        self,
        db: Session,
        account_id: str,
        date: str,
    ) -> List[Dict[str, Any]]:
        account = self._get_account(db, account_id)
        if not account or not self._ensure_authenticated(db, account):
            return []

        response = self.upace.get_classes(uid="110", date=date)
        if self._is_response_error(response):
            if not self.authenticate_account(db, account_id):
                return []
            response = self.upace.get_classes(uid="110", date=date)
            if self._is_response_error(response):
                return []

        class_list = response.get("class_index", [])
        all_classes = []

        for cls in class_list:
            class_name = (cls.get("name") or "").strip()

            instructor_first = (cls.get("instructor_first_name") or "").strip()
            instructor_last = (cls.get("instructor_last_name") or "").strip()
            instructor = " ".join(part for part in [instructor_first, instructor_last] if part).strip()

            all_classes.append(
                {
                    "id": cls.get("id"),
                    "name": class_name,
                    "slot_id": cls.get("slot_id"),
                    "day": date,
                    "time": cls.get("start_time"),
                    "instructor": instructor or "TBD",
                    "spots_available": int(cls.get("spots_available", 0)),
                }
            )

        return all_classes
