from contextlib import contextmanager

from databricks import sql

from backend.config import settings


@contextmanager
def get_connection():
    conn = sql.connect(
        server_hostname=settings.DATABRICKS_HOST,
        http_path=settings.DATABRICKS_SQL_WAREHOUSE_PATH,
        access_token=settings.DATABRICKS_TOKEN,
    )
    try:
        yield conn
    finally:
        conn.close()


def execute(query: str) -> None:
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(query)


def fetchall(query: str) -> list[dict]:
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(query)
            columns = [desc[0] for desc in cursor.description]
            return [dict(zip(columns, row)) for row in cursor.fetchall()]
