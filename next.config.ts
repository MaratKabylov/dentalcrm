import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    proxyClientMaxBodySize: "11mb",
    serverActions: {
      bodySizeLimit: "11mb",
    },
  },
  turbopack: {
    root: process.cwd(),
  },
  outputFileTracingIncludes: {
    "/*": ["./node_modules/@fontsource/noto-sans/files/*.woff"],
  },
};

export default nextConfig;
