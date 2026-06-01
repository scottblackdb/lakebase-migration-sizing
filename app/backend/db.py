from __future__ import annotations

from contextlib import contextmanager
from typing import Any, Sequence

import psycopg
from psycopg.rows import dict_row

from backend.config import settings


def _connection_password() -> str | None:
    """
    Lakebase (OAuth): short-lived token from ``generate_database_credential``.
    Local / legacy Postgres: static ``PGPASSWORD``.
    """
    if settings.use_lakebase_oauth:
        from backend.lakebase_auth import get_lakebase_oauth_password

        return get_lakebase_oauth_password()
    pw = (settings.PG_PASSWORD or "").strip()
    return pw or None


def _connect_kwargs() -> dict[str, Any]:
    kwargs: dict[str, Any] = dict(
        host=settings.PG_HOST,
        port=settings.PG_PORT,
        dbname=settings.PG_DATABASE,
        user=settings.PG_USER,
        sslmode=settings.PG_SSLMODE,
    )
    password = _connection_password()
    if password:
        kwargs["password"] = password
    elif settings.use_lakebase_oauth:
        raise RuntimeError(
            "Lakebase OAuth is enabled but no database credential was obtained"
        )
    return kwargs


@contextmanager
def get_connection():
    """Connect to Postgres (Lakebase OAuth or native password auth)."""
    conn = psycopg.connect(**_connect_kwargs())
    try:
        yield conn
    finally:
        conn.close()


def execute(query: str, params: Sequence[Any] | None = None) -> None:
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(query, params)
        conn.commit()


def executemany(query: str, params_seq: Sequence[Sequence[Any]]) -> None:
    if not params_seq:
        return
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.executemany(query, params_seq)
        conn.commit()


def fetchall(query: str, params: Sequence[Any] | None = None) -> list[dict]:
    with get_connection() as conn:
        with conn.cursor(row_factory=dict_row) as cursor:
            cursor.execute(query, params)
            return [dict(row) for row in cursor.fetchall()]
