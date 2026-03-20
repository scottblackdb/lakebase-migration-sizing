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
  blocksHitMetric: MetricResponse;
  blocksReadMetric: MetricResponse;
}

export default function CacheHitRatioChart({
  blocksHitMetric,
  blocksReadMetric,
}: Props) {
  const blocksReadByTimestamp = new Map(
    blocksReadMetric.data.map((d) => [d.timestamp, d])
  );

  const chartData = blocksHitMetric.data
    .map((hitPoint) => {
      const readPoint = blocksReadByTimestamp.get(hitPoint.timestamp);
      if (!readPoint || hitPoint.average == null || readPoint.average == null) {
        return null;
      }

      const totalAverage = hitPoint.average + readPoint.average;
      const totalMaximum =
        (hitPoint.maximum ?? 0) + (readPoint.maximum ?? 0);
      const totalMinimum =
        (hitPoint.minimum ?? 0) + (readPoint.minimum ?? 0);

      const averageRatio =
        totalAverage > 0 ? (hitPoint.average / totalAverage) * 100 : null;
      const maximumRatio =
        totalMaximum > 0 && hitPoint.maximum != null
          ? (hitPoint.maximum / totalMaximum) * 100
          : null;
      const minimumRatio =
        totalMinimum > 0 && hitPoint.minimum != null
          ? (hitPoint.minimum / totalMinimum) * 100
          : null;

      return {
        ts: formatChartTimestamp(hitPoint.timestamp),
        averageRatio:
          averageRatio != null ? Math.round(averageRatio * 100) / 100 : null,
        maximumRatio:
          maximumRatio != null ? Math.round(maximumRatio * 100) / 100 : null,
        minimumRatio:
          minimumRatio != null ? Math.round(minimumRatio * 100) / 100 : null,
      };
    })
    .filter((d): d is NonNullable<typeof d> => d !== null);

  const displayData = downsampleChartData(chartData);

  if (chartData.length === 0) {
    return (
      <Paper sx={{ p: 2.5, mb: 3 }}>
        <Typography variant="subtitle1" fontWeight={700} gutterBottom>
          Database Cache Hit Ratio
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Cache hit ratio could not be calculated because matching blocks hit/read
          data points were not available for this analysis.
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 2.5, mb: 3 }}>
      <Typography variant="subtitle1" fontWeight={700} gutterBottom>
        Database Cache Hit Ratio
        <Typography
          component="span"
          variant="caption"
          color="text.secondary"
          sx={{ ml: 1 }}
        >
          ({chartData.length} points)
        </Typography>
      </Typography>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={displayData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#C4CCD6" />
          <XAxis
            dataKey="ts"
            tick={{ fontSize: 11, fill: "#A0ACBE" }}
            interval="preserveStartEnd"
            stroke="#C4CCD6"
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: "#A0ACBE" }}
            stroke="#C4CCD6"
            tickFormatter={(value: number) => `${value}%`}
          />
          <Tooltip
            formatter={(value: number) => `${value?.toFixed(2)}%`}
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
            dataKey="averageRatio"
            stroke="#143D4A"
            dot={false}
            strokeWidth={2}
            name="Average Hit Ratio"
          />
          <Line
            type="monotone"
            dataKey="maximumRatio"
            stroke="#00A972"
            dot={false}
            strokeWidth={1}
            strokeDasharray="4 2"
            name="Maximum Hit Ratio"
          />
          <Line
            type="monotone"
            dataKey="minimumRatio"
            stroke="#FF5F46"
            dot={false}
            strokeWidth={1}
            strokeDasharray="4 2"
            name="Minimum Hit Ratio"
          />
        </LineChart>
      </ResponsiveContainer>
    </Paper>
  );
}
