import { useState, useEffect, useMemo, useCallback } from "react";
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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Switch,
  FormControlLabel,
  CircularProgress,
  Alert,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import StorageIcon from "@mui/icons-material/Storage";
import type { AnalysisSummary, MetricResponse } from "../types";
import { fetchAllMetrics } from "../api";
import {
  LAKEBASE_ESTIMATE_DEFAULT_SAFETY_MARGIN_PCT,
  LAKEBASE_ESTIMATE_DEFAULT_SCALE_TO_ZERO,
  LAKEBASE_CU_HIGH_USAGE_THRESHOLD,
  tryComputeLakebaseEstimateFromMetrics,
  lakebaseMonthlyCuCostUsd,
  lakebaseTotalMonthlyCostUsd,
} from "../lib/lakebaseEstimate";

interface Props {
  open: boolean;
  onClose: () => void;
  analyses: AnalysisSummary[];
}

type RowResult =
  | {
      analysisId: string;
      serverName: string;
      ok: true;
      monthlyCU: number;
      computeUsd: number;
      totalUsd: number;
      usedPeakCuConstantSizing: boolean;
    }
  | {
      analysisId: string;
      serverName: string;
      ok: false;
      error: string;
    };

function formatUsd(n: number): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function BatchLakebaseEstimateModal({
  open,
  onClose,
  analyses,
}: Props) {
  const [safetyMarginPct, setSafetyMarginPct] = useState(
    LAKEBASE_ESTIMATE_DEFAULT_SAFETY_MARGIN_PCT
  );
  const [autoscaleById, setAutoscaleById] = useState<Record<string, boolean>>(
    {}
  );
  const [metricsById, setMetricsById] = useState<
    Record<string, MetricResponse[]>
  >({});
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const analysesKey = [...analyses.map((a) => a.analysis_id)]
    .sort()
    .join(",");

  useEffect(() => {
    if (!open) return;
    setMetricsById({});
    setFetchError(null);
    setAutoscaleById((prev) => {
      const next: Record<string, boolean> = {};
      for (const a of analyses) {
        next[a.analysis_id] =
          prev[a.analysis_id] ?? LAKEBASE_ESTIMATE_DEFAULT_SCALE_TO_ZERO;
      }
      return next;
    });
  }, [open, analysesKey, analyses]);

  const handleAutoscaleChange = useCallback((id: string, checked: boolean) => {
    setAutoscaleById((prev) => ({ ...prev, [id]: checked }));
  }, []);

  const handleGenerate = async () => {
    setFetchError(null);
    setLoading(true);
    try {
      const entries = await Promise.all(
        analyses.map(async (a) => {
          try {
            const metrics = await fetchAllMetrics(a.analysis_id);
            return [a.analysis_id, metrics] as const;
          } catch (e) {
            throw new Error(
              `${a.server_name}: ${e instanceof Error ? e.message : String(e)}`
            );
          }
        })
      );
      const map: Record<string, MetricResponse[]> = {};
      for (const [id, m] of entries) map[id] = m;
      setMetricsById(map);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : String(e));
      setMetricsById({});
    } finally {
      setLoading(false);
    }
  };

  const rows: RowResult[] = useMemo(() => {
    if (Object.keys(metricsById).length === 0) return [];
    return analyses.map((a) => {
      const metrics = metricsById[a.analysis_id];
      if (!metrics) {
        return {
          analysisId: a.analysis_id,
          serverName: a.server_name,
          ok: false as const,
          error: "No metrics loaded",
        };
      }
      const scaleToZero =
        autoscaleById[a.analysis_id] ??
        LAKEBASE_ESTIMATE_DEFAULT_SCALE_TO_ZERO;
      const computed = tryComputeLakebaseEstimateFromMetrics(metrics, a.vcores, {
        safetyMarginPct,
        scaleToZero,
      });
      if (!computed.ok) {
        return {
          analysisId: a.analysis_id,
          serverName: a.server_name,
          ok: false as const,
          error: computed.error,
        };
      }
      const monthlyCU = computed.result.metrics.monthlyCU;
      const computeUsd = lakebaseMonthlyCuCostUsd(monthlyCU);
      const totalUsd = lakebaseTotalMonthlyCostUsd(
        monthlyCU,
        a.storage_size_gb,
        a.sku_name
      );
      return {
        analysisId: a.analysis_id,
        serverName: a.server_name,
        ok: true as const,
        monthlyCU,
        computeUsd,
        totalUsd,
        usedPeakCuConstantSizing: computed.result.metrics.usedPeakCuConstantSizing,
      };
    });
  }, [analyses, metricsById, safetyMarginPct, autoscaleById]);

  const totals = useMemo(() => {
    let monthlyCUSum = 0;
    let computeUsdSum = 0;
    let totalUsdSum = 0;
    for (const r of rows) {
      if (r.ok) {
        monthlyCUSum += r.monthlyCU;
        computeUsdSum += r.computeUsd;
        totalUsdSum += r.totalUsd;
      }
    }
    return { monthlyCUSum, computeUsdSum, totalUsdSum };
  }, [rows]);

  const hasResults = Object.keys(metricsById).length > 0;

  const anyPeakCuSizing = useMemo(
    () => rows.some((r) => r.ok && r.usedPeakCuConstantSizing),
    [rows]
  );

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
            Batch Lakebase estimates
          </Typography>
        </Box>
        <IconButton onClick={onClose} sx={{ color: "#fff" }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ mt: 2, px: 3, pb: 1 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {analyses.length} server{analyses.length !== 1 ? "s" : ""} selected.
          Estimates use the same formula as the per-server Lakebase estimate
          dialog. Per row, &quot;Scale to zero&quot; applies when no interval needs{" "}
          {LAKEBASE_CU_HIGH_USAGE_THRESHOLD}+ CUs; otherwise scale-to-zero is ignored and monthly
          CU uses peak interval CU × intervals/month.
        </Typography>

        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 2,
            mb: 2,
          }}
        >
          <TextField
            label="Safety margin %"
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
          <Button
            variant="contained"
            onClick={() => void handleGenerate()}
            disabled={loading || analyses.length === 0}
            sx={{ backgroundColor: "#00A972", "&:hover": { backgroundColor: "#00875C" } }}
          >
            {loading ? (
              <>
                <CircularProgress size={20} color="inherit" sx={{ mr: 1 }} />
                Loading metrics…
              </>
            ) : (
              "Generate estimates for all servers"
            )}
          </Button>
        </Box>

        {fetchError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {fetchError}
          </Alert>
        )}

        {hasResults && anyPeakCuSizing && (
          <Alert severity="info" sx={{ mb: 2 }}>
            One or more servers hit ≥{LAKEBASE_CU_HIGH_USAGE_THRESHOLD} Lakebase CUs in at least one
            interval (with your safety margin). Those rows use peak CU constant sizing; scale to zero
            is not applied for them.
          </Alert>
        )}

        <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ backgroundColor: "#F7F8FA" }}>
                <TableCell sx={{ fontWeight: 700 }}>Server</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="center">
                  Scale to zero
                </TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">
                  Monthly CU
                </TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">
                  Compute $/mo
                </TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">
                  Total $/mo (CU + storage)
                </TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {analyses.map((a) => {
                const scaleToZeroUi =
                  autoscaleById[a.analysis_id] ??
                  LAKEBASE_ESTIMATE_DEFAULT_SCALE_TO_ZERO;
                const row = hasResults
                  ? rows.find((r) => r.analysisId === a.analysis_id)
                  : undefined;
                return (
                  <TableRow key={a.analysis_id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>
                        {a.server_name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {a.vcores != null ? `${a.vcores} vCores` : "vCores —"}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <FormControlLabel
                        control={
                          <Switch
                            checked={scaleToZeroUi}
                            onChange={(_, c) =>
                              handleAutoscaleChange(a.analysis_id, c)
                            }
                            size="small"
                            sx={{
                              "& .MuiSwitch-switchBase.Mui-checked": {
                                color: "#00A972",
                              },
                              "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track":
                                { backgroundColor: "#00A972" },
                            }}
                          />
                        }
                        label=""
                        sx={{ m: 0 }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      {row?.ok ? row.monthlyCU.toLocaleString() : "—"}
                    </TableCell>
                    <TableCell align="right">
                      {row?.ok ? `$${formatUsd(row.computeUsd)}` : "—"}
                    </TableCell>
                    <TableCell align="right">
                      {row?.ok ? `$${formatUsd(row.totalUsd)}` : "—"}
                    </TableCell>
                    <TableCell>
                      {!hasResults ? (
                        <Typography variant="caption" color="text.secondary">
                          Run generate
                        </Typography>
                      ) : row && !row.ok ? (
                        <Typography variant="caption" color="error">
                          {row.error}
                        </Typography>
                      ) : row?.ok ? (
                        <Box>
                          <Typography variant="caption" color="success.main" display="block">
                            OK
                          </Typography>
                          {row.usedPeakCuConstantSizing && (
                            <Typography variant="caption" color="text.secondary" display="block">
                              Peak ≥{LAKEBASE_CU_HIGH_USAGE_THRESHOLD} CU
                            </Typography>
                          )}
                        </Box>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
              {hasResults && (
                <TableRow sx={{ backgroundColor: "#1B3139" }}>
                  <TableCell colSpan={2}>
                    <Typography variant="subtitle2" fontWeight={700} color="#fff">
                      All workloads (successful rows)
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="subtitle2" fontWeight={700} color="#00A972">
                      {totals.monthlyCUSum.toLocaleString()}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="subtitle2" fontWeight={700} color="#00A972">
                      ${formatUsd(totals.computeUsdSum)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="subtitle2" fontWeight={700} color="#00A972">
                      ${formatUsd(totals.totalUsdSum)}
                    </Typography>
                  </TableCell>
                  <TableCell />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} variant="outlined">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
