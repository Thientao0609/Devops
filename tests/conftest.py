import os
import uuid

import pytest
from alembic import command
from alembic.config import Config
from clinic.config import settings
from clinic.db import engine, session
from clinic.models import Appointment, Delivery, IdempotencyKey, OutboxEvent, Reminder
from clinic.seed import seed
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import make_url


@pytest.fixture(scope="session", autouse=True)
def isolated_database(tmp_path_factory):
    # Never migrate or truncate the user's dev DB in tests.
    source = os.environ.get("TEST_DATABASE_URL")
    admin_engine = None
    original = {
        key: os.environ.get(key)
        for key in [
            "DATABASE_URL",
            "QUEUE_PREFIX",
            "DEMO_PASSWORD",
            "RETRY_SECONDS",
            "JWT_SECRET",
            "RABBITMQ_URL",
            "ENVIRONMENT",
        ]
    }
    if source:
        url = make_url(source)
        if url.get_backend_name() != "postgresql":
            raise ValueError("TEST_DATABASE_URL must point to PostgreSQL")
        name = "clinic_test_" + uuid.uuid4().hex
        admin_engine = create_engine(
            url.set(database="postgres"),
            isolation_level="AUTOCOMMIT",
            connect_args={"connect_timeout": 5},
        )
        with admin_engine.connect() as connection:
            connection.execute(text(f'CREATE DATABASE "{name}"'))
        test_url = url.set(database=name).render_as_string(hide_password=False)
    else:
        test_url = "sqlite:///" + str(tmp_path_factory.mktemp("db") / "test.db")
    os.environ.update(
        DATABASE_URL=test_url,
        QUEUE_PREFIX="clinic.test." + uuid.uuid4().hex,
        DEMO_PASSWORD="Synthetic-test-password-123",
        RETRY_SECONDS="1,2,3",
        ENVIRONMENT="test",
    )
    os.environ.setdefault("JWT_SECRET", uuid.uuid4().hex + uuid.uuid4().hex)
    if os.environ.get("RUN_BROKER_TESTS") != "1":
        os.environ.setdefault("RABBITMQ_URL", "amqp://unused:unused@localhost:1/test")
    settings.cache_clear()
    engine.cache_clear()
    command.upgrade(Config("alembic.ini"), "head")
    seed()
    yield
    engine().dispose()
    engine.cache_clear()
    if admin_engine:
        with admin_engine.connect() as connection:
            connection.execute(text(f'DROP DATABASE "{name}" WITH (FORCE)'))
        admin_engine.dispose()
    for key, value in original.items():
        if value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = value
    settings.cache_clear()


@pytest.fixture(autouse=True)
def clean_business_data(isolated_database):
    with session() as db, db.begin():
        for model in [Reminder, Delivery, OutboxEvent, IdempotencyKey, Appointment]:
            db.query(model).delete()


@pytest.fixture
def client():
    from clinic.api import app

    with TestClient(app) as value:
        yield value


def auth(client, email="patient@example.test"):
    response = client.post(
        "/api/auth/login", json={"email": email, "password": "Synthetic-test-password-123"}
    )
    assert response.status_code == 200
    return {"Authorization": "Bearer " + response.json()["access_token"]}


@pytest.fixture
def patient(client):
    return auth(client)


@pytest.fixture
def admin(client):
    return auth(client, "admin@example.test")


@pytest.fixture
def slot_id(client, patient):
    for doctor in client.get("/api/doctors", headers=patient).json():
        available = client.get(f"/api/doctors/{doctor['id']}/slots", headers=patient).json()
        if available:
            return available[0]["id"]
    raise AssertionError("Seed must provide future slots")


def booking(client, patient, slot_id, key=None):
    return client.post(
        "/api/appointments",
        headers={**patient, "Idempotency-Key": key or str(uuid.uuid4())},
        json={"slot_id": slot_id},
    )


@pytest.fixture
def event(client, patient, slot_id):
    assert booking(client, patient, slot_id).status_code == 201
    with session() as db:
        return dict(db.scalar(select(OutboxEvent)).payload)
