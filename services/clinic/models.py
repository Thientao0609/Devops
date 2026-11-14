import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    false,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def now():
    return datetime.now(UTC)


def uid():
    return str(uuid.uuid4())


def utc(value):
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="patient")
    __table_args__ = (CheckConstraint("role IN ('patient','admin')"),)


class Doctor(Base):
    __tablename__ = "doctors"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(100))
    specialty: Mapped[str] = mapped_column(String(100))
    active: Mapped[bool] = mapped_column(default=True)


class Slot(Base):
    __tablename__ = "appointment_slots"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    doctor_id: Mapped[str] = mapped_column(ForeignKey("doctors.id"))
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    __table_args__ = (
        UniqueConstraint("doctor_id", "starts_at"),
        CheckConstraint("ends_at > starts_at"),
    )


class Appointment(Base):
    __tablename__ = "appointments"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    slot_id: Mapped[str] = mapped_column(ForeignKey("appointment_slots.id"))
    status: Mapped[str] = mapped_column(String(20), default="BOOKED")
    version: Mapped[int] = mapped_column(Integer, default=1)
    reminder_enabled: Mapped[bool] = mapped_column(default=False, server_default=false())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    __table_args__ = (
        CheckConstraint("status IN ('BOOKED','CANCELLED','COMPLETED')"),
        Index(
            "uq_occupied_slot",
            "slot_id",
            unique=True,
            postgresql_where=text("status IN ('BOOKED','COMPLETED')"),
            sqlite_where=text("status IN ('BOOKED','COMPLETED')"),
        ),
    )


class IdempotencyKey(Base):
    __tablename__ = "idempotency_keys"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    operation: Mapped[str] = mapped_column(String(40), default="book")
    key: Mapped[str] = mapped_column(String(128))
    payload_hash: Mapped[str] = mapped_column(String(64))
    response: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    __table_args__ = (UniqueConstraint("user_id", "operation", "key"),)


class OutboxEvent(Base):
    __tablename__ = "outbox_events"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    appointment_id: Mapped[str] = mapped_column(ForeignKey("appointments.id"))
    payload: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    lease_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    lease_token: Mapped[str | None] = mapped_column(String(36), nullable=True)
    __table_args__ = (Index("ix_outbox_pending", "published_at", "lease_until"),)


class Delivery(Base):
    __tablename__ = "notification_deliveries"
    event_id: Mapped[str] = mapped_column(ForeignKey("outbox_events.id"), primary_key=True)
    channel: Mapped[str] = mapped_column(String(20), default="email")
    recipient_key: Mapped[str] = mapped_column(ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(String(30), default="PENDING")
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    replay_count: Mapped[int] = mapped_column(Integer, default=0)
    lease_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    lease_token: Mapped[str | None] = mapped_column(String(36), nullable=True)
    last_error: Mapped[str | None] = mapped_column(String(100), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    __table_args__ = (
        UniqueConstraint("event_id", "channel", "recipient_key"),
        CheckConstraint(
            "status IN ('PENDING','PROCESSING','RETRY_PENDING','SENT','SKIPPED','FAILED_DLQ')"
        ),
    )


class Reminder(Base):
    __tablename__ = "appointment_reminders"
    appointment_id: Mapped[str] = mapped_column(ForeignKey("appointments.id"), primary_key=True)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), default="PENDING")
    event_id: Mapped[str | None] = mapped_column(
        ForeignKey("outbox_events.id"), nullable=True, unique=True
    )
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    __table_args__ = (
        CheckConstraint("status IN ('PENDING','ENQUEUED','CANCELLED')"),
        Index("ix_reminder_due", "status", "due_at"),
    )
