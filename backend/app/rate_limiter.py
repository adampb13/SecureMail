import time
import threading
from collections import deque
from typing import Deque, Dict

RateLimitConfig = {
    "login": {"limit": 5, "window": 60},  # 5 attempts per 60 seconds per IP
}

_lock = threading.Lock()
_buckets: Dict[str, Dict[str, Deque[float]]] = {"login": {}}


def check_rate_limit(kind: str, key: str) -> bool:
    cfg = RateLimitConfig.get(kind)
    if not cfg:
        return True
    limit = cfg["limit"]
    window = cfg["window"]
    now = time.time()
    with _lock:
        bucket = _buckets.setdefault(kind, {}).setdefault(key, deque())
        while bucket and now - bucket[0] > window:
            bucket.popleft()
        if len(bucket) >= limit:
            return False
        bucket.append(now)
        return True
