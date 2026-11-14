import hashlib
import json
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from types import SimpleNamespace

import pytest
from clinic import worker
from clinic.config import settings
from clinic.db import engine, session
from clinic.models import (
    Appointment,
    Delivery,
    Doctor,
    IdempotencyKey,
    OutboxEvent,
    Reminder,
    Slot,
    now,
    utc,
)
from clinic.reminders import enqueue_due_reminders
from conftest import auth
from sqlalchemy import func, select
from test_events import ConfirmedTestChannel


def opt_in(client, patient, slot_id, key="reminder-booking"):
    response = client.post(
        "/api/appointments",
        headers={**patient, "Idempotency-Key": key},
        json={"slot_id": slot_id, "reminder_enabled": True},
    )
    assert response.status_code == 201, response.text
    return response.json()


def due_time(appointment_id):
    with session() as db:
        return utc(db.get(Reminder, appointment_id).due_at) + timedelta(seconds=1)


def test_opt_in_idempotency_and_payload_scope(client, patient, slot_id):
    appointment = opt_in(client, patient, slot_id)
    assert appointment["reminder_enabled"] and appointment["reminder_status"] == "SCHEDULED"
    assert client.get("/api/options", headers=patient).json() == {
        "reminder_lead_minutes": settings().reminder_lead_minutes
    }
    repeated = opt_in(client, patient, slot_id)
    assert repeated == appointment
    assert (
        client.post(
            "/api/appointments",
            headers={**patient, "Idempotency-Key": "reminder-booking"},
            json={"slot_id": slot_id, "reminder_enabled": False},
        ).status_code
        == 409
    )
    with session() as db:
        task = db.get(Reminder, appointment["id"])
        assert utc(task.due_at) == utc(db.get(Slot, slot_id).starts_at) - timedelta(
            minutes=settings().reminder_lead_minutes
        )
        assert db.scalar(select(func.count()).select_from(Reminder)) == 1
        assert db.scalar(select(func.count()).select_from(OutboxEvent)) == 1


def test_toggle_persists_one_schedule_and_checks_owner(client, patient, slot_id):
    appointment = opt_in(client, patient, slot_id)
    endpoint = f"/api/appointments/{appointment['id']}/reminder"
    other = auth(client, "other@example.test")
    assert client.patch(endpoint, headers=other, json={"enabled": False}).status_code == 404
    assert (
        client.patch(endpoint, headers=patient, json={"enabled": False}).json()["reminder_enabled"]
        is False
    )
    assert enqueue_due_reminders(due_time(appointment["id"])) == 0
    assert (
        client.patch(endpoint, headers=patient, json={"enabled": True}).json()["reminder_status"]
        == "SCHEDULED"
    )
    assert (
        client.get(f"/api/appointments/{appointment['id']}", headers=patient).json()[
            "reminder_enabled"
        ]
        is True
    )
    with session() as db:
        assert db.scalar(select(func.count()).select_from(Reminder)) == 1
        assert db.get(Appointment, appointment["id"]).version == 1


def test_due_scheduler_enqueues_once(client, patient, slot_id):
    appointment = opt_in(client, patient, slot_id)
    clock = due_time(appointment["id"])
    assert enqueue_due_reminders(clock) == 1
    assert enqueue_due_reminders(clock) == 0
    with session() as db:
        task = db.get(Reminder, appointment["id"])
        assert task.status == "ENQUEUED"
        event = db.get(OutboxEvent, task.event_id)
        assert event.payload["event_type"] == "appointment.reminder.v1"
        assert db.get(Delivery, task.event_id).status == "PENDING"
        assert db.scalar(select(func.count()).select_from(OutboxEvent)) == 2


def test_cancel_stops_pending_reminder(client, patient, slot_id):
    appointment = opt_in(client, patient, slot_id)
    clock = due_time(appointment["id"])
    assert (
        client.post(f"/api/appointments/{appointment['id']}/cancel", headers=patient).status_code
        == 200
    )
    assert enqueue_due_reminders(clock) == 0
    assert (
        client.patch(
            f"/api/appointments/{appointment['id']}/reminder",
            headers=patient,
            json={"enabled": True},
        ).status_code
        == 409
    )
    with session() as db:
        assert db.get(Reminder, appointment["id"]).status == "CANCELLED"


