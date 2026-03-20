import { useEffect, useRef, useState } from "react";
import {
  Paper,
  Button,
  Typography,
  Alert,
  CircularProgress,
  Stack,
  Autocomplete,
  TextField,
} from "@mui/material";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import { fetchGroupNames, uploadFile } from "../api";

interface Props {
  /** Called after a successful upload; may be async (e.g. refetch server list). */
  onUploaded?: () => void | Promise<void>;
}

export default function UploadForm({ onUploaded }: Props) {
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<{ msg: string; ok: boolean } | null>(
    null
  );
  const [fileName, setFileName] = useState<string>("");
  const [groupName, setGroupName] = useState("");
  const [groupOptions, setGroupOptions] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchGroupNames()
      .then(setGroupOptions)
      .catch(() => setGroupOptions([]));
  }, []);

  const handleFileChange = () => {
    const file = inputRef.current?.files?.[0];
    setFileName(file?.name ?? "");
    setStatus(null);
  };

  const handleSubmit = async () => {
    const file = inputRef.current?.files?.[0];
    if (!file) return;
    if (!groupName.trim()) {
      setStatus({ msg: "Please select or enter a group name.", ok: false });
      return;
    }

    setUploading(true);
    setStatus(null);

    try {
      const normalizedGroup = groupName.trim();
      const result = await uploadFile(file, normalizedGroup);
      setStatus({
        msg: `Uploaded "${result.server_name}" to "${normalizedGroup}" — ${result.metrics_loaded.length} metrics loaded`,
        ok: true,
      });
      if (inputRef.current) inputRef.current.value = "";
      setFileName("");
      if (!groupOptions.includes(normalizedGroup)) {
        setGroupOptions((prev) => [...prev, normalizedGroup].sort());
      }
      await onUploaded?.();
    } catch (e) {
      setStatus({ msg: String(e), ok: false });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Typography variant="subtitle1" fontWeight={600} gutterBottom>
        Upload Metrics JSON
      </Typography>
      <Stack
        direction="row"
        spacing={2}
        alignItems="center"
        sx={{ flexWrap: "wrap" }}
      >
        <Autocomplete
          freeSolo
          options={groupOptions}
          value={groupName}
          onChange={(_, value) => setGroupName(value ?? "")}
          onInputChange={(_, value) => setGroupName(value)}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Group Name"
              placeholder="Select existing or enter new"
              size="small"
            />
          )}
          sx={{ width: "20ch", minWidth: "20ch" }}
        />
        <Button
          variant="outlined"
          component="label"
          startIcon={<CloudUploadIcon />}
        >
          {fileName || "Choose File"}
          <input
            type="file"
            accept=".json"
            hidden
            ref={inputRef}
            onChange={handleFileChange}
          />
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={uploading || !fileName || !groupName.trim()}
          startIcon={
            uploading ? <CircularProgress size={18} color="inherit" /> : null
          }
        >
          {uploading ? "Uploading..." : "Upload"}
        </Button>
      </Stack>
      {status && (
        <Alert severity={status.ok ? "success" : "error"} sx={{ mt: 2 }}>
          {status.msg}
        </Alert>
      )}
    </Paper>
  );
}
