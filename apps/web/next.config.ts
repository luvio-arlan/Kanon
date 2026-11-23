import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@kanon/ui", "@kanon/core", "@kanon/ai"],
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  reactStrictMode: true,
};

export default nextConfig;
