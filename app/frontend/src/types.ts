export interface AnalysisSummary {
  analysis_id: string;
  group_name: string | null;
  owner: string | null;
  server_name: string;
  granularity: string;
  start_time: string;
  end_time: string;
  created_at: string;
  sku_name: string | null;
  sku_tier: string | null;
  vm_type: string | null;
  vcores: number | null;
  memory_gb: number | null;
  storage_size_gb: number | null;
  region: string | null;
  ai_analysis: string | null;
}

export interface MetricDataPoint {
  timestamp: string;
  average: number | null;
  maximum: number | null;
  minimum: number | null;
}

export interface MetricResponse {
  metric_name: string;
  display_name: string;
  data_points: number;
  data: MetricDataPoint[];
}

export interface UploadResponse {
  analysis_id: string;
  server_name: string;
  metrics_loaded: string[];
}

export interface CurrentUserResponse {
  user: string | null;
}

export interface BatchDeleteAnalysesResponse {
  deleted: number;
  analysis_ids: string[];
}
