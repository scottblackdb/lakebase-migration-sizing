import { lazy, Suspense, useEffect, useState } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import {
  AppBar,
  Toolbar,
  Typography,
  Container,
  Box,
  CircularProgress,
} from "@mui/material";
import StorageIcon from "@mui/icons-material/Storage";
import { fetchCurrentUser } from "./api";
import {
  CurrentUserProvider,
  type CurrentUserState,
} from "./context/CurrentUserContext";

const AnalysisList = lazy(() => import("./components/AnalysisList"));
const AnalysisDetail = lazy(() => import("./components/AnalysisDetail"));

export default function App() {
  const navigate = useNavigate();
  const [meUser, setMeUser] = useState<CurrentUserState>(undefined);

  useEffect(() => {
    fetchCurrentUser()
      .then((r) => setMeUser(r.user ?? null))
      .catch(() => setMeUser(null));
  }, []);

  const userLabel =
    meUser === undefined
      ? "…"
      : meUser
        ? meUser
        : "Not signed in";

  return (
    <CurrentUserProvider value={meUser}>
      <Box sx={{ minHeight: "100vh" }}>
        <AppBar position="static" elevation={1}>
          <Toolbar
            disableGutters={false}
            sx={{ display: "flex", alignItems: "center", gap: 2 }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                flex: 1,
                minWidth: 0,
                cursor: "pointer",
              }}
              onClick={() => navigate("/")}
            >
              <StorageIcon sx={{ mr: 1.5, color: "#FF5F46" }} />
              <Typography variant="h6" fontWeight={600} noWrap>
                Lakebase Migration Sizing
              </Typography>
            </Box>
            <Typography
              variant="body2"
              component="span"
              sx={{
                flexShrink: 0,
                maxWidth: { xs: "40vw", sm: "50%" },
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                opacity: 0.92,
                fontWeight: 500,
              }}
              title={meUser ?? undefined}
            >
              {userLabel}
            </Typography>
          </Toolbar>
        </AppBar>
        <Container
          maxWidth={false}
          sx={(theme) => ({
            py: 4,
            maxWidth: theme.breakpoints.values.lg * 1.2,
            mx: "auto",
          })}
        >
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
    </CurrentUserProvider>
  );
}
