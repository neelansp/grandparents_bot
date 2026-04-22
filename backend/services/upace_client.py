"""Thin HTTP client for the Upace mobile API.

Mirrors the calls the real Upace app makes (CheckTheUser → LoginTheUser →
upaceClasses → ReserveClass, plus upaceMyReservations for upcoming bookings).
The endpoints, field names, and `uid="110"` constant were captured from the
app's traffic with Proxyman — see `starter/capture_requests/`.

This module knows nothing about the database or accounts; it just talks to
Upace. Higher-level orchestration lives in `booking_service.py`.
"""

import httpx
from typing import Optional, Dict, Any
from datetime import datetime


class UpaceClient:
    BASE_URL = "https://www.upaceapp.com/Api"

    def __init__(self):
        self.client = httpx.Client()
        self.api_key: Optional[str] = None
        self.user_login_key: Optional[str] = None

    def check_user(self, email: str, uid: str = "110") -> Dict[str, Any]:
        """Step 1: Email submission to start login"""
        data = {
            "email": email,
            "password": "",
            "uid": uid,
        }
        response = self.client.post(
            f"{self.BASE_URL}/CheckTheUser",
            data=data,
        )
        return response.json()

    def login_user(self, user_login_key: str, password: str, uid: str = "110") -> Dict[str, Any]:
        """Step 2: Password submission to complete login"""
        data = {
            "user_login_key": user_login_key,
            "email": "",
            "password": password,
            "app": "true",
        }
        response = self.client.post(
            f"{self.BASE_URL}/LoginTheUser",
            data=data,
        )
        result = response.json()
        if result.get("error") == 0:
            self.api_key = result.get("api_key")
            self.user_login_key = user_login_key
        return result

    def get_classes(
        self, uid: str, date: str, class_type: str = "class", time: Optional[str] = None
    ) -> Dict[str, Any]:
        """Step 3: Fetch available classes for a date.

        The mobile app sends the *current time* in the `time` field when
        requesting classes. Some backends use this to control which classes
        are visible (e.g. hide classes earlier than the current time).
        To mirror the app behavior and ensure we see the same classes,
        default to the current time if none is provided.
        """
        if not self.api_key:
            return {"error": 1, "message": "Not authenticated"}

        # Use current time (HH:MM:SS) by default to match app behavior
        if time is None:
            time = datetime.now().strftime("%H:%M:%S")

        data = {
            "uid": uid,
            "api_key": self.api_key,
            "class_type": class_type,
            "date": date,
            "time": time,
            "gym_id": "0",
        }
        response = self.client.post(
            f"{self.BASE_URL}/upaceClasses",
            data=data,
        )
        return response.json()

    def get_my_reservations(self, uid: str = "110") -> Dict[str, Any]:
        """Fetch the user's upcoming reservations from /Api/upaceMyReservations.

        Request body is assumed to mirror the upaceClasses pattern (uid + api_key).
        Confirm via packet capture if reservations endpoint returns an error.
        """
        if not self.api_key:
            return {"error": 1, "message": "Not authenticated"}

        data = {
            "uid": uid,
            "api_key": self.api_key,
        }
        response = self.client.post(
            f"{self.BASE_URL}/upaceMyReservations",
            data=data,
        )
        return response.json()

    def reserve_class(
        self,
        user_id: str,
        uid: str,
        class_id: str,
        slot_id: str,
        date: str,
        class_type: str = "live",
    ) -> Dict[str, Any]:
        """Step 4: Register for a class"""
        if not self.api_key:
            return {"error": 1, "message": "Not authenticated"}

        data = {
            "user_id": user_id,
            "uid": uid,
            "api_key": self.api_key,
            "class_id": class_id,
            "slot_id": slot_id,
            "date": date,
            "class_type": class_type,
        }
        response = self.client.post(
            f"{self.BASE_URL}/ReserveClass",
            data=data,
        )
        return response.json()

    def close(self):
        self.client.close()
