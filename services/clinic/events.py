from clinic.models import Delivery, OutboxEvent, now, uid


def add_event(db, appointment, event_type, correlation_id):
    event_id = uid()
    db.add(
        OutboxEvent(
            id=event_id,
            appointment_id=appointment.id,
            payload={
                "event_id": event_id,
                "event_type": event_type,
                "schema_version": 1,
                "occurred_at": now().isoformat(),
                "appointment_id": appointment.id,
                "appointment_version": appointment.version,
                "correlation_id": correlation_id,
            },
        )
    )
    db.flush()
    db.add(Delivery(event_id=event_id, recipient_key=appointment.user_id))
    db.flush()
    return event_id
