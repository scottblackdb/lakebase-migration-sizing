import { useState, useMemo } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  IconButton,
  Typography,
  Box,
  TextField,
  Paper,
  Chip,
  FormControlLabel,
  Checkbox,
  Alert,
  Tooltip,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import StorageIcon from "@mui/icons-material/Storage";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ReferenceLine,
} from "recharts";
import type { MetricResponse } from "../types";
import { downsampleChartData } from "../lib/chartDownsample";
import { formatChartTimestamp } from "../lib/formatTimestamp";
import {
  LAKEBASE_CU_PER_CORE,
  LAKEBASE_HOURS_PER_MONTH,
  LAKEBASE_SCALE_TO_ZERO_THRESHOLD_CORES,
  LAKEBASE_ESTIMATE_DEFAULT_SAFETY_MARGIN_PCT,
  LAKEBASE_ESTIMATE_DEFAULT_SCALE_TO_ZERO,
  LAKEBASE_CU_HIGH_USAGE_THRESHOLD,
  LAKEBASE_100_PERCENT_UPTIME_DISCOUNT_PCT,
  LAKEBASE_BRANCHED_STORAGE_FRACTION,
  tryComputeLakebaseEstimateFromMetrics,
  type LakebaseEstimatePoint,
  LAKEBASE_CU_USD_PER_UNIT,
  lakebaseMonthlyCuCostUsd,
  lakebaseMonthlyCuCostUsdAfterUptimeDiscount,
  lakebaseStorageMonthlyCostUsd,
  lakebaseStorageUsdPerGb,
  lakebaseTotalMonthlyCostUsdAfterUptimeDiscount,
  effectiveStorageGbForLakebaseSizing,
} from "../lib/lakebaseEstimate";

/** Recharts series row: X-axis label + estimate point fields. */
function estimatePointsToChartData(points: LakebaseEstimatePoint[]) {
  const rows = points.map((p) => ({
    ...p,
    ts: formatChartTimestamp(p.timestamp),
  }));
  return downsampleChartData(rows);
}

interface Props {
  open: boolean;
  onClose: () => void;
  cpuMetric: MetricResponse;
  vcores: number;
  serverName: string;
  storageGb: number | null;
  skuName: string | null;
  granularity?: string | null;
}

