from pydantic import BaseModel


class AnalysisSummary(BaseModel):
    analysis_id: str
    server_name: str
    subscription_id: str
    resource_group: str
    granularity: str
    start_time: str
    end_time: str
    created_at: str
    sku_name: str | None = None
    sku_tier: str | None = None
    vm_type: str | None = None
    vcores: int | None = None
    storage_size_gb: int | None = None
    region: str | None = None
    ai_analysis: str | None = None


class MetricDataPoint(BaseModel):
    timestamp: str
    average: float | None
    maximum: float | None
    minimum: float | None


class MetricResponse(BaseModel):
    metric_name: str
    display_name: str
    data_points: int
    data: list[MetricDataPoint]


class UploadResponse(BaseModel):
    analysis_id: str
    server_name: str
    metrics_loaded: list[str]


class AiAnalysisResponse(BaseModel):
    analysis_id: str
    ai_analysis: str
