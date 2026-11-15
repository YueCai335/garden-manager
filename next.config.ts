import type { NextConfig } from "next";
import { legacyGardenRedirects } from "./src/lib/workspaceRoutes";

const nextConfig: NextConfig = {
  // Lets the Playwright run build into its own directory so it never clashes
  // with a `next dev` server already using `.next/`.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // Old garden-level Care and Next Season links (ADR-0073, phase S3).
  async redirects() {
    return legacyGardenRedirects.map((rule) => ({ ...rule }));
  },
};

export default nextConfig;
