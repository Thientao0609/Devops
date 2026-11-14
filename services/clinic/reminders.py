from datetime import timedelta

from sqlalchemy import select

from clinic.config import settings
from clinic.db import session
from clinic.events import add_event
from clinic.models import Appointment, Reminder, Slot, now, utc
from clinic.telemetry import EVENT_COUNT, log


def set_reminder(db, appointment, enabled):
    """Caller owns the appointment row lock; always lock appointment before reminder."""
    task = db.scalar(
        select(Reminder).where(Reminder.appointment_id == appointment.id).with_for_update()
    )
    if enabled == appointment.reminder_enabled and (not enabled or task is not None):
        return
    if enabled:
        due_at = utc(db.get(Slot, appointment.slot_id).starts_at) - timedelta(
            minutes=settings().reminder_lead_minutes
        )
        if due_at <= now():
            raise ValueError(
                f"Vui lòng đặt lịch trước ít nhất {settings().reminder_lead_minutes} phút để bật nhắc lịch."
            )
        if task and task.event_id:
            raise ValueError("Nhắc lịch này đã được xử lý. Bạn vẫn có thể xem thông tin lịch hẹn.")
        if task is None:
            task = Reminder(appointment_id=appointment.id, due_at=due_at, status="PENDING")
            db.add(task)
        else:
            task.due_at, task.status, task.updated_at = due_at, "PENDING", now()
    elif task:
        task.status, task.updated_at = "CANCELLED", now()
    appointment.reminder_enabled = enabled
    db.flush()


def cancel_reminder(db, appointment):
    task = db.scalar(
        select(Reminder).where(Reminder.appointment_id == appointment.id).with_for_update()
    )
    if task:
        task.status, task.updated_at = "CANCELLED", now()


def enqueue_due_reminders(clock=None):
    """A DB-backed timer in the publisher. clock is injectable for isolated time-travel tests."""
    clock = utc(clock) if clock else now()
    enqueued = []
    with session() as db, db.begin():
        candidates = list(
            db.scalars(
                select(Appointment)
                .join(Reminder, Reminder.appointment_id == Appointment.id)
                .where(Reminder.status == "PENDING", Reminder.due_at <= clock)
                .order_by(Reminder.due_at, Appointment.id)
                .with_for_update(of=Appointment, skip_locked=True)
                .limit(25)
            )
        )
        for appointment in candidates:
            task = db.scalar(
                select(Reminder).where(Reminder.appointment_id == appointment.id).with_for_update()
            )
            if task.status != "PENDING":
                continue
            if (
                appointment.status != "BOOKED"
                or not appointment.reminder_enabled
                or utc(db.get(Slot, appointment.slot_id).starts_at) <= clock
            ):
                task.status, task.updated_at = "CANCELLED", now()
                continue
            correlation_id = "reminder-" + appointment.id
            task.event_id = add_event(db, appointment, "appointment.reminder.v1", correlation_id)
            task.status, task.updated_at = "ENQUEUED", now()
            enqueued.append((task.event_id, correlation_id))
    for event_id, correlation_id in enqueued:
        EVENT_COUNT.labels("outbox-publisher", "reminder_enqueued").inc()
        log(
            "outbox-publisher",
            "reminder_enqueued",
            event_id=event_id,
            correlation_id=correlation_id,
        )
    return len(enqueued)
