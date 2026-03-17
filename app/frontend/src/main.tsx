import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider, createTheme, CssBaseline } from "@mui/material";
import App from "./App";
import "./index.css";

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

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);
