from datetime import timedelta

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash

from clinic.config import settings
from clinic.db import get_db
from clinic.models import User, now

passwords = PasswordHash.recommended()
bearer = HTTPBearer(auto_error=False)
DUMMY_HASH = passwords.hash("not-a-real-user-password")


def create_token(user):
    return jwt.encode(
        {
            "sub": user.id,
            "exp": now() + timedelta(minutes=settings().token_minutes),
            "iss": "clinic",
            "aud": "clinic-ui",
        },
        settings().jwt_secret.get_secret_value(),
        algorithm="HS256",
    )


def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer), db=Depends(get_db)
):
    try:
        if credentials is None:
            raise ValueError()
        payload = jwt.decode(
            credentials.credentials,
            settings().jwt_secret.get_secret_value(),
            algorithms=["HS256"],
            issuer="clinic",
            audience="clinic-ui",
            options={"require": ["sub", "exp", "iss", "aud"]},
        )
        user = db.get(User, payload["sub"])
        if user is None:
            raise ValueError()
        return user
    except (jwt.PyJWTError, ValueError, KeyError):
        raise HTTPException(401, "Phiên đăng nhập không hợp lệ hoặc đã hết hạn") from None


def admin_user(user=Depends(current_user)):
    if user.role != "admin":
        raise HTTPException(403, "Chỉ quản trị viên được thực hiện thao tác này")
    return user
