import os


class Settings:
    DATABRICKS_HOST: str = os.environ.get("DATABRICKS_HOST", "")
    DATABRICKS_TOKEN: str = os.environ.get("DATABRICKS_TOKEN", "")
    DATABRICKS_SQL_WAREHOUSE_PATH: str = os.environ.get("DATABRICKS_SQL_WAREHOUSE_PATH", "")
    CATALOG: str = os.environ.get("CATALOG", "main")
    SCHEMA: str = os.environ.get("SCHEMA", "default")
    FOUNDATION_MODEL: str = os.environ.get("FOUNDATION_MODEL", "databricks-gpt-5-2")

    @property
    def full_schema(self) -> str:
        return f"{self.CATALOG}.{self.SCHEMA}"


settings = Settings()
