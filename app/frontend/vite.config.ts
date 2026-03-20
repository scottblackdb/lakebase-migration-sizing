import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Set VITE_BASE_URL when the app is hosted under a path prefix (e.g. some Databricks Apps URLs).
export default defineConfig({
  base: process.env.VITE_BASE_URL ?? "/",
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 600,
  },
  server: {
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
});
