import { useState, useEffect, useCallback, useMemo, type MouseEvent } from "react";
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
  Checkbox,
  Button,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import DnsIcon from "@mui/icons-material/Dns";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import StorageIcon from "@mui/icons-material/Storage";
import { fetchAnalyses, fetchGroupNames, updateAnalysisGroup } from "../api";
import type { AnalysisSummary } from "../types";
import UploadForm from "./UploadForm";
import BatchLakebaseEstimateModal from "./BatchLakebaseEstimateModal";

const MAX_BATCH_SELECTION = 20;

export default function AnalysisList() {
  const [analyses, setAnalyses] = useState<AnalysisSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editingAnalysisId, setEditingAnalysisId] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState("");
  const [groupOptions, setGroupOptions] = useState<string[]>([]);
  const [savingGroup, setSavingGroup] = useState(false);
  const [groupEditError, setGroupEditError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const navigate = useNavigate();

  const filteredAnalyses = analyses.filter((a) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const group = (a.group_name ?? "").toLowerCase();
    const server = (a.server_name ?? "").toLowerCase();
    return group.includes(q) || server.includes(q);
  });

  const visibleCapSlice = useMemo(
    () => filteredAnalyses.slice(0, MAX_BATCH_SELECTION),
    [filteredAnalyses]
  );
  const visibleCapIds = useMemo(
    () => visibleCapSlice.map((a) => a.analysis_id),
    [visibleCapSlice]
  );
  const allVisibleCapSelected =
    visibleCapIds.length > 0 &&
    visibleCapIds.every((id) => selectedIds.has(id));
  const someVisibleCapSelected = visibleCapIds.some((id) =>
    selectedIds.has(id)
  );

  const selectedAnalysesForBatch = useMemo(() => {
    const byId = new Map(analyses.map((a) => [a.analysis_id, a]));
    const rows = [...selectedIds]
      .map((id) => byId.get(id))
      .filter((a): a is AnalysisSummary => a != null);
    rows.sort((a, b) =>
      a.server_name.localeCompare(b.server_name, undefined, {
        sensitivity: "base",
      })
    );
    return rows;
  }, [analyses, selectedIds]);

  const toggleRowSelected = (analysisId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(analysisId)) {
        next.delete(analysisId);
        return next;
      }
      if (next.size >= MAX_BATCH_SELECTION) {
        return prev;
      }
      next.add(analysisId);
      return next;
    });
  };

  const toggleSelectVisibleCap = () => {
    setSelectedIds((prev) => {
      if (allVisibleCapSelected) {
        const next = new Set(prev);
        for (const id of visibleCapIds) next.delete(id);
        return next;
      }
      return new Set(visibleCapIds);
    });
  };

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
              placeholder="Search group or server name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              size="small"
              sx={{ minWidth: 320 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon color="action" />
                  </InputAdornment>
                ),
              }}
            />
            {selectedIds.size > 0 && (
              <Button
                variant="contained"
                startIcon={<StorageIcon />}
                onClick={() => setBatchModalOpen(true)}
                sx={{
                  backgroundColor: "#143D4A",
                  "&:hover": { backgroundColor: "#1B3139" },
                }}
              >
                Lakebase estimates ({selectedIds.size})
              </Button>
            )}
          </Box>
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
                    <TableCell padding="checkbox" sx={{ width: 48 }}>
                      <Tooltip
                        title={`Select up to ${MAX_BATCH_SELECTION} servers in the current list (first ${MAX_BATCH_SELECTION} rows)`}
                      >
                        <Checkbox
                          indeterminate={
                            someVisibleCapSelected && !allVisibleCapSelected
                          }
                          checked={allVisibleCapSelected}
                          onChange={() => toggleSelectVisibleCap()}
                          onClick={(e) => e.stopPropagation()}
                          inputProps={{
                            "aria-label": "Select all visible (up to 20)",
                          }}
                        />
                      </Tooltip>
                    </TableCell>
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
                        <TableCell
                          padding="checkbox"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Checkbox
                            checked={selectedIds.has(a.analysis_id)}
                            onChange={() => toggleRowSelected(a.analysis_id)}
                            disabled={
                              !selectedIds.has(a.analysis_id) &&
                              selectedIds.size >= MAX_BATCH_SELECTION
                            }
                            inputProps={{
                              "aria-label": `Select ${a.server_name}`,
                            }}
                          />
                        </TableCell>
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

      <BatchLakebaseEstimateModal
        open={batchModalOpen}
        onClose={() => setBatchModalOpen(false)}
        analyses={selectedAnalysesForBatch}
      />
    </>
  );
}
