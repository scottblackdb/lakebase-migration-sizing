import { useState, useRef } from "react";
import {
  Paper,
  Button,
  Typography,
  Alert,
  CircularProgress,
  Stack,
} from "@mui/material";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import { uploadFile } from "../api";

interface Props {
  onUploaded: () => void;
}

export default function UploadForm({ onUploaded }: Props) {
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<{ msg: string; ok: boolean } | null>(
    null
  );
  const [fileName, setFileName] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = () => {
    const file = inputRef.current?.files?.[0];
    setFileName(file?.name ?? "");
    setStatus(null);
  };

  const handleSubmit = async () => {
    const file = inputRef.current?.files?.[0];
    if (!file) return;

    setUploading(true);
    setStatus(null);

    try {
      const result = await uploadFile(file);
      setStatus({
        msg: `Uploaded "${result.server_name}" — ${result.metrics_loaded.length} metrics loaded`,
        ok: true,
      });
      if (inputRef.current) inputRef.current.value = "";
      setFileName("");
      onUploaded();
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
      <Stack direction="row" spacing={2} alignItems="center">
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
          disabled={uploading || !fileName}
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
