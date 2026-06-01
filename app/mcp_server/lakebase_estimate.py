"""
Lakebase CU / cost estimation (Python port of app/frontend/src/lib/lakebaseEstimate.ts).
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime
from typing import Any

LAKEBASE_CU_PER_CORE = 4
LAKEBASE_CU_HIGH_USAGE_THRESHOLD = 32
LAKEBASE_SCALE_TO_ZERO_THRESHOLD_CORES = 0.3
LAKEBASE_HOURS_PER_MONTH = 730
LAKEBASE_CU_USD_PER_UNIT = 0.111
LAKEBASE_100_PERCENT_UPTIME_DISCOUNT_PCT = 25
LAKEBASE_STORAGE_USD_PER_GB_AWS = 0.345
LAKEBASE_STORAGE_USD_PER_GB_DEFAULT = 0.39
LAKEBASE_BRANCHED_STORAGE_FRACTION = 0.1


def is_aws_sku(sku_name: str | None) -> bool:
    return sku_name is not None and sku_name.startswith("db.")


def lakebase_storage_usd_per_gb(sku_name: str | None) -> float:
    return (
        LAKEBASE_STORAGE_USD_PER_GB_AWS
        if is_aws_sku(sku_name)
        else LAKEBASE_STORAGE_USD_PER_GB_DEFAULT
    )


@dataclass
class MetricDataPoint:
    timestamp: str
    average: float | None
    maximum: float | None
    minimum: float | None


@dataclass
class LakebaseEstimatePoint:
    timestamp: str
    cores_used_avg: float | None
    cores_used_max: float | None
    lakebase_cu: int | None


@dataclass
class LakebaseEstimateMetrics:
    peak_cores: float
    avg_cores: float
    safety_line_cores: float
    monthly_cu: int
    scale_to_zero_periods: int
    total_periods: int
    interval_hours: float
    periods_per_month: float
    avg_cu_per_period: float
    used_peak_cu_constant_sizing: bool
    peak_period_lakebase_cu: int
    qualifies_for_100_percent_uptime_discount: bool


@dataclass
class LakebaseEstimateResult:
    points: list[LakebaseEstimatePoint]
    metrics: LakebaseEstimateMetrics


def compute_lakebase_estimate(
    cpu_data: list[MetricDataPoint],
    vcores: int,
    safety_margin_pct: float,
    scale_to_zero: bool,
) -> LakebaseEstimateResult:
    margin = safety_margin_pct / 100.0
    idle_threshold = LAKEBASE_SCALE_TO_ZERO_THRESHOLD_CORES

    any_period_requires_high_cu = False
    for d in cpu_data:
        if d.maximum is None:
            continue
        max_used = (d.maximum / 100.0) * vcores
        cu = int(math.ceil(max_used * (1 + margin) * LAKEBASE_CU_PER_CORE))
        if cu >= LAKEBASE_CU_HIGH_USAGE_THRESHOLD:
            any_period_requires_high_cu = True
            break

    effective_scale_to_zero = False if any_period_requires_high_cu else scale_to_zero

    total_cores = 0.0
    count = 0
    peak = 0.0
    points: list[LakebaseEstimatePoint] = []

    for d in cpu_data:
        avg_used = (d.average / 100.0) * vcores if d.average is not None else None
        max_used = (d.maximum / 100.0) * vcores if d.maximum is not None else None

        if avg_used is not None:
            total_cores += avg_used
            count += 1
        if max_used is not None and max_used > peak:
            peak = max_used

        is_idle = (
            effective_scale_to_zero
            and max_used is not None
            and max_used < idle_threshold
        )
        if max_used is not None:
            cu_required = (
                0
                if is_idle
                else int(math.ceil(max_used * (1 + margin) * LAKEBASE_CU_PER_CORE))
            )
        else:
            cu_required = None

        points.append(
            LakebaseEstimatePoint(
                timestamp=d.timestamp,
                cores_used_avg=round(avg_used, 2) if avg_used is not None else None,
                cores_used_max=round(max_used, 2) if max_used is not None else None,
                lakebase_cu=cu_required,
            )
        )

    avg = total_cores / count if count > 0 else 0.0
    safety_cores = peak * (1 + margin)

    total_cu = 0
    cu_count = 0
    s2z_periods = 0
    for p in points:
        if p.lakebase_cu is not None:
            total_cu += p.lakebase_cu
            cu_count += 1
            if p.lakebase_cu == 0 and effective_scale_to_zero:
                s2z_periods += 1

    finite_cus = [p.lakebase_cu for p in points if p.lakebase_cu is not None]
    peak_period_lakebase_cu = max(finite_cus) if finite_cus else 0

    interval_hours = 1.0
    if len(cpu_data) >= 2:

        def _ts_to_epoch(ts: str) -> float:
            t = ts.strip()
            if t.endswith("Z"):
                t = t[:-1] + "+00:00"
            try:
                return datetime.fromisoformat(t).timestamp()
            except ValueError:
                return datetime.fromisoformat(t + "+00:00").timestamp()

        first_ts = _ts_to_epoch(cpu_data[0].timestamp)
        last_ts = _ts_to_epoch(cpu_data[-1].timestamp)
        interval_hours = (last_ts - first_ts) / (len(cpu_data) - 1) / 3600.0

    periods_per_month = LAKEBASE_HOURS_PER_MONTH / interval_hours

    if any_period_requires_high_cu:
        avg_cu_per_period = float(peak_period_lakebase_cu)
        monthly_cu = int(round(peak_period_lakebase_cu * periods_per_month))
    else:
        avg_cu_per_period = total_cu / cu_count if cu_count > 0 else 0.0
        monthly_cu = int(round(avg_cu_per_period * periods_per_month))

    metrics = LakebaseEstimateMetrics(
        peak_cores=round(peak, 2),
        avg_cores=round(avg, 2),
        safety_line_cores=round(safety_cores, 2),
        monthly_cu=monthly_cu,
        scale_to_zero_periods=s2z_periods,
        total_periods=cu_count,
        interval_hours=interval_hours,
        periods_per_month=periods_per_month,
        avg_cu_per_period=avg_cu_per_period,
        used_peak_cu_constant_sizing=any_period_requires_high_cu,
        peak_period_lakebase_cu=peak_period_lakebase_cu,
        qualifies_for_100_percent_uptime_discount=qualifies_for_100_percent_uptime_discount(
            scale_to_zero, s2z_periods
        ),
    )

    return LakebaseEstimateResult(points=points, metrics=metrics)


def qualifies_for_100_percent_uptime_discount(
    scale_to_zero_requested: bool, scale_to_zero_periods: int
) -> bool:
    return not scale_to_zero_requested or scale_to_zero_periods == 0


def apply_100_percent_uptime_discount_usd(amount_usd: float) -> float:
    return amount_usd * (1 - LAKEBASE_100_PERCENT_UPTIME_DISCOUNT_PCT / 100.0)


def monthly_cu_cost_usd(monthly_cu: int) -> float:
    return monthly_cu * LAKEBASE_CU_USD_PER_UNIT


def monthly_cu_cost_usd_after_uptime_discount(
    monthly_cu: int, qualifies_for_discount: bool
) -> float:
    base = monthly_cu_cost_usd(monthly_cu)
    return (
        apply_100_percent_uptime_discount_usd(base)
        if qualifies_for_discount
        else base
    )


def storage_monthly_cost_usd(storage_gb: int | None, sku_name: str | None) -> float:
    if storage_gb is None:
        return 0.0
    return storage_gb * lakebase_storage_usd_per_gb(sku_name)


def effective_storage_gb_for_lakebase_sizing(
    storage_gb: int | None, is_branched_database: bool
) -> int | None:
    if storage_gb is None:
        return None
    if not is_branched_database:
        return storage_gb
    return max(0, int(round(storage_gb * LAKEBASE_BRANCHED_STORAGE_FRACTION)))


def total_monthly_cost_usd(
    monthly_cu: int, storage_gb: int | None, sku_name: str | None
) -> float:
    return monthly_cu_cost_usd(monthly_cu) + storage_monthly_cost_usd(
        storage_gb, sku_name
    )


def total_monthly_cost_usd_after_uptime_discount(
    monthly_cu: int,
    storage_gb: int | None,
    sku_name: str | None,
    qualifies_for_discount: bool,
) -> float:
    return monthly_cu_cost_usd_after_uptime_discount(
        monthly_cu, qualifies_for_discount
    ) + storage_monthly_cost_usd(storage_gb, sku_name)


def metrics_rows_to_cpu_points(rows: list[dict[str, Any]]) -> list[MetricDataPoint]:
    out: list[MetricDataPoint] = []
    for r in rows:
        out.append(
            MetricDataPoint(
                timestamp=str(r["timestamp"]),
                average=r.get("average"),
                maximum=r.get("maximum"),
                minimum=r.get("minimum"),
            )
        )
    return out
