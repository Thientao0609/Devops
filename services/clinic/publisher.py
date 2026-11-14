import time
from datetime import timedelta

from sqlalchemy import func, or_, select

from clinic.broker import connect, publish, topology
from clinic.config import settings
from clinic.db import session
from clinic.models import OutboxEvent, now, uid, utc
from clinic.reminders import enqueue_due_reminders
from clinic.telemetry import DEPENDENCY, EVENT_COUNT, EVENT_TIME, OUTBOX_AGE, OUTBOX_PENDING, log


def claim():
    with session() as db, db.begin():
        event = db.scalar(
            select(OutboxEvent)
            .where(
                OutboxEvent.published_at.is_(None),
                or_(OutboxEvent.lease_until.is_(None), OutboxEvent.lease_until < now()),
            )
            .order_by(OutboxEvent.created_at)
            .with_for_update(skip_locked=True)
            .limit(1)
        )
        if event is None:
            return None
        event.lease_token = uid()
        event.lease_until = now() + timedelta(seconds=settings().lease_seconds)
        return event.id, event.lease_token, dict(event.payload)


def pending_metrics():
    with session() as db:
        count, oldest = db.execute(
            select(func.count(), func.min(OutboxEvent.created_at)).where(
                OutboxEvent.published_at.is_(None)
            )
        ).one()
        OUTBOX_PENDING.set(count)
        OUTBOX_AGE.set(max(0, (now() - utc(oldest)).total_seconds()) if oldest else 0)


def publish_one(channel):
    item = claim()
    if item is None:
        return False
    event_id, token, payload = item
    start = time.monotonic()
    try:
        publish(channel, payload)
        with session() as db, db.begin():
            event = db.scalar(
                select(OutboxEvent)
                .where(OutboxEvent.id == event_id, OutboxEvent.lease_token == token)
                .with_for_update()
            )
            if event:
                event.published_at = now()
                event.lease_until = None
                event.lease_token = None
        EVENT_COUNT.labels("outbox-publisher", "published").inc()
        log(
            "outbox-publisher",
            "event_published",
            event_id=event_id,
            correlation_id=payload["correlation_id"],
        )
        return True
    except Exception:
        # Release lease on a known error; process death relies on lease expiry.
        with session() as db, db.begin():
            event = db.scalar(
                select(OutboxEvent)
                .where(OutboxEvent.id == event_id, OutboxEvent.lease_token == token)
                .with_for_update()
            )
            if event:
                event.lease_until = None
                event.lease_token = None
        EVENT_COUNT.labels("outbox-publisher", "failed").inc()
        raise
    finally:
        EVENT_TIME.labels("outbox-publisher").observe(time.monotonic() - start)


def run(stop):
    while not stop.is_set():
        try:
            enqueue_due_reminders()
            pending_metrics()
            with connect() as connection:
                channel = connection.channel()
                topology(channel)
                DEPENDENCY.labels("rabbitmq").set(1)
                while not stop.is_set():
                    enqueue_due_reminders()
                    pending_metrics()
                    if not publish_one(channel):
                        connection.process_data_events(time_limit=0.2)
                        stop.wait(0.5)
        except Exception as exc:
            DEPENDENCY.labels("rabbitmq").set(0)
            log(
                "outbox-publisher",
                "publish_loop_failed",
                level="ERROR",
                error_type=type(exc).__name__,
            )
            stop.wait(2)
