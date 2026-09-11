import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native addon; bundling it with webpack breaks its
  // dynamic require of the compiled .node binary. Keep it (and the Prisma
  // packages that load it) external so Node requires it directly instead.
  serverExternalPackages: [
    "better-sqlite3",
    "@prisma/client",
    "@prisma/adapter-better-sqlite3",
  ],
};

export default nextConfig;
