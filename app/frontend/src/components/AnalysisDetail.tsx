import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  Paper,
  Typography,
  Chip,
  Grid,
  CircularProgress,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import MemoryIcon from "@mui/icons-material/Memory";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import ComputerIcon from "@mui/icons-material/Computer";
import LayersIcon from "@mui/icons-material/Layers";
import StorageIcon from "@mui/icons-material/Storage";
import DateRangeIcon from "@mui/icons-material/DateRange";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import VisibilityIcon from "@mui/icons-material/Visibility";
import CloseIcon from "@mui/icons-material/Close";
import Markdown from "react-markdown";
import { fetchAnalysis, fetchAllMetrics, generateAiAnalysis } from "../api";
import type { AnalysisSummary, MetricResponse } from "../types";
import MetricChart from "./MetricChart";
import CpuCapacityChart from "./CpuCapacityChart";
import CacheHitRatioChart from "./CacheHitRatioChart";
import LakebaseEstimateModal from "./LakebaseEstimateModal";

interface OverviewCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}

function OverviewCard({ icon, label, value }: OverviewCardProps) {
  return (
    <Paper
      sx={{
        p: 2.5,
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 0.5,
      }}
      elevation={1}
    >
      <Box sx={{ color: "#FF5F46", mb: 0.5 }}>{icon}</Box>
      <Typography variant="h6" fontWeight={700}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary" textTransform="uppercase" letterSpacing={0.5}>
        {label}
      </Typography>
    </Paper>
  );
}

