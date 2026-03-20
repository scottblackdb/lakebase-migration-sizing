import { Paper, Typography, Box } from "@mui/material";
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
  cpuMetric: MetricResponse;
  vcores: number;
}

export default function CpuCapacityChart({ cpuMetric, vcores }: Props) {
  let peakCpuPercent = 0;
  const chartData = cpuMetric.data.map((d) => {
    const avgUsed = d.average != null ? (d.average / 100) * vcores : null;
    const maxUsed = d.maximum != null ? (d.maximum / 100) * vcores : null;
    if (d.maximum != null && d.maximum > peakCpuPercent) {
      peakCpuPercent = d.maximum;
    }
    return {
      ts: formatChartTimestamp(d.timestamp),
      vcoresUsedAvg: avgUsed != null ? Math.round(avgUsed * 100) / 100 : null,
      vcoresUsedMax: maxUsed != null ? Math.round(maxUsed * 100) / 100 : null,
      totalVcores: vcores,
      gap: avgUsed != null ? Math.round((vcores - avgUsed) * 100) / 100 : null,
    };
  });
  const peakVcores = Math.round((peakCpuPercent / 100) * vcores * 100) / 100;

  const displayData = downsampleChartData(chartData);

  return (
    <Paper sx={{ p: 2.5, mb: 3 }}>
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, mb: 1 }}>
        <Typography variant="subtitle1" fontWeight={700}>
          CPU Capacity Utilization
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {vcores} vCores allocated | Peak: {peakCpuPercent.toFixed(1)}% ({peakVcores} vCores)
        </Typography>
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: "block" }}>
        Red area = unused CPU headroom between average utilization and allocated vCores
      </Typography>
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={displayData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#C4CCD6" />
          <XAxis
            dataKey="ts"
            tick={{ fontSize: 11, fill: "#A0ACBE" }}
            interval="preserveStartEnd"
            stroke="#C4CCD6"
          />
          <YAxis
            domain={[0, vcores]}
            tick={{ fontSize: 11, fill: "#A0ACBE" }}
            stroke="#C4CCD6"
            label={{
              value: "vCores",
              angle: -90,
              position: "insideLeft",
              style: { fontSize: 12, fill: "#A0ACBE" },
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
                vcoresUsedAvg: "Avg vCores Used",
                gap: "Unused Headroom",
                vcoresUsedMax: "Max vCores Used",
              };
              return [value?.toFixed(2), labels[name] || name];
            }}
          />
          <Legend
            formatter={(value: string) => {
              const labels: Record<string, string> = {
                vcoresUsedAvg: "Avg vCores Used",
                gap: "Unused Headroom",
                vcoresUsedMax: "Peak vCores Used",
              };
              return labels[value] || value;
            }}
          />
          {/* Stacked areas: usage on bottom, red gap on top */}
          <Area
            type="monotone"
            dataKey="vcoresUsedAvg"
            stackId="cpu"
            fill="#143D4A"
            fillOpacity={0.7}
            stroke="#143D4A"
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="gap"
            stackId="cpu"
            fill="#FF5F46"
            fillOpacity={0.3}
            stroke="none"
          />
          {/* Peak usage line */}
          <Line
            type="monotone"
            dataKey="vcoresUsedMax"
            stroke="#FCBA33"
            dot={false}
            strokeWidth={1.5}
            strokeDasharray="4 2"
          />
          {/* Reference line at peak CPU utilization */}
          <ReferenceLine
            y={peakVcores}
            stroke="#FFAB00"
            strokeWidth={2}
            strokeDasharray="4 3"
            label={{
              value: `Peak ${peakCpuPercent.toFixed(1)}%`,
              position: "right",
              fill: "#FFAB00",
              fontSize: 11,
              fontWeight: 600,
            }}
          />
          {/* Reference line at total vCores */}
          <ReferenceLine
            y={vcores}
            stroke="#FF5F46"
            strokeWidth={2}
            strokeDasharray="6 3"
            label={{
              value: `${vcores} vCores`,
              position: "right",
              fill: "#FF5F46",
              fontSize: 12,
              fontWeight: 600,
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </Paper>
  );
}
