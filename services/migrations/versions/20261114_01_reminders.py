"""Add optional appointment reminders without changing existing booking preferences."""

import sqlalchemy as sa
from alembic import op

revision = "20261114_01"
down_revision = "0b3e2278237d"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "appointments",
        sa.Column("reminder_enabled", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.create_table(
        "appointment_reminders",
        sa.Column(
            "appointment_id", sa.String(36), sa.ForeignKey("appointments.id"), primary_key=True
        ),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column(
            "event_id", sa.String(36), sa.ForeignKey("outbox_events.id"), nullable=True, unique=True
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("status IN ('PENDING','ENQUEUED','CANCELLED')"),
    )
    op.create_index("ix_reminder_due", "appointment_reminders", ["status", "due_at"])


def downgrade():
    op.drop_index("ix_reminder_due", table_name="appointment_reminders")
    op.drop_table("appointment_reminders")
    op.drop_column("appointments", "reminder_enabled")