export default function LakebaseEstimateModal({
  open,
  onClose,
  cpuMetric,
  vcores,
  serverName,
  storageGb,
  skuName,
  granularity = null,
}: Props) {
  const [safetyMarginPct, setSafetyMarginPct] = useState<number>(
    LAKEBASE_ESTIMATE_DEFAULT_SAFETY_MARGIN_PCT
  );
  const [scaleToZero, setScaleToZero] = useState<boolean>(
    LAKEBASE_ESTIMATE_DEFAULT_SCALE_TO_ZERO
  );
  const [isBranchedDatabase, setIsBranchedDatabase] = useState(false);

  const {
    displayData,
    peakCores,
    avgCores,
    safetyLineCores,
    monthlyCU,
    scaleToZeroPeriods,
    totalPeriods,
    usedPeakCuConstantSizing,
    peakPeriodLakebaseCU,
    periodsPerMonth,
    qualifiesFor100PercentUptimeDiscount,
    estimateError,
  } = useMemo(() => {
    const t = tryComputeLakebaseEstimateFromMetrics(
      [cpuMetric],
      vcores,
      { safetyMarginPct, scaleToZero, granularity }
    );
    if (!t.ok) {
      return {
        displayData: estimatePointsToChartData([]),
        peakCores: 0,
        avgCores: 0,
        safetyLineCores: 0,
        monthlyCU: 0,
        scaleToZeroPeriods: 0,
        totalPeriods: 0,
        usedPeakCuConstantSizing: false,
        peakPeriodLakebaseCU: 0,
        periodsPerMonth: 0,
        qualifiesFor100PercentUptimeDiscount: false,
        estimateError: t.error,
      };
    }
    const { points, metrics } = t.result;
    return {
      displayData: estimatePointsToChartData(points),
      peakCores: metrics.peakCores,
      avgCores: metrics.avgCores,
      safetyLineCores: metrics.safetyLineCores,
      monthlyCU: metrics.monthlyCU,
      scaleToZeroPeriods: metrics.scaleToZeroPeriods,
      totalPeriods: metrics.totalPeriods,
      usedPeakCuConstantSizing: metrics.usedPeakCuConstantSizing,
      peakPeriodLakebaseCU: metrics.peakPeriodLakebaseCU,
      periodsPerMonth: metrics.periodsPerMonth,
      qualifiesFor100PercentUptimeDiscount:
        metrics.qualifiesFor100PercentUptimeDiscount,
      estimateError: null as string | null,
    };
  }, [cpuMetric, vcores, safetyMarginPct, scaleToZero, granularity]);

  const storageForSizing = effectiveStorageGbForLakebaseSizing(
    storageGb,
    isBranchedDatabase
  );
  const cuCostMonthly = lakebaseMonthlyCuCostUsdAfterUptimeDiscount(
    monthlyCU,
    qualifiesFor100PercentUptimeDiscount
  );
  const storageCostMonthly = lakebaseStorageMonthlyCostUsd(
    storageForSizing,
    skuName
  );
  const totalMonthly = lakebaseTotalMonthlyCostUsdAfterUptimeDiscount(
    monthlyCU,
    storageForSizing,
    skuName,
    qualifiesFor100PercentUptimeDiscount
  );
  const storageRate = lakebaseStorageUsdPerGb(skuName);
  const computeBeforeDiscount = lakebaseMonthlyCuCostUsd(monthlyCU);
  const computeDiscountSavings =
    qualifiesFor100PercentUptimeDiscount
      ? computeBeforeDiscount - cuCostMonthly
      : 0;

  const formatMoney = (n: number) =>
    n.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      fullWidth
      PaperProps={{
        sx: (theme) => ({
          borderRadius: 2,
          maxWidth: theme.breakpoints.values.lg * 1.2,
          width: "100%",
        }),
      }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: "#1B3139",
          color: "#fff",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <StorageIcon sx={{ color: "#00A972" }} />
          <Typography variant="h6" fontWeight={600}>
            Lakebase Estimate
          </Typography>
        </Box>
        <IconButton onClick={onClose} sx={{ color: "#fff" }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ mt: 2, px: 3, pb: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2, flexWrap: "wrap" }}>
          <Chip label={serverName} size="small" />
          <Chip
            label={`${vcores} vCores`}
            size="small"
            variant="outlined"
          />
          {qualifiesFor100PercentUptimeDiscount && (
            <Tooltip
              title={`${LAKEBASE_100_PERCENT_UPTIME_DISCOUNT_PCT}% compute discount — no intervals qualify for scale to zero (100% uptime).`}
            >
              <Chip
                label="100% Uptime Discount"
                size="small"
                sx={{ backgroundColor: "#00A972", color: "#fff", fontWeight: 600 }}
              />
            </Tooltip>
          )}
        </Box>

        {estimateError && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {estimateError}
          </Alert>
        )}

        {/* Summary cards */}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gap: 2,
            mb: 3,
          }}
        >
          <Box>
            <Typography variant="overline" fontWeight={700} color="text.secondary" sx={{ mb: 0.5, display: "block", letterSpacing: 1 }}>
              Source VM
            </Typography>
            <Paper
              sx={{ p: 2, textAlign: "center", backgroundColor: "#F7F8FA" }}
              elevation={0}
            >
              <Typography variant="caption" color="text.secondary">
                Peak CPU Cores Used
              </Typography>
              <Typography variant="h5" fontWeight={700} color="#1B3139">
                {peakCores}
              </Typography>
            </Paper>
          </Box>
          <Box>
            <Typography variant="overline" fontWeight={700} color="text.secondary" sx={{ mb: 0.5, display: "block", letterSpacing: 1 }}>
              Baseline
            </Typography>
            <Paper
              sx={{ p: 2, textAlign: "center", backgroundColor: "#F7F8FA" }}
              elevation={0}
            >
              <Typography variant="caption" color="text.secondary">
                Avg CPU Cores Used
              </Typography>
              <Typography variant="h5" fontWeight={700} color="#1B3139">
                {avgCores}
              </Typography>
            </Paper>
          </Box>
          <Box>
            <Typography variant="overline" fontWeight={700} color="#00A972" sx={{ mb: 0.5, display: "block", letterSpacing: 1 }}>
              Lakebase Estimate
            </Typography>
            <Paper
              sx={{
                p: 2,
                textAlign: "center",
                backgroundColor: "#1B3139",
                color: "#fff",
              }}
              elevation={0}
            >
              <Typography variant="caption" sx={{ color: "#A0ACBE" }}>
                Est. Monthly CU
              </Typography>
              <Typography variant="h5" fontWeight={700} color="#00A972">
                {monthlyCU.toLocaleString()}
              </Typography>
            </Paper>
          </Box>
          <Box>
            <Typography variant="overline" fontWeight={700} color="#00A972" sx={{ mb: 0.5, display: "block", letterSpacing: 1 }}>
              Monthly CU Cost
              {qualifiesFor100PercentUptimeDiscount && (
                <Chip
                  label="100% Uptime Discount applied"
                  size="small"
                  sx={{
                    ml: 1,
                    height: 20,
                    fontSize: "0.65rem",
                    backgroundColor: "#00A972",
                    color: "#fff",
                    verticalAlign: "middle",
                  }}
                />
              )}
            </Typography>
            <Paper
              sx={{
                p: 2,
                textAlign: "center",
                backgroundColor: "#1B3139",
                color: "#fff",
              }}
              elevation={0}
            >
              <Typography variant="caption" sx={{ color: "#A0ACBE" }}>
                CU Cost Per Month
                {qualifiesFor100PercentUptimeDiscount &&
                  ` (${LAKEBASE_100_PERCENT_UPTIME_DISCOUNT_PCT}% off compute)`}
              </Typography>
              <Typography variant="h5" fontWeight={700} color="#00A972">
                ${formatMoney(cuCostMonthly)}
              </Typography>
              {qualifiesFor100PercentUptimeDiscount && (
                <Typography
                  variant="caption"
                  sx={{ color: "#A0ACBE", display: "block", mt: 0.5 }}
                >
                  Before discount: ${formatMoney(computeBeforeDiscount)}
                </Typography>
              )}
            </Paper>
          </Box>
          <Box>
            <Typography variant="overline" fontWeight={700} color="#00A972" sx={{ mb: 0.5, display: "block", letterSpacing: 1 }}>
              Storage Cost
            </Typography>
            <Paper
              sx={{
                p: 2,
                textAlign: "center",
                backgroundColor: "#1B3139",
                color: "#fff",
              }}
              elevation={0}
            >
              <Typography variant="caption" sx={{ color: "#A0ACBE" }}>
                {storageForSizing != null
                  ? isBranchedDatabase && storageGb != null
                    ? `${storageForSizing} GB (${LAKEBASE_BRANCHED_STORAGE_FRACTION * 100}% of ${storageGb} GB) x $${storageRate}/GB`
                    : `${storageForSizing} GB x $${storageRate}/GB`
                  : "Storage N/A"}
              </Typography>
              <Typography variant="h5" fontWeight={700} color="#00A972">
                {storageForSizing != null
                  ? `$${storageCostMonthly.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : "—"}
              </Typography>
            </Paper>
          </Box>
          <Box>
            <Typography variant="overline" fontWeight={700} color="#00A972" sx={{ mb: 0.5, display: "block", letterSpacing: 1 }}>
              Total Monthly
            </Typography>
            <Paper
              sx={{
                p: 2,
                textAlign: "center",
                backgroundColor: "#00A972",
                color: "#fff",
              }}
              elevation={0}
            >
              <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.8)" }}>
                CU + Storage
                {qualifiesFor100PercentUptimeDiscount &&
                  " (compute discounted)"}
              </Typography>
              <Typography variant="h5" fontWeight={700}>
                ${formatMoney(totalMonthly)}
              </Typography>
            </Paper>
          </Box>
          <Box>
            <Typography variant="overline" fontWeight={700} color="text.secondary" sx={{ mb: 0.5, display: "block", letterSpacing: 1 }}>
              Scale to Zero
            </Typography>
            <Paper
              sx={{ p: 2, textAlign: "center", backgroundColor: "#F7F8FA" }}
              elevation={0}
            >
              <Typography variant="caption" color="text.secondary">
                Idle Periods ({"\u2264"} {LAKEBASE_SCALE_TO_ZERO_THRESHOLD_CORES} cores)
              </Typography>
              <Typography variant="h5" fontWeight={700} color={scaleToZero && !usedPeakCuConstantSizing ? "#00A972" : "#1B3139"}>
                {usedPeakCuConstantSizing
                  ? "N/A"
                  : scaleToZero
                    ? `${scaleToZeroPeriods} / ${totalPeriods}`
                    : "Off"}
              </Typography>
              {usedPeakCuConstantSizing ? (
                <Typography variant="caption" color="text.secondary">
                  Not used (≥{LAKEBASE_CU_HIGH_USAGE_THRESHOLD} CU interval)
                </Typography>
              ) : (
                scaleToZero &&
                totalPeriods > 0 && (
                  <Typography variant="caption" color="text.secondary">
                    {Math.round((scaleToZeroPeriods / totalPeriods) * 100)}% idle
                  </Typography>
                )
              )}
            </Paper>
          </Box>
        </Box>

        {/* Safety margin & scale-to-zero inputs */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2, flexWrap: "wrap" }}>
          <TextField
            label="Safety Margin %"
            type="number"
            size="small"
            value={safetyMarginPct}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!isNaN(v) && v >= 0 && v <= 200) setSafetyMarginPct(v);
            }}
            slotProps={{ htmlInput: { min: 0, max: 200, step: 5 } }}
            sx={{ width: 160 }}
          />
          <Tooltip
            title={
              usedPeakCuConstantSizing
                ? `Disabled — an interval needs ${LAKEBASE_CU_HIGH_USAGE_THRESHOLD}+ CUs; scale to zero cannot apply.`
                : ""
            }
          >
            <FormControlLabel
              control={
                <Checkbox
                  checked={scaleToZero}
                  disabled={usedPeakCuConstantSizing}
                  onChange={(e) => setScaleToZero(e.target.checked)}
                  sx={{ color: "#00A972", "&.Mui-checked": { color: "#00A972" } }}
                />
              }
              label={
                <Typography variant="body2">
                  Scale to Zero ({"\u2264"} {LAKEBASE_SCALE_TO_ZERO_THRESHOLD_CORES} cores = 0 CU)
                  {usedPeakCuConstantSizing ? " — overridden" : ""}
                </Typography>
              }
            />
          </Tooltip>
          <Tooltip title={`Branched DB: storage $/mo uses ${LAKEBASE_BRANCHED_STORAGE_FRACTION * 100}% of reported GB`}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={isBranchedDatabase}
                  onChange={(e) => setIsBranchedDatabase(e.target.checked)}
                  sx={{ color: "#00A972", "&.Mui-checked": { color: "#00A972" } }}
                />
              }
              label={<Typography variant="body2">Branched database</Typography>}
            />
          </Tooltip>
          <Typography variant="body2" color="text.secondary">
            Applied on top of peak CPU cores per period.
          </Typography>
        </Box>

        {usedPeakCuConstantSizing && (
          <Alert severity="info" sx={{ mb: 2 }}>
            At least one interval needs {LAKEBASE_CU_HIGH_USAGE_THRESHOLD}+ Lakebase CUs (with your
            safety margin). Scale to zero is ignored for this estimate. Monthly CU uses the{" "}
            <strong>peak</strong> interval CU ({peakPeriodLakebaseCU}) ×{" "}
            {periodsPerMonth.toLocaleString(undefined, { maximumFractionDigits: 1 })} intervals per
            month (constant sizing).
          </Alert>
        )}

        {/* Chart */}
        <Paper sx={{ p: 2 }} elevation={1}>
          <Typography
            variant="subtitle2"
            fontWeight={700}
            gutterBottom
          >
            CPU Cores Used &amp; Lakebase CU Required
          </Typography>
          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart data={displayData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#C4CCD6" />
              <XAxis
                dataKey="ts"
                tick={{ fontSize: 11, fill: "#A0ACBE" }}
                interval="preserveStartEnd"
                stroke="#C4CCD6"
              />
              <YAxis
                yAxisId="cores"
                domain={[0, vcores * 1.1]}
                tick={{ fontSize: 11, fill: "#A0ACBE" }}
                stroke="#C4CCD6"
                label={{
                  value: "CPU Cores",
                  angle: -90,
                  position: "insideLeft",
                  style: { fontSize: 12, fill: "#A0ACBE" },
                }}
              />
              <YAxis
                yAxisId="cu"
                orientation="right"
                tick={{ fontSize: 11, fill: "#00A972" }}
                stroke="#00A972"
                label={{
                  value: "Lakebase CU",
                  angle: 90,
                  position: "insideRight",
                  style: { fontSize: 12, fill: "#00A972" },
                }}
              />
              <Tooltip
                contentStyle={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 13,
                  borderRadius: 6,
                  border: "1px solid #C4CCD6",
                }}
                formatter={(value: number, name: string) => {
                  const labels: Record<string, string> = {
                    coresUsedAvg: "Avg Cores Used",
                    coresUsedMax: "Peak Cores Used",
                    lakebaseCU: "Lakebase CU Required",
                  };
                  return [value?.toFixed(2), labels[name] || name];
                }}
              />
              <Legend
                formatter={(value: string) => {
                  const labels: Record<string, string> = {
                    coresUsedAvg: "Avg Cores Used",
                    coresUsedMax: "Peak Cores Used",
                    lakebaseCU: `Lakebase CU (+${safetyMarginPct}% margin)`,
                  };
                  return labels[value] || value;
                }}
              />
              <Area
                type="monotone"
                dataKey="coresUsedAvg"
                yAxisId="cores"
                fill="#143D4A"
                fillOpacity={0.5}
                stroke="#143D4A"
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="coresUsedMax"
                yAxisId="cores"
                stroke="#FCBA33"
                dot={false}
                strokeWidth={1.5}
                strokeDasharray="4 2"
              />
              <Line
                type="monotone"
                dataKey="lakebaseCU"
                yAxisId="cu"
                stroke="#00A972"
                dot={false}
                strokeWidth={2.5}
              />
              <ReferenceLine
                yAxisId="cores"
                y={peakCores}
                stroke="#FCBA33"
                strokeWidth={1}
                strokeDasharray="4 3"
                label={{
                  value: `Peak ${peakCores} cores`,
                  position: "right",
                  fill: "#FCBA33",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              />
              <ReferenceLine
                yAxisId="cores"
                y={vcores}
                stroke="#FF5F46"
                strokeWidth={1.5}
                strokeDasharray="6 3"
                label={{
                  value: `${vcores} VM vCores`,
                  position: "right",
                  fill: "#FF5F46",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </Paper>

        {/* Calculation breakdown */}
        <Paper
          sx={{ p: 2, mt: 2, backgroundColor: "#F7F8FA" }}
          elevation={0}
        >
          <Typography variant="subtitle2" fontWeight={700} gutterBottom>
            Calculation Breakdown
          </Typography>
          <Typography variant="body2" sx={{ fontFamily: "'DM Mono', monospace", fontSize: "0.8rem", lineHeight: 2 }}>
            Per-period CU = peak cores used x (1 + {safetyMarginPct}%) x {LAKEBASE_CU_PER_CORE} CU/core
            <br />
            Peak CPU cores (overall) = {peakCores} cores (max CPU% x {vcores} vCores)
            <br />
            Peak with safety margin = {peakCores} x (1 + {safetyMarginPct}%) = {safetyLineCores} cores
            <br />
            {usedPeakCuConstantSizing ? (
              <>
                Any interval ≥ {LAKEBASE_CU_HIGH_USAGE_THRESHOLD} CU → scale to zero disabled; peak interval
                CU = {peakPeriodLakebaseCU} × {periodsPerMonth.toLocaleString(undefined, { maximumFractionDigits: 1 })}{" "}
                intervals/mo ≈ <strong>{monthlyCU.toLocaleString()} CU/month</strong>
              </>
            ) : (
              <>
                Avg CU/period projected over {LAKEBASE_HOURS_PER_MONTH} hrs/month ={" "}
                <strong>{monthlyCU.toLocaleString()} CU/month</strong>
              </>
            )}
            {!estimateError && (
              <>
                <br />
                Compute $/mo = {monthlyCU.toLocaleString()} CU × ${LAKEBASE_CU_USD_PER_UNIT}/CU ={" "}
                <strong>${formatMoney(computeBeforeDiscount)}</strong>
                {qualifiesFor100PercentUptimeDiscount && (
                  <>
                    <br />
                    <strong>100% Uptime Discount</strong> (
                    {LAKEBASE_100_PERCENT_UPTIME_DISCOUNT_PCT}% off compute only): −$
                    {formatMoney(computeDiscountSavings)} →{" "}
                    <strong>${formatMoney(cuCostMonthly)}/mo</strong> compute
                    <br />
                    <Typography
                      component="span"
                      variant="caption"
                      color="text.secondary"
                    >
                      Applied because scale-to-zero is off or no intervals qualify for 0 CU
                      (100% uptime workload).
                    </Typography>
                  </>
                )}
                <br />
                Storage $/mo ={" "}
                {storageForSizing != null ? (
                  <strong>${formatMoney(storageCostMonthly)}</strong>
                ) : (
                  "—"
                )}{" "}
                (not discounted)
                <br />
                Total $/mo = ${formatMoney(cuCostMonthly)} compute
                {storageForSizing != null
                  ? ` + $${formatMoney(storageCostMonthly)} storage`
                  : ""}{" "}
                = <strong>${formatMoney(totalMonthly)}</strong>
              </>
            )}
          </Typography>
        </Paper>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} variant="outlined">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
