"""Object storage integration for Emergent managed storage."""
import os
import requests
import logging
from typing import Optional

logger = logging.getLogger(__name__)

STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"

_storage_key: Optional[str] = None


def _emergent_key() -> Optional[str]:
    return os.environ.get("EMERGENT_LLM_KEY")


def _app_name() -> str:
    return os.environ.get("APP_NAME", "seller-hub")


# Lazy module-level so importers can still use storage.APP_NAME
class _LazyAppName(str):
    def __new__(cls):
        return super().__new__(cls, os.environ.get("APP_NAME", "seller-hub"))


APP_NAME = _LazyAppName()


def init_storage() -> str:
    global _storage_key
    if _storage_key:
        return _storage_key
    key = _emergent_key()
    if not key:
        raise RuntimeError("EMERGENT_LLM_KEY is not set")
    resp = requests.post(
        f"{STORAGE_URL}/init",
        json={"emergent_key": key},
        timeout=30,
    )
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    logger.info("Object storage initialized")
    return _storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data,
        timeout=120,
    )
    if resp.status_code == 403:
        # refresh storage key once
        global _storage_key
        _storage_key = None
        key = init_storage()
        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data,
            timeout=120,
        )
    resp.raise_for_status()
    return resp.json()


def get_object(path: str) -> tuple[bytes, str]:
    key = init_storage()
    resp = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key},
        timeout=60,
    )
    if resp.status_code == 403:
        global _storage_key
        _storage_key = None
        key = init_storage()
        resp = requests.get(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key},
            timeout=60,
        )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")
