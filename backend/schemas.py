"""Pydantic request and response models.

These define the JSON shapes that move across the HTTP boundary. The ORM
(`models.py`) is the database layer; these are the API layer. Keep them
distinct so internal columns (password hashes, encrypted secrets) never
leak out in responses.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class AccountCreate(BaseModel):
    name: str
    email: str
    password: str


class AccountLogin(BaseModel):
    email: str
    password: str


class AccountResponse(BaseModel):
    id: str
    name: str
    email: str
    created_at: datetime

    class Config:
        from_attributes = True


class AuthResponse(BaseModel):
    account: AccountResponse
    token: str


class WorkoutClassResponse(BaseModel):
    id: str
    name: str
    day: str
    time: str
    instructor: str
    slot_id: str
    spots_available: int


class SelectedClassCreate(BaseModel):
    account_id: str
    class_id: str
    class_name: str
    day: str
    time: str
    instructor: str
    slot_id: str


class SelectedClassResponse(BaseModel):
    id: str
    account_id: str
    class_id: str
    class_name: str
    day: str
    time: str
    instructor: str
    slot_id: str
    status: str
    attempted_at: Optional[datetime] = None
    last_message: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class BookingHistoryResponse(BaseModel):
    id: str
    account_id: str
    class_id: str
    class_name: str
    booking_date: datetime
    success: bool
    message: Optional[str]

    class Config:
        from_attributes = True


class BookingRequest(BaseModel):
    selection_ids: list[str] = []
