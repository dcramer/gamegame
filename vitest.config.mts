import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
// import { loadEnv } from "vite";
// import { join } from "node:path";
import tsconfigPaths from "vite-tsconfig-paths";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    // This way we can pick the environment from `.env.test`` file and it
    // won't need to be prefixed with `VITE_`
    // env: loadEnv("test", process.cwd(), ""),
    environment: "node",
  },
});
