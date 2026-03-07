import fs from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

function loadDotEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIndex = line.indexOf("=");
    if (eqIndex <= 0) continue;

    const key = line.slice(0, eqIndex).trim();
    if (!key || process.env[key] !== undefined) continue;

    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

loadDotEnvLocal();

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL:
      process.env.PLAYWRIGHT_BASE_URL ??
      process.env.QA_APP_BASE_URL ??
      "http://localhost:8080",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: {
        browserName: "chromium",
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "chromium-mobile",
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
      },
    },
  ],
});
