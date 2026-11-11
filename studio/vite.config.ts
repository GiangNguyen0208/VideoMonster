/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Backlot serves the built app at /studio (backlot/server.py). In dev, Vite
// proxies the Backlot API, media and thumbnails to the running server.
const BACKLOT = process.env.BACKLOT_URL ?? `http://127.0.0.1:${process.env.BACKLOT_PORT ?? 4750}`;

export default defineConfig({
  base: "/studio/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": { target: BACKLOT, changeOrigin: false },
      "/media": BACKLOT,
      "/thumb": BACKLOT,
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    // Long wizard flows run slowly when the suite runs in parallel.
    testTimeout: 15_000,
  },
});
