"""Small in-memory sliding-window rate limiter keyed by client IP.

Good enough for a single-instance demo; a multi-instance deployment would need Redis.
"""

import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request


class RateLimiter:
    def __init__(self, name: str, limits: list[tuple[int, int]]):
        """`limits` is a list of (max_requests, window_seconds)."""
        self.name = name
        self.limits = [(n, w) for n, w in limits if n > 0]
        self.hits: dict[str, deque[float]] = defaultdict(deque)
        self.longest_window = max((w for _, w in self.limits), default=0)

    def check(self, key: str, now: float | None = None) -> None:
        if not self.limits:
            return
        now = time.monotonic() if now is None else now
        hits = self.hits[key]
        while hits and now - hits[0] > self.longest_window:
            hits.popleft()

        for max_requests, window in self.limits:
            recent = sum(1 for t in hits if now - t <= window)
            if recent >= max_requests:
                oldest_in_window = next(t for t in hits if now - t <= window)
                retry_after = max(1, int(window - (now - oldest_in_window)) + 1)
                raise HTTPException(
                    status_code=429,
                    detail="Too many requests — slow down a little and try again.",
                    headers={"Retry-After": str(retry_after)},
                )
        hits.append(now)

        # Keep memory bounded when many distinct IPs show up.
        if len(self.hits) > 10_000:
            stale = [k for k, v in self.hits.items() if not v or now - v[-1] > self.longest_window]
            for k in stale:
                del self.hits[k]

    def reset(self) -> None:
        self.hits.clear()


def client_ip(request: Request) -> str:
    # Render and Vercel sit behind a proxy; the first forwarded address is the caller.
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
