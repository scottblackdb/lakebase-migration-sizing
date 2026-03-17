import { lazy, Suspense } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import { AppBar, Toolbar, Typography, Container, Box, CircularProgress } from "@mui/material";
import StorageIcon from "@mui/icons-material/Storage";

const AnalysisList = lazy(() => import("./components/AnalysisList"));
const AnalysisDetail = lazy(() => import("./components/AnalysisDetail"));

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
        <Suspense
          fallback={
            <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
              <CircularProgress />
            </Box>
          }
        >
          <Routes>
            <Route path="/" element={<AnalysisList />} />
            <Route path="/analysis/:id" element={<AnalysisDetail />} />
          </Routes>
        </Suspense>
      </Container>
    </Box>
  );
}
