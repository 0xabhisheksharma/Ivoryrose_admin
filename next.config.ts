import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root,
  },
  async redirects() {
    return [
      {
        source: "/admin/sync-logs",
        destination: "/admin",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
