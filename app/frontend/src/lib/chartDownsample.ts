/** Default cap on points sent to Recharts for performance. */
export const DEFAULT_MAX_CHART_POINTS = 200;

/**
 * Uniformly thin a series to at most `maxPoints` (keeps first point of each stride).
 */
export function downsampleChartData<T>(
  data: T[],
  maxPoints: number = DEFAULT_MAX_CHART_POINTS
): T[] {
  if (data.length <= maxPoints) return data;
  const step = Math.max(1, Math.floor(data.length / maxPoints));
  return data.filter((_, i) => i % step === 0);
}
