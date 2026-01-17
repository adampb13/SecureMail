import threading
import time
from typing import Optional, Any

# Simple in-memory store for decrypted private keys tied to token jti.
_store: dict[str, tuple[Any, float]] = {}
_lock = threading.Lock()


def store_private_key(jti: str, private_key: Any, expires_at: float) -> None:
    with _lock:
        _store[jti] = (private_key, expires_at)


def get_private_key(jti: str) -> Optional[Any]:
    now = time.time()
    with _lock:
        entry = _store.get(jti)
        if not entry:
            return None
        key, expires_at = entry
        if expires_at < now:
            _store.pop(jti, None)
            return None
        return key


def revoke_private_key(jti: str) -> None:
    with _lock:
        _store.pop(jti, None)
