"""JWT auth + bcrypt password hashing utilities."""
import os
import jwt
import bcrypt
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

ALGO = "HS256"


def _jwt_secret() -> str:
    return os.environ.get("JWT_SECRET", "dev-secret-change-me-minimum-32-bytes-required-for-hmac")


def _jwt_refresh_secret() -> str:
    return os.environ.get("JWT_REFRESH_SECRET", "dev-refresh-secret-change-me-minimum-32-bytes-required-hmac")


def _access_exp_min() -> int:
    return int(os.environ.get("JWT_ACCESS_EXP_MIN", "60"))


def _refresh_exp_days() -> int:
    return int(os.environ.get("JWT_REFRESH_EXP_DAYS", "14"))


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, role: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "role": role,
        "type": "access",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=_access_exp_min())).timestamp()),
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, _jwt_secret(), algorithm=ALGO)


def create_refresh_token(user_id: str, role: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "role": role,
        "type": "refresh",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=_refresh_exp_days())).timestamp()),
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, _jwt_refresh_secret(), algorithm=ALGO)


def decode_access_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, _jwt_secret(), algorithms=[ALGO])
    except Exception:
        return None


def decode_refresh_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, _jwt_refresh_secret(), algorithms=[ALGO])
    except Exception:
        return None


def create_reset_token(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "type": "reset",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=30)).timestamp()),
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, _jwt_secret(), algorithm=ALGO)


def decode_reset_token(token: str) -> Optional[dict]:
    try:
        data = jwt.decode(token, _jwt_secret(), algorithms=[ALGO])
        if data.get("type") != "reset":
            return None
        return data
    except Exception:
        return None
