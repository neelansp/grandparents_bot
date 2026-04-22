"""HTTP routes for browsing, selecting, and booking workout classes.

Mounted at `/classes`. All endpoints require an authenticated session and only
operate on the caller's own account_id (enforced via `require_account_access`).

The actual Upace work is delegated to `booking_service`; these handlers just
translate between HTTP and the service layer.
"""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from auth import get_current_account, require_account_access
from booking_service import BookingService, compute_reservation_open_at
from models import Account, SelectedClass, get_db
from schemas import BookingRequest, SelectedClassCreate, SelectedClassResponse


router = APIRouter(prefix="/classes", tags=["classes"])
booking_service = BookingService()


@router.get("/available/{account_id}")
def get_available_classes(
    account_id: str,
    date: str,
    db: Session = Depends(get_db),
    current_account: Account = Depends(get_current_account),
):
    require_account_access(account_id, current_account)

    try:
        classes = booking_service.fetch_classes_for_date(db, account_id, date)
        return {
            "date": date,
            "classes": classes,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/booked/{account_id}")
def get_booked_classes(
    account_id: str,
    db: Session = Depends(get_db),
    current_account: Account = Depends(get_current_account),
):
    require_account_access(account_id, current_account)

    try:
        bookings = booking_service.fetch_booked_classes(db, account_id)
        return {"bookings": bookings}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/select", response_model=SelectedClassResponse)
def select_class(
    selected: SelectedClassCreate,
    db: Session = Depends(get_db),
    current_account: Account = Depends(get_current_account),
):
    require_account_access(selected.account_id, current_account)

    existing = db.query(SelectedClass).filter(
        SelectedClass.account_id == selected.account_id,
        SelectedClass.class_id == selected.class_id,
        SelectedClass.day == selected.day,
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail="Class already selected for that day")

    open_at = compute_reservation_open_at(selected.day, selected.time)
    initial_status = "scheduled" if open_at and open_at > datetime.now() else "manual"

    new_selection = SelectedClass(
        id=str(uuid.uuid4()),
        account_id=selected.account_id,
        class_id=selected.class_id,
        class_name=selected.class_name,
        day=selected.day,
        time=selected.time,
        instructor=selected.instructor,
        slot_id=selected.slot_id,
        status=initial_status,
    )
    db.add(new_selection)
    db.commit()
    db.refresh(new_selection)
    return new_selection


@router.get("/selected/{account_id}", response_model=list[SelectedClassResponse])
def get_selected_classes(
    account_id: str,
    db: Session = Depends(get_db),
    current_account: Account = Depends(get_current_account),
):
    require_account_access(account_id, current_account)
    return db.query(SelectedClass).filter(
        SelectedClass.account_id == account_id
    ).order_by(SelectedClass.day.asc(), SelectedClass.time.asc()).all()


@router.delete("/selected/{selection_id}")
def deselect_class(
    selection_id: str,
    db: Session = Depends(get_db),
    current_account: Account = Depends(get_current_account),
):
    selection = db.query(SelectedClass).filter(SelectedClass.id == selection_id).first()
    if not selection:
        raise HTTPException(status_code=404, detail="Selection not found")

    require_account_access(selection.account_id, current_account)
    db.delete(selection)
    db.commit()
    return {"message": "Class deselected"}


@router.post("/book/{account_id}")
def book_classes(
    account_id: str,
    booking_request: BookingRequest,
    db: Session = Depends(get_db),
    current_account: Account = Depends(get_current_account),
):
    require_account_access(account_id, current_account)
    try:
        results = booking_service.book_selected_classes(
            db,
            account_id,
            booking_request.selection_ids,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    return {
        "account_id": account_id,
        "bookings": results,
    }
