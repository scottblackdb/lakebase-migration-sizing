from contextlib import contextmanager

import psycopg2
import psycopg2.extras

from backend.config import settings


@contextmanager
def get_connection():
    conn = psycopg2.connect(
        host=settings.PG_HOST,
        port=settings.PG_PORT,
        dbname=settings.PG_DATABASE,
        user=settings.PG_USER,
        password=settings.PG_PASSWORD,
        sslmode="require",
    )
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
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
            cursor.execute(query)
            return [dict(row) for row in cursor.fetchall()]
