import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { defineConfig } from "@playwright/test";

const WEB_DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3151;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const RUN_DIR =
  process.env.KANON_E2E_RUN_DIR ?? fs.mkdtempSync(path.join(os.tmpdir(), "kanon-e2e-"));
process.env.KANON_E2E_RUN_DIR = RUN_DIR;

const DATA_DIR = path.join(RUN_DIR, "pgdata");
const STATE_FILE = path.join(RUN_DIR, "mock-state.json");
const METRICS_FILE = path.join(RUN_DIR, "mock-metrics.json");
const MOCK_LOADER_URL = pathToFileURL(path.join(WEB_DIR, "e2e/support/mock-upstream.mjs")).href;

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(STATE_FILE)) {
  fs.writeFileSync(STATE_FILE, JSON.stringify({ quotes: {} }), "utf8");
}
if (!fs.existsSync(METRICS_FILE)) {
  fs.writeFileSync(METRICS_FILE, JSON.stringify({ counts: {} }), "utf8");
}

function buildWebServerEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) env[k] = v;
  }
  const stripped = [
    "DATABASE_URL",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "GOOGLE_GENERATIVE_AI_API_KEY",
    "DEEPSEEK_API_KEY",
    "OPENROUTER_API_KEY",
  ];
  for (const k of stripped) delete env[k];
  const existingNodeOpts = env.NODE_OPTIONS ? `${env.NODE_OPTIONS} ` : "";
  return {
    ...env,
    PORT: String(PORT),
    KANON_DATA_DIR: DATA_DIR,
    KANON_RLS_ENFORCE_LOCAL: "1",
    NODE_OPTIONS: `${existingNodeOpts}--import ${MOCK_LOADER_URL}`,
    CRON_SECRET: "e2e-cron",
    KANON_SEC_USER_AGENT: "KANON-E2E e2e@example.com",
    KANON_CREDENTIALS_MASTER_KEY: crypto.randomBytes(32).toString("base64"),
    KANON_E2E_RUN_DIR: RUN_DIR,
    KANON_E2E_STATE_FILE: STATE_FILE,
    KANON_E2E_METRICS_FILE: METRICS_FILE,
  };
}

function resolveLocalChromiumExecutable(): string | undefined {
  if (process.env.CI || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  }
  const macChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  return fs.existsSync(macChrome) ? macChrome : undefined;
}

const localChrome = resolveLocalChromiumExecutable();

export default defineConfig({
  testDir: "./e2e/golden",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 900 },
    ...(localChrome ? { launchOptions: { executablePath: localChrome } } : {}),
  },
  webServer: {
    command: `pnpm exec next start -p ${PORT} -H 127.0.0.1`,
    cwd: WEB_DIR,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: buildWebServerEnv(),
  },
});
