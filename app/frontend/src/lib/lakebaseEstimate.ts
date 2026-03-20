/**
 * Lakebase CU / cost estimation from CPU utilization samples.
 * Data-only — no chart formatting or downsampling; callers own UI/chart prep.
 */
import type { MetricDataPoint, MetricResponse } from "../types";

/** Matches single-server Lakebase estimate dialog defaults. */
export const LAKEBASE_ESTIMATE_DEFAULT_SAFETY_MARGIN_PCT = 15;

/** "Scale to zero" when idle — same checkbox as individual server estimate. */
export const LAKEBASE_ESTIMATE_DEFAULT_SCALE_TO_ZERO = true;

/** Lakebase compute units per physical core used in the estimate formula. */
export const LAKEBASE_CU_PER_CORE = 4;

/** Cores below this (when scale-to-zero is on) map to 0 CU for that period. */
export const LAKEBASE_SCALE_TO_ZERO_THRESHOLD_CORES = 0.3;

/** Hours per month used to project sampled periods to monthly CU. */
export const LAKEBASE_HOURS_PER_MONTH = 730;

/** USD per Lakebase CU-month (placeholder — align with your pricing sheet). */
export const LAKEBASE_CU_USD_PER_UNIT = 0.111;

/** Storage $/GB-month when SKU looks like AWS RDS (db.*). */
export const LAKEBASE_STORAGE_USD_PER_GB_AWS = 0.345;

/** Storage $/GB-month default (e.g. Azure / other). */
export const LAKEBASE_STORAGE_USD_PER_GB_DEFAULT = 0.39;

export function isAwsSku(skuName: string | null | undefined): boolean {
  return skuName != null && skuName.startsWith("db.");
}

export function lakebaseStorageUsdPerGb(
  skuName: string | null | undefined
): number {
  return isAwsSku(skuName)
    ? LAKEBASE_STORAGE_USD_PER_GB_AWS
    : LAKEBASE_STORAGE_USD_PER_GB_DEFAULT;
}

export interface LakebaseEstimateOptions {
  safetyMarginPct: number;
  scaleToZero: boolean;
}

/** One time-aligned row after CPU% → cores and CU math. */
export interface LakebaseEstimatePoint {
  timestamp: string;
  coresUsedAvg: number | null;
  coresUsedMax: number | null;
  lakebaseCU: number | null;
}

/** Rolled-up numbers for summaries and copy. */
export interface LakebaseEstimateMetrics {
  peakCores: number;
  avgCores: number;
  safetyLineCores: number;
  monthlyCU: number;
  scaleToZeroPeriods: number;
  totalPeriods: number;
  intervalHours: number;
  periodsPerMonth: number;
  avgCUPerPeriod: number;
}

export interface LakebaseEstimateResult {
  points: LakebaseEstimatePoint[];
  metrics: LakebaseEstimateMetrics;
}

/**
 * Build per-period points and aggregate metrics from CPU % samples and vCore count.
 */
export function computeLakebaseEstimate(
  cpuData: MetricDataPoint[],
  vcores: number,
  options: LakebaseEstimateOptions
): LakebaseEstimateResult {
  const { safetyMarginPct, scaleToZero } = options;
  const margin = safetyMarginPct / 100;
  const threshold = LAKEBASE_SCALE_TO_ZERO_THRESHOLD_CORES;

  let totalCores = 0;
  let count = 0;
  let peak = 0;

  const points: LakebaseEstimatePoint[] = cpuData.map((d) => {
    const avgUsed =
      d.average != null ? (d.average / 100) * vcores : null;
    const maxUsed =
      d.maximum != null ? (d.maximum / 100) * vcores : null;

    if (avgUsed != null) {
      totalCores += avgUsed;
      count++;
    }
    if (maxUsed != null && maxUsed > peak) {
      peak = maxUsed;
    }

    const isIdle =
      scaleToZero && maxUsed != null && maxUsed < threshold;
    const cuRequired =
      maxUsed != null
        ? isIdle
          ? 0
          : Math.ceil(maxUsed * (1 + margin) * LAKEBASE_CU_PER_CORE)
        : null;

    return {
      timestamp: d.timestamp,
      coresUsedAvg:
        avgUsed != null ? Math.round(avgUsed * 100) / 100 : null,
      coresUsedMax:
        maxUsed != null ? Math.round(maxUsed * 100) / 100 : null,
      lakebaseCU: cuRequired,
    };
  });

  const avg = count > 0 ? totalCores / count : 0;
  const safetyCores = peak * (1 + margin);

  let totalCU = 0;
  let cuCount = 0;
  let s2zPeriods = 0;
  for (const p of points) {
    if (p.lakebaseCU != null) {
      totalCU += p.lakebaseCU;
      cuCount++;
      if (p.lakebaseCU === 0 && scaleToZero) {
        s2zPeriods++;
      }
    }
  }

  const avgCUPerPeriod = cuCount > 0 ? totalCU / cuCount : 0;

  let intervalHours = 1;
  if (cpuData.length >= 2) {
    const firstTs = new Date(cpuData[0].timestamp).getTime();
    const lastTs = new Date(cpuData[cpuData.length - 1].timestamp).getTime();
    intervalHours =
      (lastTs - firstTs) / (cpuData.length - 1) / 3600000;
  }

  const periodsPerMonth = LAKEBASE_HOURS_PER_MONTH / intervalHours;
  const monthlyCU = Math.round(avgCUPerPeriod * periodsPerMonth);

  const metrics: LakebaseEstimateMetrics = {
    peakCores: Math.round(peak * 100) / 100,
    avgCores: Math.round(avg * 100) / 100,
    safetyLineCores: Math.round(safetyCores * 100) / 100,
    monthlyCU,
    scaleToZeroPeriods: s2zPeriods,
    totalPeriods: cuCount,
    intervalHours,
    periodsPerMonth,
    avgCUPerPeriod,
  };

  return { points, metrics };
}

/**
 * Same inputs as the individual analysis view: full metrics list, vCores, and
 * {@link LakebaseEstimateOptions} (safety margin + scaleToZero / "autoscale when idle").
 */
export function tryComputeLakebaseEstimateFromMetrics(
  allMetrics: MetricResponse[],
  vcores: number | null | undefined,
  options: LakebaseEstimateOptions
):
  | { ok: true; result: LakebaseEstimateResult; cpuMetric: MetricResponse }
  | { ok: false; error: string } {
  if (vcores == null || vcores <= 0) {
    return { ok: false, error: "vCores missing or invalid" };
  }
  const cpu = allMetrics.find((m) => m.metric_name === "cpu_percent");
  if (!cpu || cpu.data_points === 0) {
    return { ok: false, error: "No CPU percent metric data" };
  }
  const result = computeLakebaseEstimate(cpu.data, vcores, options);
  return { ok: true, result, cpuMetric: cpu };
}

export function lakebaseMonthlyCuCostUsd(monthlyCU: number): number {
  return monthlyCU * LAKEBASE_CU_USD_PER_UNIT;
}

export function lakebaseStorageMonthlyCostUsd(
  storageGb: number | null | undefined,
  skuName: string | null | undefined
): number {
  if (storageGb == null) return 0;
  return storageGb * lakebaseStorageUsdPerGb(skuName);
}

export function lakebaseTotalMonthlyCostUsd(
  monthlyCU: number,
  storageGb: number | null | undefined,
  skuName: string | null | undefined
): number {
  return (
    lakebaseMonthlyCuCostUsd(monthlyCU) +
    lakebaseStorageMonthlyCostUsd(storageGb, skuName)
  );
}
