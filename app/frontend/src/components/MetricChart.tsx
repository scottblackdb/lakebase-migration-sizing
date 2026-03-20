import { Paper, Typography } from "@mui/material";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import type { MetricResponse } from "../types";
import { downsampleChartData } from "../lib/chartDownsample";
import { formatChartTimestamp } from "../lib/formatTimestamp";

interface Props {
  metric: MetricResponse;
}

function formatStorageBytes(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)} TB`;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${bytes} B`;
}

const PERCENT_METRICS = ["cpu_percent", "memory_percent", "storage_percent"];

export default function MetricChart({ metric }: Props) {
  const isPercent = PERCENT_METRICS.includes(metric.metric_name);
  const isStorage = metric.metric_name === "storage_used";

  const chartData = metric.data.map((d) => ({
    ts: formatChartTimestamp(d.timestamp),
    average: d.average,
    maximum: d.maximum,
    minimum: d.minimum,
  }));

  const displayData = downsampleChartData(chartData);

  return (
    <Paper sx={{ p: 2.5 }}>
      <Typography variant="subtitle2" fontWeight={600} gutterBottom>
        {metric.display_name}
        <Typography
          component="span"
          variant="caption"
          color="text.secondary"
          sx={{ ml: 1 }}
        >
          ({metric.data_points} points)
        </Typography>
      </Typography>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={displayData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#C4CCD6" />
          <XAxis
            dataKey="ts"
            tick={{ fontSize: 11, fill: "#A0ACBE" }}
            interval="preserveStartEnd"
            stroke="#C4CCD6"
          />
          <YAxis
            domain={isPercent ? [0, 100] : ["auto", "auto"]}
            tickFormatter={isStorage ? formatStorageBytes : undefined}
            tick={{ fontSize: 11, fill: "#A0ACBE" }}
            width={isStorage ? 70 : 50}
            stroke="#C4CCD6"
          />
          <Tooltip
            formatter={(value: number) =>
              isStorage ? formatStorageBytes(value) : value?.toFixed(2)
            }
            contentStyle={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              borderRadius: 6,
              border: "1px solid #C4CCD6",
            }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="average"
            stroke="#143D4A"
            dot={false}
            strokeWidth={2}
            name="Average"
          />
          <Line
            type="monotone"
            dataKey="maximum"
            stroke="#FF5F46"
            dot={false}
            strokeWidth={1}
            strokeDasharray="4 2"
            name="Maximum"
          />
          <Line
            type="monotone"
            dataKey="minimum"
            stroke="#00A972"
            dot={false}
            strokeWidth={1}
            strokeDasharray="4 2"
            name="Minimum"
          />
        </LineChart>
      </ResponsiveContainer>
    </Paper>
  );
}
