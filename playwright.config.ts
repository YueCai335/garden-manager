import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end run: real Chromium, the real Next.js app, the real FastAPI
 * backend, and a fresh database. Ports 3100/8100 keep it clear of the
 * normal dev servers on 3000/8000.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: [
    {
      command: "sh e2e/start-backend.sh",
      url: "http://127.0.0.1:8100/health",
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: "npx next dev --hostname localhost --port 3100",
      url: "http://localhost:3100",
      timeout: 180_000,
      reuseExistingServer: false,
      env: {
        NEXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:8100",
        NEXT_DIST_DIR: ".next-e2e",
      },
    },
  ],
});
