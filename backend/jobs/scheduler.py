"""Background scheduler that auto-books selections when their T-5d window opens.

Runs `scan_and_book_due_classes` every few seconds via APScheduler. For each
account, it asks BookingService which "scheduled" selections have crossed
their T-5d threshold and books exactly those. `max_instances=1` + `coalesce`
prevent overlapping scans if one tick takes longer than the interval.
"""

import logging

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

from booking_service import BookingService
from models import Account, SessionLocal


logger = logging.getLogger(__name__)

booking_service = BookingService()

# Frequent scans are cheap (just a DB query) and keep us within seconds of T-5d.
SCAN_INTERVAL_SECONDS = 5


def scan_and_book_due_classes() -> None:
    """Find selections whose T-5d window has opened and book them once."""
    db = SessionLocal()
    try:
        accounts = db.query(Account).all()
        for account in accounts:
            due_ids = booking_service.find_due_selection_ids(db, account.id)
            if not due_ids:
                continue

            logger.info("Auto-booking %d due selection(s) for %s", len(due_ids), account.name)

            if not booking_service.authenticate_account(db, account.id):
                logger.warning("Skipping %s: Upace authentication failed", account.name)
                continue

            try:
                results = booking_service.book_selected_classes(db, account.id, due_ids)
                logger.info("Auto-book results for %s: %s", account.name, results)
            except Exception as exc:
                logger.error("Auto-book failed for %s: %s", account.name, exc)
    finally:
        db.close()


def start_scheduler():
    scheduler = BackgroundScheduler()
    scheduler.add_job(
        scan_and_book_due_classes,
        IntervalTrigger(seconds=SCAN_INTERVAL_SECONDS),
        id="scan_due_classes",
        name="Auto-book classes when T-5d window opens",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    scheduler.start()
    logger.info("Scheduler started (scan interval: %ds)", SCAN_INTERVAL_SECONDS)
    return scheduler
