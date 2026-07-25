import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
  // Allow Pages Router (pages/) alongside App Router (src/app/)
  // The /api/webhook route will be served from pages/api/webhook.js
};

export default nextConfig;
