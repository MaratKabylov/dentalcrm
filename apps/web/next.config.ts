import type { NextConfig } from "next";

const experimental = {
  typedEnv: true
} as NonNullable<NextConfig["experimental"]>;

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  experimental
};

export default nextConfig;
