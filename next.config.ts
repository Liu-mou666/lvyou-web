import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    mcpServer: false,
  },
  logging: false,
};

export default nextConfig;
