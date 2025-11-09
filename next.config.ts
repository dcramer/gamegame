import { withWorkflow } from 'workflow/next';
import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true, // Partial prerendering (moved from experimental)
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb', // For file uploads
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.vercel-storage.com',
      },
      {
        protocol: 'https',
        hostname: '**.public.blob.vercel-storage.com',
      },
      {
        protocol: 'https',
        hostname: 'cf-geekdo-images.com', // BGG images
      },
    ],
  },
  // Enable React Compiler
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },
};

// Compose both Workflow and Sentry configs
// Order matters: withSentryConfig should wrap first, then withWorkflow
export default withWorkflow(
  withSentryConfig(nextConfig, {
    org: 'cramer',
    project: 'gamegame',

    // Only print logs for uploading source maps in CI
    silent: !process.env.CI,

    // Upload a larger set of source maps for prettier stack traces (increases build time)
    widenClientFileUpload: true,

    // Automatically annotate React components to show their full name in breadcrumbs and session replay
    reactComponentAnnotation: {
      enabled: true,
    },

    // Hides source maps from generated client bundles
    sourcemaps: {
      deleteSourcemapsAfterUpload: true,
    },

    // Automatically tree-shake Sentry logger statements to reduce bundle size
    disableLogger: true,

    // Enables automatic instrumentation of Vercel Cron Monitors
    automaticVercelMonitors: true,
  })
);
