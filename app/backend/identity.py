"""Derive app identity from inbound HTTP (e.g. reverse proxy auth)."""

from __future__ import annotations

from typing import Mapping


def owner_from_x_forwarded_user(headers: Mapping[str, str]) -> str | None:
    """
    Owner stored on analyses: value of ``X-Forwarded-User`` when present and non-blank.

    Proxies (e.g. Databricks Apps, OAuth gateways) often set this header for the signed-in user.
    """
    raw = headers.get("x-forwarded-user")
    if not raw:
        return None
    s = raw.strip()
    return s or None
