"""
Short-lived OAuth tokens for Lakebase Postgres (Autoscaling).

When ``LAKEBASE_ENDPOINT`` is set, ``backend.db`` uses
``postgres.generate_database_credential`` instead of a static ``PGPASSWORD``.
Tokens expire after ~1 hour; refresh before expiry (see ``get_lakebase_oauth_password``).
"""
from __future__ import annotations

import logging
import threading
from datetime import datetime, timedelta, timezone

from backend.config import settings

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_cached_token: str | None = None
_token_expires_at: datetime | None = None

# Refresh before the 1-hour OAuth expiry (Lakebase team guidance: 30–50 min).
_DEFAULT_TOKEN_TTL = timedelta(minutes=50)
_REFRESH_SKEW = timedelta(minutes=2)


def _parse_expiration(expiration_time: object) -> datetime | None:
    if expiration_time is None:
        return None
    if isinstance(expiration_time, datetime):
        dt = expiration_time
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    ts = str(expiration_time).strip()
    if not ts:
        return None
    if ts.endswith("Z"):
        ts = ts[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(ts)
    except ValueError:
        return None


def _generate_database_token() -> tuple[str, datetime]:
    from databricks.sdk import WorkspaceClient

    endpoint = settings.LAKEBASE_ENDPOINT.strip()
    w = WorkspaceClient()
    cred = w.postgres.generate_database_credential(endpoint=endpoint)
    token = getattr(cred, "token", None)
    if not token:
        raise RuntimeError(
            "Lakebase generate_database_credential returned an empty token"
        )
    expires = _parse_expiration(getattr(cred, "expiration_time", None))
    if expires is None:
        expires = datetime.now(timezone.utc) + _DEFAULT_TOKEN_TTL
    return token, expires


def get_lakebase_oauth_password() -> str:
    """Return a valid Lakebase OAuth token, refreshing when near expiry."""
    global _cached_token, _token_expires_at

    now = datetime.now(timezone.utc)
    with _lock:
        if (
            _cached_token
            and _token_expires_at
            and now < _token_expires_at - _REFRESH_SKEW
        ):
            return _cached_token

        token, expires = _generate_database_token()
        _cached_token = token
        _token_expires_at = expires
        logger.debug(
            "Refreshed Lakebase OAuth token (expires %s)",
            expires.isoformat(),
        )
        return token


def reset_lakebase_oauth_cache() -> None:
    """Clear cached token (for tests)."""
    global _cached_token, _token_expires_at
    with _lock:
        _cached_token = None
        _token_expires_at = None
