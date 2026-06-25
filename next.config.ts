import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    mcpServer: false,
  },
  logging: false,
  serverExternalPackages: ["playwright"],
};

export default nextConfig;
