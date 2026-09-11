import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets the Playwright run build into its own directory so it never clashes
  // with a `next dev` server already using `.next/`.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};

export default nextConfig;
