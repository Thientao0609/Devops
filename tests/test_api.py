import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

import pytest
from clinic.db import engine, session
from clinic.models import Appointment, Doctor, OutboxEvent, Slot, User, now, utc
from clinic.seed import seed
from conftest import auth, booking
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError


def test_seed_is_idempotent(client):
    with session() as db:
        before = [db.scalar(select(func.count()).select_from(m)) for m in [Doctor, Slot, User]]
    seed()
    with session() as db:
        assert before == [
            db.scalar(select(func.count()).select_from(m)) for m in [Doctor, Slot, User]
        ]


def test_auth_and_observability(client, patient):
    assert client.get("/health").status_code == 200
    assert client.get("/ready").status_code == 200
    assert client.get("/api/doctors").status_code == 401
    assert (
        client.post(
            "/api/auth/login", json={"email": "missing@example.test", "password": "wrong"}
        ).status_code
        == 401
    )
    assert client.get("/api/admin/appointments", headers=patient).status_code == 403
    response = client.get("/api/doctors", headers={**patient, "X-Request-ID": "test-request-1"})
    assert response.headers["X-Request-ID"] == "test-request-1"
    assert "clinic_http_duration_seconds" in client.get("/metrics").text
    assert client.get("/openapi.json").status_code == 200


def test_book_atomic_idempotency(client, patient, slot_id):
    first = booking(client, patient, slot_id, "repeat")
    assert first.status_code == 201, first.text
    assert first.json()["notification_status"] == "PENDING"
    assert booking(client, patient, slot_id, "repeat").json() == first.json()
    assert booking(client, patient, slot_id).status_code == 409
    assert booking(client, patient, str(uuid.uuid4()), "repeat").status_code == 409
    with session() as db:
        assert db.scalar(select(func.count()).select_from(Appointment)) == 1
        assert db.scalar(select(func.count()).select_from(OutboxEvent)) == 1
        event = db.scalar(select(OutboxEvent))
        assert event.payload["appointment_id"] == first.json()["id"]


def test_ownership_cancel_and_rebook(client, patient, slot_id):
    appointment_id = booking(client, patient, slot_id).json()["id"]
    other = auth(client, "other@example.test")
    for path, method in [
        (f"/api/appointments/{appointment_id}", "get"),
        (f"/api/appointments/{appointment_id}/cancel", "post"),
    ]:
        assert getattr(client, method)(path, headers=other).status_code == 404
    path = f"/api/appointments/{appointment_id}/cancel"
    assert client.post(path, headers=patient).json()["status"] == "CANCELLED"
    assert client.post(path, headers=patient).json()["version"] == 2
    with session() as db:
        assert db.scalar(select(func.count()).select_from(OutboxEvent)) == 2
    assert booking(client, other, slot_id).status_code == 201


def test_past_and_complete_rules(client, patient, admin, slot_id):
    appointment_id = booking(client, patient, slot_id).json()["id"]
    path = f"/api/admin/appointments/{appointment_id}/complete"
    assert client.post(path, headers=admin).status_code == 409
    assert client.delete(f"/api/admin/slots/{slot_id}", headers=admin).status_code == 409
    with session() as db, db.begin():
        slot = db.get(Slot, slot_id)
        starts, ends = utc(slot.starts_at), utc(slot.ends_at)
        slot.starts_at, slot.ends_at = now() - timedelta(hours=2), now() - timedelta(hours=1)
    try:
        assert booking(client, patient, slot_id).status_code == 409
        assert client.post(path, headers=admin).json()["status"] == "COMPLETED"
        assert (
            client.post(f"/api/appointments/{appointment_id}/cancel", headers=patient).status_code
            == 409
        )
        with session() as db, db.begin():
            user = db.scalar(select(User).where(User.email == "other@example.test"))
            db.add(Appointment(user_id=user.id, slot_id=slot_id))
            with pytest.raises(IntegrityError):
                db.flush()
            db.rollback()
    finally:
        with session() as db, db.begin():
            slot = db.get(Slot, slot_id)
            slot.starts_at, slot.ends_at = starts, ends


def test_admin_management(client, admin, patient):
    response = client.post(
        "/api/admin/doctors", headers=admin, json={"name": "BS. Kiểm thử", "specialty": "Demo"}
    )
    doctor_id = response.json()["id"]
    start = now() + timedelta(days=9)
    payload = {
        "doctor_id": doctor_id,
        "starts_at": start.isoformat(),
        "ends_at": (start + timedelta(minutes=30)).isoformat(),
    }
    assert client.post("/api/admin/slots", headers=patient, json=payload).status_code == 403
    created = client.post("/api/admin/slots", headers=admin, json=payload)
    assert created.status_code == 201
    assert client.post("/api/admin/slots", headers=admin, json=payload).status_code == 409
    assert (
        client.delete("/api/admin/slots/" + created.json()["id"], headers=admin).status_code == 200
    )


@pytest.mark.parametrize("same_key", [False, True])
def test_concurrent_postgresql_booking(client, patient, slot_id, same_key):
    if engine().dialect.name != "postgresql":
        pytest.skip("PostgreSQL required: SQLite does not prove row locking/concurrency")
    from clinic.api import app

    def request(index):
        with TestClient(app) as parallel:
            return booking(parallel, patient, slot_id, "same" if same_key else str(index))

    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(request, range(2)))
    assert sorted(r.status_code for r in responses) == ([201, 201] if same_key else [201, 409])
    with session() as db:
        assert db.scalar(select(func.count()).select_from(Appointment)) == 1
        assert db.scalar(select(func.count()).select_from(OutboxEvent)) == 1
