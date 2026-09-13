import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// AgentProof frontend. In development, /api is proxied to the backend so the
// UI can be served from a different port without CORS friction (the backend
// also sets permissive CORS headers directly, so this is a convenience, not
// a requirement).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env["AGENTPROOF_API_URL"] ?? "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
