import { spawnSync } from "node:child_process";

/**
 * Offline AI Eval & Prompt-Injection Regression Runner (W3.6).
 * Executes deterministic claim-grounding, hybrid retrieval, redline, and prompt-injection tests.
 */
const args = process.argv.slice(2);
const offline = args.includes("--offline") || !process.env.GEMINI_API_KEY;
process.stdout.write(
  `[kanon eval] Running AI IC 2.0 regression suite (${offline ? "offline deterministic replay" : "live"})...\n`,
);

const res = spawnSync(
  "pnpm",
  ["--filter", "@kanon/ai", "exec", "vitest", "run", "src/agent/ai-ic-v2.test.ts"],
  { stdio: "inherit" },
);

if (res.status !== 0) {
  process.exit(res.status ?? 1);
}
process.stdout.write(
  "[kanon eval] PASS: grounding, retrieval, redline & prompt-injection gates verified.\n",
);
