import os


class Settings:
    DATABRICKS_HOST: str = os.environ.get("DATABRICKS_HOST", "")
    DATABRICKS_TOKEN: str = os.environ.get("DATABRICKS_TOKEN", "")
    PG_HOST: str = os.environ.get("PGHOST", "localhost")
    PG_PORT: int = int(os.environ.get("PGPORT", "5432"))
    PG_DATABASE: str = os.environ.get("PGDATABASE", "lakebase_sizing")
    PG_USER: str = os.environ.get("PGUSER", "postgres")
    PG_PASSWORD: str = os.environ.get("PGPASSWORD", "")
    PG_SCHEMA: str = os.environ.get("PGSCHEMA", "estimator")
    FOUNDATION_MODEL: str = os.environ.get("FOUNDATION_MODEL", "databricks-gpt-5-2")

    @property
    def schema_prefix(self) -> str:
        return f"{self.PG_SCHEMA}."


settings = Settings()
