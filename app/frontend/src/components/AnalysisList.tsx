import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Chip,
  CircularProgress,
  Box,
  IconButton,
  Tooltip,
} from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import DnsIcon from "@mui/icons-material/Dns";
import { fetchAnalyses } from "../api";
import type { AnalysisSummary } from "../types";
import UploadForm from "./UploadForm";

export default function AnalysisList() {
  const [analyses, setAnalyses] = useState<AnalysisSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAnalyses(await fetchAnalyses());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <UploadForm onUploaded={load} />

      {loading ? (
        <Box sx={{ textAlign: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      ) : analyses.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: "center" }}>
          <DnsIcon sx={{ fontSize: 48, color: "text.disabled", mb: 1 }} />
          <Typography color="text.secondary">
            No analyses yet. Upload a JSON file to get started.
          </Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Server Name</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Region</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>vCores</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Date Range</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Granularity</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Created</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {analyses.map((a) => (
                <TableRow
                  key={a.analysis_id}
                  hover
                  sx={{ cursor: "pointer" }}
                  onClick={() => navigate(`/analysis/${a.analysis_id}`)}
                >
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>
                      {a.server_name}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {a.region && (
                      <Chip label={a.region} size="small" variant="outlined" />
                    )}
                  </TableCell>
                  <TableCell>{a.vcores ?? "—"}</TableCell>
                  <TableCell>
                    {a.start_time.slice(0, 10)} — {a.end_time.slice(0, 10)}
                  </TableCell>
                  <TableCell>{a.granularity}</TableCell>
                  <TableCell>{a.created_at.slice(0, 10)}</TableCell>
                  <TableCell>
                    <Tooltip title="View details">
                      <IconButton size="small">
                        <OpenInNewIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </>
  );
}
