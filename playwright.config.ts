import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // Tests share one real demo account/database (see e2e/global-setup.ts)
  // — running them in parallel would race on the same rows.
  fullyParallel: false,
  globalSetup: "./e2e/global-setup.ts",
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Next's webpack bundler stubs out `require("bufferutil")` (ws's
    // optional native accelerator, not installed here) with an empty
    // object instead of letting it throw — which defeats ws's own
    // try/catch feature detection and crashes any real interactive
    // prisma.$transaction() with "bufferUtil.mask is not a function".
    // This documented ws env var skips that require entirely.
    env: { WS_NO_BUFFER_UTIL: "1" },
  },
  use: {
    baseURL: "http://localhost:3000",
  },
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/user.json" },
      dependencies: ["setup"],
    },
  ],
});
