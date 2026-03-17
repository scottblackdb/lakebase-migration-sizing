import type { AnalysisSummary, MetricResponse, UploadResponse } from "./types";

export async function fetchAnalyses(): Promise<AnalysisSummary[]> {
  const res = await fetch("/api/analyses");
  if (!res.ok) throw new Error("Failed to fetch analyses");
  return res.json();
}

export async function fetchGroupNames(): Promise<string[]> {
  const res = await fetch("/api/analyses/groups");
  if (!res.ok) throw new Error("Failed to fetch groups");
  return res.json();
}

export async function fetchAnalysis(id: string): Promise<AnalysisSummary> {
  const res = await fetch(`/api/analyses/${id}`);
  if (!res.ok) throw new Error("Analysis not found");
  return res.json();
}

export async function fetchAllMetrics(id: string): Promise<MetricResponse[]> {
  const res = await fetch(`/api/analyses/${id}/metrics`);
  if (!res.ok) throw new Error("Failed to fetch metrics");
  return res.json();
}

export async function uploadFile(
  file: File,
  groupName: string
): Promise<UploadResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("group_name", groupName);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Upload failed");
  }
  return res.json();
}

export async function generateAiAnalysis(
  id: string
): Promise<{ analysis_id: string; ai_analysis: string }> {
  const res = await fetch(`/api/analyses/${id}/ai-analysis`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "AI analysis failed");
  }
  return res.json();
}
