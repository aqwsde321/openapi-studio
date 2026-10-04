import { defineConfig } from "@playwright/test";
const port = Number(process.env.OPENAPI_STUDIO_E2E_PORT ?? 5175);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid E2E port");
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: "tests/e2e", fullyParallel: false, workers: 1, timeout: 45_000,
  use: { baseURL, trace: "retain-on-failure" },
  webServer: { command: `npm run dev -- --port ${port}`, url: baseURL, reuseExistingServer: !process.env.CI, timeout: 30_000 },
});
