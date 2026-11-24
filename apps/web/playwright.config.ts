import { defineConfig, devices } from "@playwright/test";

// E2E gate for the live chat UI - assumes `npm run dev` is already running
// on PORT (default 3001, matching this app's own dev script). CI starts the
// server itself before running these tests; see .github/workflows.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3001",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
