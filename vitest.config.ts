import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "url";
// import { loadEnv } from "vite";
import { join } from "node:path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // This way we can pick the environment from `.env.test`` file and it
    // won't need to be prefixed with `VITE_`
    // env: loadEnv("test", process.cwd(), ""),
    environment: "node",
    // setupFiles: join("__tests__", "setup", "setup.ts"),
  },
  resolve: {
    alias: {
      "@/": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
});
