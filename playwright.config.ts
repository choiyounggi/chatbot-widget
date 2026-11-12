import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

// End-to-end against a real engine (chatbot-engine at ENGINE_DIR, hashing embedder: no model).
// 5180 serves the widget build (chatbot.js, chat.html), 5181 a test site that embeds it.
const ENGINE_DIR = process.env.ENGINE_DIR ?? "engine";
export const ENGINE = "http://127.0.0.1:8766";
export const WIDGET = "http://127.0.0.1:5180";
export const SITE = "http://127.0.0.1:5181";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: 0,
  workers: 1, // one engine, shared state
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `uv run --locked --directory ${ENGINE_DIR} python -m chatcore.api --bot bots/sample --embedder hashing --min-f1 0 `
        + `--artifacts ${resolve(".e2e/artifacts")} --port 8766`,
      url: `${ENGINE}/healthz`,
      timeout: 180_000,
      reuseExistingServer: false,
      stdout: "pipe",
      env: { CHATCORE_DATABASE_URL: "" },
    },
    { command: "node e2e/static-server.mjs", url: `${WIDGET}/chat.html`, reuseExistingServer: false, env: { ROOT: "dist", PORT: "5180" } },
    { command: "node e2e/static-server.mjs", url: `${SITE}/index.html`, reuseExistingServer: false, env: { ROOT: "e2e/site", PORT: "5181" } },
  ],
});
