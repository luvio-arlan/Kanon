import { spawnSync } from "node:child_process";

/**
 * Offline AI Golden Eval & Prompt-Injection Regression Runner (Wave R4).
 * Runs the 28-case deterministic Golden Eval scorer + IC grounding/redline/injection tests.
 */
const args = process.argv.slice(2);
const offline = args.includes("--offline") || !process.env.GEMINI_API_KEY;
process.stdout.write(
  `[kanon eval] Running 28-case Golden Eval & AI IC regression suite (${offline ? "offline deterministic replay" : "live"})...\n`,
);

const res = spawnSync(
  "pnpm",
  [
    "--filter",
    "@kanon/ai",
    "exec",
    "vitest",
    "run",
    "src/retrieval/golden-eval.test.ts",
    "src/agent/ai-ic-v2.test.ts",
  ],
  { stdio: "inherit" },
);

if (res.status !== 0) {
  process.exit(res.status ?? 1);
}
process.stdout.write(
  "[kanon eval] PASS: 28-case Golden Eval (CA/NE/RR/FR/Recall@6/IR) & IC gates verified.\n",
);
