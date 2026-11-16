import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: {
    jsx: "react-jsx"
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  test: {
    environment: "jsdom",
    environmentOptions: {
      jsdom: {
        url: "http://localhost/"
      }
    },
    setupFiles: ["./src/test/setup.ts"],
    // UI tests run on the small sample garden; the showcase demo has its own tests (ADR-0077).
    env: { NEXT_PUBLIC_DEMO_FIXTURE: "sample" },
    exclude: ["e2e/**", "node_modules/**"]
  }
});
