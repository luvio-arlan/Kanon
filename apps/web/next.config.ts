import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@kanon/ui", "@kanon/core", "@kanon/ai"],
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  reactStrictMode: true,
  images: {
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    optimizePackageImports: ["@tabler/icons-react", "framer-motion", "@kanon/ui"],
  },
  async redirects() {
    return [
      {
        source: "/welcome",
        destination: "/login",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
