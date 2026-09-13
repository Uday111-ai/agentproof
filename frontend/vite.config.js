var _a;
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
                target: (_a = process.env["AGENTPROOF_API_URL"]) !== null && _a !== void 0 ? _a : "http://localhost:4000",
                changeOrigin: true,
            },
        },
    },
});