def test_disabled_queued_reminder_is_skipped(client, patient, slot_id):
    appointment = opt_in(client, patient, slot_id)
    assert enqueue_due_reminders(due_time(appointment["id"])) == 1
    with session() as db:
        event = dict(db.get(OutboxEvent, db.get(Reminder, appointment["id"]).event_id).payload)
    assert (
        client.patch(
            f"/api/appointments/{appointment['id']}/reminder",
            headers=patient,
            json={"enabled": False},
        ).status_code
        == 200
    )
    sent = []
    channel = ConfirmedTestChannel()
    worker.process(
        channel, SimpleNamespace(delivery_tag=1), None, json.dumps(event).encode(), sent.append
    )
    assert not sent and channel.acked == [1]
    with session() as db:
        assert db.get(Delivery, event["event_id"]).status == "SKIPPED"


def test_past_reminder_is_not_enqueued(client, patient, slot_id):
    appointment = opt_in(client, patient, slot_id)
    with session() as db:
        clock = utc(db.get(Slot, slot_id).starts_at) + timedelta(seconds=1)
    assert enqueue_due_reminders(clock) == 0
    with session() as db:
        assert db.get(Reminder, appointment["id"]).status == "CANCELLED"


def test_too_late_opt_in_rolls_back_booking_and_outbox(client, patient):
    with session() as db, db.begin():
        doctor = Doctor(name="zz Reminder boundary", specialty="Synthetic")
        db.add(doctor)
        db.flush()
        start = now() + timedelta(minutes=settings().reminder_lead_minutes / 2)
        slot = Slot(doctor_id=doctor.id, starts_at=start, ends_at=start + timedelta(minutes=30))
        db.add(slot)
        db.flush()
        slot_id = slot.id
    response = client.post(
        "/api/appointments",
        headers={**patient, "Idempotency-Key": str(uuid.uuid4())},
        json={"slot_id": slot_id, "reminder_enabled": True},
    )
    assert response.status_code == 422
    with session() as db:
        assert db.scalar(select(func.count()).select_from(Appointment)) == 0
        assert db.scalar(select(func.count()).select_from(OutboxEvent)) == 0


def test_legacy_idempotency_key_remains_valid(client, patient, slot_id):
    headers = {**patient, "Idempotency-Key": "legacy"}
    first = client.post("/api/appointments", headers=headers, json={"slot_id": slot_id})
    with session() as db, db.begin():
        db.scalar(select(IdempotencyKey)).payload_hash = hashlib.sha256(
            slot_id.encode()
        ).hexdigest()
    assert (
        client.post("/api/appointments", headers=headers, json={"slot_id": slot_id}).json()
        == first.json()
    )


def test_taken_slots_visible_without_exposing_owner(client, patient, slot_id):
    appointment = opt_in(client, patient, slot_id)
    doctor_id = appointment["slot"]["doctor_id"]
    public = client.get(
        f"/api/doctors/{doctor_id}/slots?include_unavailable=true", headers=patient
    ).json()
    occupied = next(slot for slot in public if slot["id"] == slot_id)
    assert occupied["available"] is False
    assert "user_id" not in occupied and "appointment_id" not in occupied
    available = client.get(f"/api/doctors/{doctor_id}/slots", headers=patient).json()
    assert all(slot["id"] != slot_id for slot in available)


def test_concurrent_postgresql_reminder_scheduler(client, patient, slot_id):
    if engine().dialect.name != "postgresql":
        pytest.skip("PostgreSQL required for concurrent reminder row locks")
    appointment = opt_in(client, patient, slot_id)
    clock = due_time(appointment["id"])
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: enqueue_due_reminders(clock), range(2)))
    assert sum(results) == 1
    with session() as db:
        assert db.scalar(select(func.count()).select_from(OutboxEvent)) == 2
