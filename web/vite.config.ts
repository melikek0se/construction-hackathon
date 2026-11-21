import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // API_URL is set by docker-compose.yml (the API container); without it, the API on this machine.
  // loadEnv with an empty prefix also reads the process environment.
  server: { proxy: { "/api": loadEnv(mode, ".", "").API_URL || "http://127.0.0.1:8000" } },
}));
