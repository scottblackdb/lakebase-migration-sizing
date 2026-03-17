export interface AnalysisSummary {
  analysis_id: string;
  server_name: string;
  subscription_id: string;
  resource_group: string;
  granularity: string;
  start_time: string;
  end_time: string;
  created_at: string;
  sku_name: string | null;
  sku_tier: string | null;
  vm_type: string | null;
  vcores: number | null;
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
