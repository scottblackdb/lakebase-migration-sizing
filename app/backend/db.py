from __future__ import annotations

from contextlib import contextmanager

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


def execute(query: str) -> None:
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(query)
        conn.commit()


def fetchall(query: str) -> list[dict]:
    with get_connection() as conn:
        with conn.cursor(row_factory=dict_row) as cursor:
            cursor.execute(query)
            return [dict(row) for row in cursor.fetchall()]
