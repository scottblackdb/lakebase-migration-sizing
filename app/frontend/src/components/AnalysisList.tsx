import { useState, useEffect, useCallback, type MouseEvent } from "react";
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
  TextField,
  InputAdornment,
  Autocomplete,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import DnsIcon from "@mui/icons-material/Dns";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import { fetchAnalyses, fetchGroupNames, updateAnalysisGroup } from "../api";
import type { AnalysisSummary } from "../types";
import UploadForm from "./UploadForm";

export default function AnalysisList() {
  const [analyses, setAnalyses] = useState<AnalysisSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editingAnalysisId, setEditingAnalysisId] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState("");
  const [groupOptions, setGroupOptions] = useState<string[]>([]);
  const [savingGroup, setSavingGroup] = useState(false);
  const [groupEditError, setGroupEditError] = useState<string | null>(null);
  const navigate = useNavigate();

  const filteredAnalyses = analyses.filter((a) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const group = (a.group_name ?? "").toLowerCase();
    const server = (a.server_name ?? "").toLowerCase();
    return group.includes(q) || server.includes(q);
  });

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

  useEffect(() => {
    fetchGroupNames()
      .then(setGroupOptions)
      .catch(() => setGroupOptions([]));
  }, []);

  const refreshGroupOptions = useCallback(() => {
    fetchGroupNames()
      .then(setGroupOptions)
      .catch(() => setGroupOptions([]));
  }, []);

  const startGroupEdit = (e: MouseEvent, row: AnalysisSummary) => {
    e.stopPropagation();
    setGroupEditError(null);
    setEditGroupName(row.group_name ?? "");
    setEditingAnalysisId(row.analysis_id);
  };

  const cancelGroupEdit = () => {
    setEditingAnalysisId(null);
    setGroupEditError(null);
  };

  const commitGroupEdit = async () => {
    if (!editingAnalysisId) return;
    const trimmed = editGroupName.trim();
    if (!trimmed) {
      setGroupEditError("Please select or enter a group name.");
      return;
    }
    setSavingGroup(true);
    setGroupEditError(null);
    try {
      await updateAnalysisGroup(editingAnalysisId, trimmed);
      await load();
      if (!groupOptions.includes(trimmed)) {
        setGroupOptions((prev) => [...prev, trimmed].sort());
      }
      cancelGroupEdit();
    } catch (err) {
      setGroupEditError(String(err));
    } finally {
      setSavingGroup(false);
    }
  };

  return (
    <>
      <UploadForm
        onUploaded={() => {
          void load().then(() => refreshGroupOptions());
        }}
      />

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
        <>
          <TextField
            placeholder="Search group or server name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            size="small"
            sx={{ mb: 2, minWidth: 320 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon color="action" />
                </InputAdornment>
              ),
            }}
          />
          {filteredAnalyses.length === 0 ? (
            <Paper sx={{ p: 4, textAlign: "center" }}>
              <Typography color="text.secondary">
                No analyses match your search.
              </Typography>
            </Paper>
          ) : (
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Server Name</TableCell>
                    <TableCell sx={{ fontWeight: 700, minWidth: 280 }}>
                      Group Name
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Region</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>vCores</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Date Range</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Created</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredAnalyses.map((a) => {
                    const isEditing = editingAnalysisId === a.analysis_id;
                    return (
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
                        <TableCell
                          align="left"
                          sx={{ verticalAlign: "middle" }}
                          onClick={
                            isEditing
                              ? (e) => e.stopPropagation()
                              : (e) => startGroupEdit(e, a)
                          }
                        >
                          {isEditing ? (
                            <Box
                              onClick={(e) => e.stopPropagation()}
                              sx={{ py: 0.5 }}
                            >
                              <Box
                                sx={{
                                  display: "flex",
                                  alignItems: "flex-start",
                                  gap: 0.5,
                                  flexWrap: "nowrap",
                                }}
                              >
                                <Autocomplete
                                  freeSolo
                                  size="small"
                                  options={groupOptions}
                                  value={editGroupName}
                                  onChange={(_, value) =>
                                    setEditGroupName(value ?? "")
                                  }
                                  onInputChange={(_, value) =>
                                    setEditGroupName(value)
                                  }
                                  disabled={savingGroup}
                                  renderInput={(params) => (
                                    <TextField
                                      {...params}
                                      placeholder="Select or type"
                                      onKeyDown={(ev) => {
                                        if (ev.key === "Enter") {
                                          ev.preventDefault();
                                          void commitGroupEdit();
                                        }
                                        if (ev.key === "Escape") {
                                          ev.preventDefault();
                                          cancelGroupEdit();
                                        }
                                      }}
                                      sx={{ minWidth: 160 }}
                                    />
                                  )}
                                  sx={{ flex: 1, minWidth: 0, maxWidth: 240 }}
                                />
                                <Tooltip title="Save">
                                  <span>
                                    <IconButton
                                      size="small"
                                      color="primary"
                                      disabled={
                                        savingGroup || !editGroupName.trim()
                                      }
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void commitGroupEdit();
                                      }}
                                      sx={{ mt: 0.25 }}
                                    >
                                      {savingGroup ? (
                                        <CircularProgress size={20} />
                                      ) : (
                                        <CheckIcon fontSize="small" />
                                      )}
                                    </IconButton>
                                  </span>
                                </Tooltip>
                                <Tooltip title="Cancel">
                                  <IconButton
                                    size="small"
                                    disabled={savingGroup}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      cancelGroupEdit();
                                    }}
                                    sx={{ mt: 0.25 }}
                                  >
                                    <CloseIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </Box>
                              {groupEditError && (
                                <Typography
                                  variant="caption"
                                  color="error"
                                  component="div"
                                  sx={{ mt: 0.5, display: "block" }}
                                >
                                  {groupEditError}
                                </Typography>
                              )}
                            </Box>
                          ) : (
                            <Tooltip title="Click to change group" placement="top">
                              <Typography
                                component="span"
                                variant="body2"
                                sx={{
                                  cursor: "pointer",
                                  color: "#00A972",
                                  fontWeight: 500,
                                  "&:hover": {
                                    textDecoration: "underline",
                                  },
                                }}
                              >
                                {a.group_name ?? "—"}
                              </Typography>
                            </Tooltip>
                          )}
                        </TableCell>
                        <TableCell>
                          {a.region && (
                            <Chip
                              label={a.region}
                              size="small"
                              variant="outlined"
                            />
                          )}
                        </TableCell>
                        <TableCell>{a.vcores ?? "—"}</TableCell>
                        <TableCell>
                          {a.start_time.slice(0, 10)} —{" "}
                          {a.end_time.slice(0, 10)}
                        </TableCell>
                        <TableCell>{a.created_at.slice(0, 10)}</TableCell>
                        <TableCell>
                          <Tooltip title="View details">
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/analysis/${a.analysis_id}`);
                              }}
                            >
                              <OpenInNewIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}
    </>
  );
}
