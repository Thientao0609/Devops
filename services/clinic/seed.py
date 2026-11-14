from datetime import timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select

from clinic.config import settings
from clinic.db import session
from clinic.models import Doctor, Slot, User, now, utc
from clinic.security import passwords


def seed():
    if settings().environment == "production":
        raise ValueError("Demo seed is disabled in production")
    password = settings().demo_password
    if not password or len(password.get_secret_value()) < 12:
        raise ValueError("Set DEMO_PASSWORD with at least 12 characters; seed only synthetic data")
    with session() as db, db.begin():
        for email, role in [
            ("patient@example.test", "patient"),
            ("other@example.test", "patient"),
            ("admin@example.test", "admin"),
        ]:
            if not db.scalar(select(User).where(User.email == email)):
                db.add(
                    User(
                        email=email,
                        role=role,
                        password_hash=passwords.hash(password.get_secret_value()),
                    )
                )
        for name, specialty in [("BS. Nguyễn An", "Nội tổng quát"), ("BS. Trần Bình", "Tim mạch")]:
            doctor = db.scalar(select(Doctor).where(Doctor.name == name))
            if doctor is None:
                doctor = Doctor(name=name, specialty=specialty)
                db.add(doctor)
                db.flush()
            tomorrow = now().astimezone(ZoneInfo("Asia/Ho_Chi_Minh")).replace(
                hour=8, minute=0, second=0, microsecond=0
            ) + timedelta(days=1)
            for day in range(7):
                for period in range(16):
                    start = utc(tomorrow + timedelta(days=day, minutes=period * 30))
                    if not db.scalar(
                        select(Slot).where(Slot.doctor_id == doctor.id, Slot.starts_at == start)
                    ):
                        db.add(
                            Slot(
                                doctor_id=doctor.id,
                                starts_at=start,
                                ends_at=start + timedelta(minutes=30),
                            )
                        )


if __name__ == "__main__":
    seed()
