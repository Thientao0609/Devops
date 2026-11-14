import os

from sqlalchemy import select

from clinic.config import settings
from clinic.db import session
from clinic.models import User
from clinic.security import passwords

if __name__ == "__main__":
    if settings().environment == "production":
        raise SystemExit("Demo password reset is disabled in production")
    value = settings().demo_password
    if not value or len(value.get_secret_value()) < 12:
        raise SystemExit("Set DEMO_PASSWORD with at least 12 characters locally")
    with session() as db, db.begin():
        user = db.scalar(select(User).where(User.email == os.environ["DEMO_EMAIL"]))
        if user is None:
            raise SystemExit("User not found; no changes made")
        user.password_hash = passwords.hash(value.get_secret_value())
    print("Password updated. Rotate JWT_SECRET and restart if existing tokens must be revoked.")
