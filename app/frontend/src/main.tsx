import React, { Component, type ErrorInfo, type ReactNode } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider, createTheme, CssBaseline } from "@mui/material";
import App from "./App";
import "./index.css";

/** Must match Vite `base` / `VITE_BASE_URL` so client routes align with the URL bar on refresh (subpath deploys). */
function routerBasename(): string {
  const raw = import.meta.env.BASE_URL ?? "/";
  if (raw === "/" || raw === "./") return "/";
  const trimmed = raw.replace(/\/$/, "");
  return trimmed || "/";
}

const theme = createTheme({
  palette: {
    primary: { main: "#1B3139", dark: "#143D4A" },
    secondary: { main: "#FF5F46" },
    warning: { main: "#FCBA33" },
    success: { main: "#00A972", dark: "#00875C" },
    info: { main: "#42BA91" },
    background: { default: "#F2F3F5", paper: "#FFFFFF" },
    text: {
      primary: "#1B3139",
      secondary: "#A0ACBE",
    },
    divider: "#C4CCD6",
  },
  typography: {
    fontFamily: "'DM Sans', 'Helvetica', 'Arial', sans-serif",
    h5: { fontWeight: 700 },
    h6: { fontWeight: 600 },
    subtitle1: { fontWeight: 600 },
    subtitle2: { fontWeight: 600 },
    button: { textTransform: "none", fontWeight: 600 },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: { backgroundColor: "#1B3139", borderRadius: 0 },
      },
    },
    MuiButton: {
      styleOverrides: {
        contained: {
          backgroundColor: "#FF5F46",
          "&:hover": { backgroundColor: "#e5503d" },
        },
        outlined: {
          borderColor: "#C4CCD6",
          color: "#1B3139",
          "&:hover": { borderColor: "#A0ACBE", backgroundColor: "#F2F3F5" },
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          "& .MuiTableCell-head": {
            backgroundColor: "#143D4A",
            color: "#FFFFFF",
            fontWeight: 700,
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        outlined: {
          borderColor: "#C4CCD6",
          color: "#1B3139",
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { borderRadius: 8 },
      },
    },
  },
});

class RootErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("App failed to render", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: "2rem", maxWidth: 720, fontFamily: "system-ui, sans-serif" }}>
          <h1 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>
            Something went wrong loading the app
          </h1>
          <p style={{ color: "#555", marginBottom: "1rem" }}>
            Open the browser developer console for details, then redeploy after
            rebuilding the frontend.
          </p>
          <pre
            style={{
              padding: "1rem",
              background: "#f2f3f5",
              borderRadius: 8,
              overflow: "auto",
              fontSize: "0.85rem",
            }}
          >
            {this.state.error.message}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <BrowserRouter basename={routerBasename()}>
          <App />
        </BrowserRouter>
      </ThemeProvider>
    </RootErrorBoundary>
  </React.StrictMode>
);
