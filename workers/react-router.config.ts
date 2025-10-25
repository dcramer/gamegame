import type { Config } from "@react-router/dev/config";

export default {
  // Server-side render by default
  ssr: true,

  // Server bundle configuration
  serverBuildFile: "index.js",

  // Use Cloudflare Workers preset
  buildDirectory: "build",

  // App directory for routes
  appDirectory: "app",
} satisfies Config;
