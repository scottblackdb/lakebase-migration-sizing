import { Routes, Route, useNavigate } from "react-router-dom";
import { AppBar, Toolbar, Typography, Container, Box } from "@mui/material";
import StorageIcon from "@mui/icons-material/Storage";
import AnalysisList from "./components/AnalysisList";
import AnalysisDetail from "./components/AnalysisDetail";

export default function App() {
  const navigate = useNavigate();
  return (
    <Box sx={{ minHeight: "100vh" }}>
      <AppBar position="static" elevation={1}>
        <Toolbar
          sx={{ cursor: "pointer" }}
          onClick={() => navigate("/")}
        >
          <StorageIcon sx={{ mr: 1.5, color: "#FF5F46" }} />
          <Typography variant="h6" fontWeight={600}>
            Lakebase Migration Sizing
          </Typography>
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Routes>
          <Route path="/" element={<AnalysisList />} />
          <Route path="/analysis/:id" element={<AnalysisDetail />} />
        </Routes>
      </Container>
    </Box>
  );
}
