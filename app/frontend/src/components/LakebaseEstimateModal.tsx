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

interface Props {
  open: boolean;
  onClose: () => void;
  cpuMetric: MetricResponse;
  vcores: number;
  serverName: string;
  storageGb: number | null;
  skuName: string | null;
}

const CU_PER_CORE = 4;

function isAwsSku(skuName: string | null): boolean {
  return skuName != null && skuName.startsWith("db.");
}

export default function LakebaseEstimateModal({
  open,
  onClose,
  cpuMetric,
  vcores,
  serverName,
  storageGb,
  skuName,
}: Props) {
  const [safetyMarginPct, setSafetyMarginPct] = useState<number>(15);
  const [scaleToZero, setScaleToZero] = useState<boolean>(true);

  const SCALE_TO_ZERO_THRESHOLD = 0.3;

  const { displayData, peakCores, avgCores, safetyLineCores, monthlyCU, scaleToZeroPeriods, totalPeriods } =
    useMemo(() => {
      let totalCores = 0;
      let count = 0;
      let peak = 0;
      const margin = safetyMarginPct / 100;

      const data = cpuMetric.data.map((d) => {
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
        // CU required per period = max cores used in that period × (1 + margin) × CU_PER_CORE
        // If scale-to-zero is enabled and peak cores < threshold, CU = 0
        const isIdle = scaleToZero && maxUsed != null && maxUsed < SCALE_TO_ZERO_THRESHOLD;
        const cuRequired =
          maxUsed != null
            ? isIdle ? 0 : Math.ceil(maxUsed * (1 + margin) * CU_PER_CORE)
            : null;
        return {
          ts: formatChartTimestamp(d.timestamp),
          coresUsedAvg:
            avgUsed != null ? Math.round(avgUsed * 100) / 100 : null,
          coresUsedMax:
            maxUsed != null ? Math.round(maxUsed * 100) / 100 : null,
          lakebaseCU: cuRequired,
        };
      });

      const avg = count > 0 ? totalCores / count : 0;
      const safetyCores = peak * (1 + margin);

      // Monthly CU: sum CU across all periods, scaled to a full month
      let totalCU = 0;
      let cuCount = 0;
      let s2zPeriods = 0;
      for (const d of data) {
        if (d.lakebaseCU != null) {
          totalCU += d.lakebaseCU;
          cuCount++;
          if (d.lakebaseCU === 0 && scaleToZero) {
            s2zPeriods++;
          }
        }
      }
      // Average CU per period × periods per month
      const avgCUPerPeriod = cuCount > 0 ? totalCU / cuCount : 0;
      const hoursPerMonth = 730;
      // Estimate interval hours from data span
      let intervalHours = 1;
      if (cpuMetric.data.length >= 2) {
        const firstTs = new Date(cpuMetric.data[0].timestamp).getTime();
        const lastTs = new Date(cpuMetric.data[cpuMetric.data.length - 1].timestamp).getTime();
        intervalHours = (lastTs - firstTs) / (cpuMetric.data.length - 1) / 3600000;
      }
      const periodsPerMonth = hoursPerMonth / intervalHours;
      const monthly = Math.round(avgCUPerPeriod * periodsPerMonth);

      const display = downsampleChartData(data);

      return {
        displayData: display,
        peakCores: Math.round(peak * 100) / 100,
        avgCores: Math.round(avg * 100) / 100,
        safetyLineCores: Math.round(safetyCores * 100) / 100,
        monthlyCU: monthly,
        scaleToZeroPeriods: s2zPeriods,
        totalPeriods: cuCount,
      };
    }, [cpuMetric, vcores, safetyMarginPct, scaleToZero]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{ sx: { borderRadius: 2 } }}
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
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
          <Chip label={serverName} size="small" />
          <Chip
            label={`${vcores} vCores`}
            size="small"
            variant="outlined"
          />
        </Box>

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
              </Typography>
              <Typography variant="h5" fontWeight={700} color="#00A972">
                ${(monthlyCU * 0.111).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Typography>
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
                {storageGb != null ? `${storageGb} GB x $${isAwsSku(skuName) ? "0.345" : "0.390"}/GB` : "Storage N/A"}
              </Typography>
              <Typography variant="h5" fontWeight={700} color="#00A972">
                {storageGb != null
                  ? `$${(storageGb * (isAwsSku(skuName) ? 0.345 : 0.390)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
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
              </Typography>
              <Typography variant="h5" fontWeight={700}>
                ${((monthlyCU * 0.111) + (storageGb != null ? storageGb * (isAwsSku(skuName) ? 0.345 : 0.390) : 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Typography>
            </Paper>
          </Box>
          <Box>
            <Typography variant="overline" fontWeight={700} color="text.secondary" sx={{ mb: 0.5, display: "block", letterSpacing: 1 }}>
              Scale to Zero
            </Typography>
            <Paper
              sx={{ p: 2, textAlign: "center", backgroundColor: scaleToZero ? "#F7F8FA" : "#F7F8FA" }}
              elevation={0}
            >
              <Typography variant="caption" color="text.secondary">
                Idle Periods ({"\u2264"} {SCALE_TO_ZERO_THRESHOLD} cores)
              </Typography>
              <Typography variant="h5" fontWeight={700} color={scaleToZero ? "#00A972" : "#1B3139"}>
                {scaleToZero ? `${scaleToZeroPeriods} / ${totalPeriods}` : "Off"}
              </Typography>
              {scaleToZero && totalPeriods > 0 && (
                <Typography variant="caption" color="text.secondary">
                  {Math.round((scaleToZeroPeriods / totalPeriods) * 100)}% idle
                </Typography>
              )}
            </Paper>
          </Box>
        </Box>

        {/* Safety margin & scale-to-zero inputs */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
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
          <FormControlLabel
            control={
              <Checkbox
                checked={scaleToZero}
                onChange={(e) => setScaleToZero(e.target.checked)}
                sx={{ color: "#00A972", "&.Mui-checked": { color: "#00A972" } }}
              />
            }
            label={<Typography variant="body2">Scale to Zero ({"\u2264"} {SCALE_TO_ZERO_THRESHOLD} cores = 0 CU)</Typography>}
          />
          <Typography variant="body2" color="text.secondary">
            Applied on top of peak CPU cores per period.
          </Typography>
        </Box>

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
              {/* Reference lines */}
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
            Per-period CU = peak cores used x (1 + {safetyMarginPct}%) x {CU_PER_CORE} CU/core
            <br />
            Peak CPU cores (overall) = {peakCores} cores (max CPU% x {vcores} vCores)
            <br />
            Peak with safety margin = {peakCores} x (1 + {safetyMarginPct}%) = {safetyLineCores} cores
            <br />
            Avg CU/period projected over 730 hrs/month ={" "}
            <strong>{monthlyCU.toLocaleString()} CU/month</strong>
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
