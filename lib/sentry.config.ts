/**
 * Shared Sentry configuration used across client, server, and edge runtimes.
 * This ensures consistent behavior and reduces duplication.
 */
export const SharedSentryConfig = {
  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  // Enable Spotlight in development to send events to local sidecar (localhost:8969)
  spotlight: process.env.NODE_ENV === "development",

  // Enable sending default PII (helpful for user identification)
  sendDefaultPii: true,

  // Experimental features
  _experiments: {
    enableLogs: true,
  },
} as const;
