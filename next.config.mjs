/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "100mb",
    },
  },
  images: {
    remotePatterns: [
      { hostname: "scouktdkmtefzrbg.public.blob.vercel-storage.com" },
    ],
  },
};

export default nextConfig;
