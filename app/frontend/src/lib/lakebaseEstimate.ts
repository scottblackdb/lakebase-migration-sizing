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

/**
 * If any interval’s required CU (from peak CPU% × vCores, with safety margin)
 * reaches this level, scale-to-zero is not applied and monthly CU uses the
 * **peak** interval CU × periods/month (provisioned-style sizing).
 */
export const LAKEBASE_CU_HIGH_USAGE_THRESHOLD = 32;

/** Cores below this (when scale-to-zero is on) map to 0 CU for that period. */
export const LAKEBASE_SCALE_TO_ZERO_THRESHOLD_CORES = 0.3;

/** Hours per month used to project sampled periods to monthly CU. */
export const LAKEBASE_HOURS_PER_MONTH = 730;

/** USD per Lakebase CU-month (placeholder — align with your pricing sheet). */
export const LAKEBASE_CU_USD_PER_UNIT = 0.111;

/** Compute discount when scale-to-zero does not reduce any interval (100% uptime). */
export const LAKEBASE_100_PERCENT_UPTIME_DISCOUNT_PCT = 25;

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
  /** True when any interval hit {@link LAKEBASE_CU_HIGH_USAGE_THRESHOLD}+ CUs; S2Z ignored; monthly from peak interval CU. */
  usedPeakCuConstantSizing: boolean;
  /** Largest per-interval Lakebase CU in the final model (after rules). */
  peakPeriodLakebaseCU: number;
  /** True when scale-to-zero is off or no intervals qualify for 0 CU. */
  qualifiesFor100PercentUptimeDiscount: boolean;
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
  const idleThresholdCores = LAKEBASE_SCALE_TO_ZERO_THRESHOLD_CORES;

  const anyPeriodRequiresHighCu = cpuData.some((d) => {
    if (d.maximum == null) return false;
    const maxUsed = (d.maximum / 100) * vcores;
    const cu = Math.ceil(maxUsed * (1 + margin) * LAKEBASE_CU_PER_CORE);
    return cu >= LAKEBASE_CU_HIGH_USAGE_THRESHOLD;
  });

  const effectiveScaleToZero = anyPeriodRequiresHighCu ? false : scaleToZero;

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
      effectiveScaleToZero && maxUsed != null && maxUsed < idleThresholdCores;
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
      if (p.lakebaseCU === 0 && effectiveScaleToZero) {
        s2zPeriods++;
      }
    }
  }

  const finiteCUs = points
    .map((p) => p.lakebaseCU)
    .filter((c): c is number => c != null);
  const peakPeriodLakebaseCU =
    finiteCUs.length > 0 ? Math.max(...finiteCUs) : 0;

  let intervalHours = 1;
  if (cpuData.length >= 2) {
    const firstTs = new Date(cpuData[0].timestamp).getTime();
    const lastTs = new Date(cpuData[cpuData.length - 1].timestamp).getTime();
    intervalHours =
      (lastTs - firstTs) / (cpuData.length - 1) / 3600000;
  }

  const periodsPerMonth = LAKEBASE_HOURS_PER_MONTH / intervalHours;

  let monthlyCU: number;
  let avgCUPerPeriod: number;
  if (anyPeriodRequiresHighCu) {
    avgCUPerPeriod = peakPeriodLakebaseCU;
    monthlyCU = Math.round(peakPeriodLakebaseCU * periodsPerMonth);
  } else {
    avgCUPerPeriod = cuCount > 0 ? totalCU / cuCount : 0;
    monthlyCU = Math.round(avgCUPerPeriod * periodsPerMonth);
  }

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
    usedPeakCuConstantSizing: anyPeriodRequiresHighCu,
    peakPeriodLakebaseCU,
    qualifiesFor100PercentUptimeDiscount:
      qualifiesFor100PercentUptimeDiscount(scaleToZero, s2zPeriods),
  };

  return { points, metrics };
}

/** When scale-to-zero is unchecked or no intervals map to 0 CU. */
export function qualifiesFor100PercentUptimeDiscount(
  scaleToZeroRequested: boolean,
  scaleToZeroPeriods: number
): boolean {
  return !scaleToZeroRequested || scaleToZeroPeriods === 0;
}

export function apply100PercentUptimeDiscountUsd(amountUsd: number): number {
  return amountUsd * (1 - LAKEBASE_100_PERCENT_UPTIME_DISCOUNT_PCT / 100);
}

export function lakebaseMonthlyCuCostUsdAfterUptimeDiscount(
  monthlyCU: number,
  qualifiesForDiscount: boolean
): number {
  const base = lakebaseMonthlyCuCostUsd(monthlyCU);
  return qualifiesForDiscount
    ? apply100PercentUptimeDiscountUsd(base)
    : base;
}

export function lakebaseTotalMonthlyCostUsdAfterUptimeDiscount(
  monthlyCU: number,
  storageGb: number | null | undefined,
  skuName: string | null | undefined,
  qualifiesForDiscount: boolean
): number {
  return (
    lakebaseMonthlyCuCostUsdAfterUptimeDiscount(monthlyCU, qualifiesForDiscount) +
    lakebaseStorageMonthlyCostUsd(storageGb, skuName)
  );
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

/** For branched Lakebase databases, sizing uses this fraction of reported storage. */
export const LAKEBASE_BRANCHED_STORAGE_FRACTION = 0.1;

/**
 * Storage GB used for Lakebase storage $/mo (branched DBs count only a fraction of reported size).
 */
export function effectiveStorageGbForLakebaseSizing(
  storageGb: number | null | undefined,
  isBranchedDatabase: boolean
): number | null {
  if (storageGb == null) return null;
  if (!isBranchedDatabase) return storageGb;
  return Math.max(0, storageGb * LAKEBASE_BRANCHED_STORAGE_FRACTION);
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
