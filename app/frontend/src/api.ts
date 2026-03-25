import type {
  AnalysisSummary,
  BatchDeleteAnalysesResponse,
  CurrentUserResponse,
  MetricResponse,
  UploadResponse,
} from "./types";

/** Resolves /api paths when the SPA uses a non-root Vite `base` (e.g. Databricks Apps). */
function apiUrl(path: string): string {
  const p = path.replace(/^\//, "");
  const base = import.meta.env.BASE_URL ?? "/";
  const segment = `api/${p}`;
  if (base === "/" || base === "./") return `/${segment}`;
  return `${String(base).replace(/\/$/, "")}/${segment}`;
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), init);
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const err = (await res.json()) as { detail?: string | unknown };
      if (err.detail != null) {
        message =
          typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail);
      }
    } catch {
      /* non-JSON body */
    }
    throw new Error(message);
  }
  return res.json();
}

export async function fetchCurrentUser(): Promise<CurrentUserResponse> {
  return apiJson<CurrentUserResponse>("me");
}

export async function fetchAnalyses(): Promise<AnalysisSummary[]> {
  return apiJson<AnalysisSummary[]>("analyses");
}

export async function batchDeleteAnalyses(
  analysisIds: string[]
): Promise<BatchDeleteAnalysesResponse> {
  return apiJson<BatchDeleteAnalysesResponse>("analyses/batch-delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ analysis_ids: analysisIds }),
  });
}

export async function fetchGroupNames(): Promise<string[]> {
  return apiJson<string[]>("analyses/groups");
}

export async function updateAnalysisGroup(
  analysisId: string,
  groupName: string
): Promise<AnalysisSummary> {
  return apiJson<AnalysisSummary>(`analyses/${analysisId}/group`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ group_name: groupName.trim() }),
  });
}

export async function fetchAnalysis(id: string): Promise<AnalysisSummary> {
  return apiJson<AnalysisSummary>(`analyses/${id}`);
}

export async function fetchAllMetrics(id: string): Promise<MetricResponse[]> {
  return apiJson<MetricResponse[]>(`analyses/${id}/metrics`);
}

export async function uploadFile(
  file: File,
  groupName: string
): Promise<UploadResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("group_name", groupName);
  return apiJson<UploadResponse>("upload", { method: "POST", body: form });
}

export async function generateAiAnalysis(
  id: string
): Promise<{ analysis_id: string; ai_analysis: string }> {
  return apiJson<{ analysis_id: string; ai_analysis: string }>(
    `analyses/${id}/ai-analysis`,
    { method: "POST" }
  );
}
