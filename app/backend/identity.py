"""Derive app identity from the ``X-Forwarded-User`` header set by the reverse proxy."""

from __future__ import annotations

from typing import Mapping


def current_user_from_request(headers: Mapping[str, str]) -> str | None:
    """Return the signed-in user from ``X-Forwarded-Email``, or ``None`` if absent/blank."""
    raw = headers.get("x-forwarded-email")
    if not raw:
        return None
    s = raw.strip()
    return s or None
