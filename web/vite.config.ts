import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.INDEXER_API_URL ?? "http://localhost:3100",
        changeOrigin: true,
      },
      "/zk": {
        target: process.env.INDEXER_API_URL ?? "http://localhost:3100",
        changeOrigin: true,
      },
      "/puzzle": {
        target: process.env.CONTINUITY_ENGINE_URL ?? "http://localhost:3300",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
});
