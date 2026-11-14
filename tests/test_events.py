import json
import smtplib
from datetime import timedelta
from types import SimpleNamespace

import pytest
from clinic import publisher, worker
from clinic.db import session
from clinic.models import Delivery, OutboxEvent, now


class ConfirmedTestChannel:
    """Unit boundary only: no broker/SMTP runtime evidence is inferred from this fake."""

    def __init__(self):
        self.published, self.acked = [], []

    def basic_publish(self, **kwargs):
        self.published.append(kwargs)

    def basic_ack(self, tag):
        self.acked.append(tag)


def invoke(channel, event, sender):
    worker.process(
        channel, SimpleNamespace(delivery_tag=1), None, json.dumps(event).encode(), sender
    )


def test_unit_confirm_failure_keeps_outbox(event, monkeypatch):
    def fail(*args, **kwargs):
        raise RuntimeError("simulated unroutable/confirm failure")

    monkeypatch.setattr(publisher, "publish", fail)
    with pytest.raises(RuntimeError):
        publisher.publish_one(ConfirmedTestChannel())
    with session() as db:
        stored = db.get(OutboxEvent, event["event_id"])
        assert stored.published_at is None
        assert stored.lease_token is None


def test_unit_dedupe_only_after_success(event):
    channel, sends = ConfirmedTestChannel(), []
    invoke(channel, event, sends.append)
    invoke(channel, event, sends.append)
    assert len(sends) == 1 and channel.acked == [1, 1]
    with session() as db:
        assert db.get(Delivery, event["event_id"]).status == "SENT"


def test_unit_stale_confirmation_skipped(client, patient, event):
    assert (
        client.post(
            f"/api/appointments/{event['appointment_id']}/cancel", headers=patient
        ).status_code
        == 200
    )
    sends = []
    invoke(ConfirmedTestChannel(), event, sends.append)
    assert sends == []
    with session() as db:
        assert db.get(Delivery, event["event_id"]).status == "SKIPPED"


def test_unit_retry_finite_dlq(event):
    channel = ConfirmedTestChannel()

    def failed(data):
        raise smtplib.SMTPException("synthetic failure")

    for _ in range(4):
        invoke(channel, event, failed)
    with session() as db:
        delivery = db.get(Delivery, event["event_id"])
        assert delivery.status == "FAILED_DLQ" and delivery.attempts == 4
        assert delivery.last_error == "SMTPException"
    assert len(channel.published) == 4
    assert channel.published[-1]["routing_key"] == "failed"
    assert channel.acked == [1, 1, 1, 1]


def test_unit_retry_publish_failure_does_not_ack(event, monkeypatch):
    channel = ConfirmedTestChannel()

    def failed(data):
        raise OSError("synthetic SMTP outage")

    def no_route(*args, **kwargs):
        raise RuntimeError("synthetic no route")

    monkeypatch.setattr(worker, "publish", no_route)
    with pytest.raises(RuntimeError):
        invoke(channel, event, failed)
    assert channel.acked == []
    with session() as db:
        assert db.get(Delivery, event["event_id"]).status == "PROCESSING"


def test_unit_lease_recovery(event):
    assert worker.claim_event(event)[0] == "claimed"
    assert worker.claim_event(event)[0] == "busy"
    with session() as db, db.begin():
        db.get(Delivery, event["event_id"]).lease_until = now() - timedelta(seconds=1)
    assert worker.claim_event(event)[0] == "claimed"
