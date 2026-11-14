"""Replay exactly one selected failed event; preserve event_id and cap replay budget."""

import argparse
import json

from sqlalchemy import select

from clinic.broker import connect, publish, topology
from clinic.config import settings
from clinic.db import session
from clinic.models import Delivery, OutboxEvent, now
from clinic.telemetry import configure_logging, log


def replay(event_id, limit=1000):
    with connect() as connection:
        channel = connection.channel()
        topology(channel)
        for _ in range(limit):
            method, properties, body = channel.basic_get(
                settings().queue_prefix + ".dlq", auto_ack=False
            )
            if method is None:
                break
            event = json.loads(body)
            if event.get("event_id") != event_id:
                continue  # Kept unacked, then requeued by closing this channel.
            with session() as db, db.begin():
                delivery = db.scalar(
                    select(Delivery).where(Delivery.event_id == event_id).with_for_update()
                )
                stored = db.get(OutboxEvent, event_id)
                if not delivery or not stored or stored.payload != event:
                    raise ValueError("event not recognized")
                if delivery.status != "FAILED_DLQ" or delivery.replay_count >= 1:
                    raise ValueError("replay requires FAILED_DLQ with remaining budget (one cycle)")
                delivery.status, delivery.attempts = "RETRY_PENDING", 0
                delivery.replay_count += 1
                delivery.lease_until, delivery.lease_token = None, None
                delivery.updated_at = now()
                # Confirm before committing state and ack; a crash can duplicate, never exactly once.
                publish(channel, event)
            channel.basic_ack(method.delivery_tag)
            log(
                "notification-worker",
                "dlq_replayed",
                event_id=event_id,
                correlation_id=event["correlation_id"],
                replay_count=delivery.replay_count,
            )
            return
    raise ValueError("selected event not found within scan limit; other messages requeued")


if __name__ == "__main__":
    configure_logging()
    parser = argparse.ArgumentParser()
    parser.add_argument("event_id")
    args = parser.parse_args()
    replay(args.event_id)