export default function AnalysisDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [analysis, setAnalysis] = useState<AnalysisSummary | null>(null);
  const [metrics, setMetrics] = useState<MetricResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [lakebaseModalOpen, setLakebaseModalOpen] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setLoadError(null);
    Promise.all([fetchAnalysis(id), fetchAllMetrics(id)])
      .then(([a, m]) => {
        setAnalysis(a);
        setMetrics(m);
      })
      .catch((e) => {
        setAnalysis(null);
        setMetrics([]);
        setLoadError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setLoading(false));
  }, [id]);

  const handleGenerateAnalysis = async () => {
    if (!id) return;
    setGenerating(true);
    setAiError(null);
    try {
      const result = await generateAiAnalysis(id);
      setAnalysis((prev) =>
        prev ? { ...prev, ai_analysis: result.ai_analysis } : prev
      );
      setModalOpen(true);
    } catch (e) {
      setAiError(String(e));
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ textAlign: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!analysis) {
    return (
      <Typography color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
        {loadError ??
          "Analysis not found. If this persists after refresh, ensure the app was built with the correct VITE_BASE_URL for your deploy path."}
      </Typography>
    );
  }

  const overviewCards: OverviewCardProps[] = [];
  if (analysis.vcores) {
    overviewCards.push({ icon: <MemoryIcon />, label: "vCores", value: analysis.vcores });
  }
  if (analysis.memory_gb != null) {
    overviewCards.push({ icon: <MemoryIcon />, label: "Memory", value: `${analysis.memory_gb} GB` });
  }
  if (analysis.region) {
    overviewCards.push({ icon: <LocationOnIcon />, label: "Region", value: analysis.region });
  }
  if (analysis.vm_type) {
    overviewCards.push({ icon: <ComputerIcon />, label: "VM Type", value: analysis.vm_type });
  }
  if (analysis.sku_tier) {
    overviewCards.push({ icon: <LayersIcon />, label: "Tier", value: analysis.sku_tier });
  }
  if (analysis.storage_size_gb) {
    overviewCards.push({ icon: <StorageIcon />, label: "Storage", value: `${analysis.storage_size_gb} GB` });
  }
  overviewCards.push({
    icon: <DateRangeIcon />,
    label: "Date Range",
    value: `${analysis.start_time.slice(0, 10)} — ${analysis.end_time.slice(0, 10)}`,
  });

  const hasAiAnalysis = !!analysis.ai_analysis;
  const cpuMetric = metrics.find((m) => m.metric_name === "cpu_percent");
  const hasCpuChartData =
    Boolean(analysis.vcores && cpuMetric && cpuMetric.data_points > 0);
  const blocksHitMetric = metrics.find((m) => m.metric_name === "blks_hit");
  const blocksReadMetric = metrics.find((m) => m.metric_name === "blks_read");
  const hasCacheMetricDefinitions = !!blocksHitMetric && !!blocksReadMetric;
  const hasCacheHitMetrics =
    hasCacheMetricDefinitions &&
    blocksHitMetric.data_points > 0 &&
    blocksReadMetric.data_points > 0;

  return (
    <>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate("/")}
        >
          Back to list
        </Button>

        <Box sx={{ display: "flex", gap: 1 }}>
          {hasAiAnalysis ? (
            <Button
              variant="outlined"
              startIcon={<VisibilityIcon />}
              onClick={() => setModalOpen(true)}
              sx={{ borderColor: "#00A972", color: "#00A972", "&:hover": { borderColor: "#00875C", backgroundColor: "rgba(0,169,114,0.04)" } }}
            >
              View Analysis
            </Button>
          ) : (
            <Button
              variant="contained"
              startIcon={generating ? <CircularProgress size={18} color="inherit" /> : <AutoAwesomeIcon />}
              onClick={handleGenerateAnalysis}
              disabled={generating}
            >
              {generating ? "Analyzing..." : "Generate Migration Analysis"}
            </Button>
          )}
          {hasCpuChartData && (
            <Button
              variant="outlined"
              startIcon={<StorageIcon />}
              onClick={() => setLakebaseModalOpen(true)}
              sx={{ borderColor: "#143D4A", color: "#143D4A", "&:hover": { borderColor: "#1B3139", backgroundColor: "rgba(20,61,74,0.04)" } }}
            >
              Lakebase Estimate
            </Button>
          )}
        </Box>
      </Box>

      {aiError && (
        <Paper sx={{ p: 2, mb: 2, backgroundColor: "#FFF3F0", border: "1px solid #FF5F46" }}>
          <Typography variant="body2" color="error">{aiError}</Typography>
        </Paper>
      )}

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h5" fontWeight={700} gutterBottom>
          {analysis.server_name}
        </Typography>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          {analysis.group_name && (
            <Chip label={analysis.group_name} size="small" variant="filled" sx={{ backgroundColor: "#143D4A", color: "#fff" }} />
          )}
          {analysis.owner && (
            <Chip label={analysis.owner} size="small" variant="outlined" sx={{ borderColor: "#143D4A", color: "#143D4A" }} />
          )}
          <Chip label={`Granularity: ${analysis.granularity}`} size="small" variant="outlined" />
        </Box>
      </Paper>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {overviewCards.map((card) => (
          <Grid key={card.label} size={{ xs: 6, sm: 4, md: 2 }}>
            <OverviewCard {...card} />
          </Grid>
        ))}
      </Grid>

      <Divider sx={{ mb: 3 }} />

      {hasCpuChartData && cpuMetric && analysis.vcores && (
        <CpuCapacityChart cpuMetric={cpuMetric} vcores={analysis.vcores} />
      )}

      {hasCacheHitMetrics && blocksHitMetric && blocksReadMetric && (
        <CacheHitRatioChart
          blocksHitMetric={blocksHitMetric}
          blocksReadMetric={blocksReadMetric}
        />
      )}

      {hasCacheMetricDefinitions && !hasCacheHitMetrics && (
        <Paper sx={{ p: 2.5, mb: 3 }}>
          <Typography variant="subtitle1" fontWeight={700} gutterBottom>
            Database Cache Hit Ratio
          </Typography>
          <Typography variant="body2" color="text.secondary">
            This analysis does not include cache block metrics (`blks_hit`,
            `blks_read`) with data points, so cache hit ratio cannot be shown.
          </Typography>
        </Paper>
      )}

      <Grid container spacing={2.5}>
        {metrics
          .filter(
            (m) =>
              m.data_points > 0 &&
              m.metric_name !== "blks_hit" &&
              m.metric_name !== "blks_read"
          )
          .map((m) => (
            <Grid key={m.metric_name} size={{ xs: 12, md: 6 }}>
              <MetricChart metric={m} />
            </Grid>
          ))}
      </Grid>

      {/* AI Analysis Modal */}
      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", backgroundColor: "#1B3139", color: "#fff" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <AutoAwesomeIcon sx={{ color: "#FCBA33" }} />
            <Typography variant="h6" fontWeight={600}>
              Lakebase Migration Analysis
            </Typography>
          </Box>
          <IconButton onClick={() => setModalOpen(false)} sx={{ color: "#fff" }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ mt: 2, px: 3, pb: 1 }}>
          <Box sx={{ mb: 2 }}>
            <Chip label={analysis.server_name} size="small" sx={{ mr: 1 }} />
            <Chip label={`${analysis.vcores} vCores`} size="small" variant="outlined" sx={{ mr: 1 }} />
            {analysis.region && <Chip label={analysis.region} size="small" variant="outlined" />}
          </Box>
          <Box
            sx={{
              lineHeight: 1.8,
              fontFamily: "'DM Sans', sans-serif",
              fontSize: "0.875rem",
              "& h1, & h2, & h3": { color: "#1B3139", mt: 2, mb: 1 },
              "& h2": { fontSize: "1.15rem", fontWeight: 700 },
              "& h3": { fontSize: "1rem", fontWeight: 600 },
              "& p": { mb: 1.5 },
              "& ul, & ol": { pl: 3, mb: 1.5 },
              "& li": { mb: 0.5 },
              "& strong": { color: "#1B3139" },
              "& table": { width: "100%", borderCollapse: "collapse", mb: 2 },
              "& th": { backgroundColor: "#143D4A", color: "#fff", p: 1, textAlign: "left", fontSize: "0.8rem" },
              "& td": { p: 1, borderBottom: "1px solid #C4CCD6", fontSize: "0.8rem" },
              "& code": { fontFamily: "'DM Mono', monospace", backgroundColor: "#F2F3F5", px: 0.5, borderRadius: 0.5, fontSize: "0.8rem" },
              "& blockquote": { borderLeft: "3px solid #FF5F46", pl: 2, ml: 0, color: "#6b7280", fontStyle: "italic" },
              "& hr": { border: "none", borderTop: "1px solid #C4CCD6", my: 2 },
            }}
          >
            <Markdown>{analysis.ai_analysis ?? ""}</Markdown>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setModalOpen(false)} variant="outlined">
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {hasCpuChartData && cpuMetric && analysis.vcores && (
        <LakebaseEstimateModal
          open={lakebaseModalOpen}
          onClose={() => setLakebaseModalOpen(false)}
          cpuMetric={cpuMetric}
          vcores={analysis.vcores}
          serverName={analysis.server_name}
          storageGb={analysis.storage_size_gb}
          skuName={analysis.sku_name}
        />
      )}
    </>
  );
}
