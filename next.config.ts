import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  logging: {
    browserToTerminal: true,
  },
};

export default nextConfig;
