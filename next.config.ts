import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  eslint: {
    // Disable ESLint blocking production builds
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
