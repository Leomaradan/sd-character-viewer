import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  allowedDevOrigins: ["192.168.0.*"],
  logging: {
    browserToTerminal: true,
  },
};

export default nextConfig;
