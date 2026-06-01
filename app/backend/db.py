from __future__ import annotations

from contextlib import contextmanager
from typing import Any, Sequence

import psycopg
from psycopg.rows import dict_row

from backend.config import settings


@contextmanager
def get_connection():
    """Connect using native Postgres authentication (``PGUSER`` + ``PGPASSWORD``)."""
    kwargs: dict = dict(
        host=settings.PG_HOST,
        port=settings.PG_PORT,
        dbname=settings.PG_DATABASE,
        user=settings.PG_USER,
        sslmode=settings.PG_SSLMODE,
    )
    pw = (settings.PG_PASSWORD or "").strip()
    if pw:
        kwargs["password"] = pw
    conn = psycopg.connect(**kwargs)
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
