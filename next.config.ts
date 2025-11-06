import { withWorkflow } from 'workflow/next';
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

// Always enable workflows in development and production
export default withWorkflow(nextConfig);
