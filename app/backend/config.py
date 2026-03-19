import os


class Settings:
    DATABRICKS_HOST: str = os.environ.get("DATABRICKS_HOST", "")
    DATABRICKS_TOKEN: str = os.environ.get("DATABRICKS_TOKEN", "")
    PG_HOST: str = os.environ.get("PG_HOST", "localhost")
    PG_PORT: int = int(os.environ.get("PG_PORT", "5432"))
    PG_DATABASE: str = os.environ.get("PG_DATABASE", "lakebase_sizing")
    PG_USER: str = os.environ.get("PG_USER", "postgres")
    PG_PASSWORD: str = os.environ.get("PG_PASSWORD", "")
    PG_SCHEMA: str = os.environ.get("PG_SCHEMA", "estimator")
    FOUNDATION_MODEL: str = os.environ.get("FOUNDATION_MODEL", "databricks-gpt-5-2")

    @property
    def schema_prefix(self) -> str:
        return f"{self.PG_SCHEMA}."


settings = Settings()
