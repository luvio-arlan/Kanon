import { spawnSync } from "node:child_process";

/**
 * AI Golden Eval & Production FTS Retrieval Regression Runner (Wave R4 + U0-12).
 * - `--offline`: Scorer self-check + production PGlite GIN FTS recall + IC grounding/injection suite.
 * - `--live`: Fails closed if no LLM API key is present; never silently downgrades to offline.
 */
const args = process.argv.slice(2);
const wantsLive = args.includes("--live");
const offline = args.includes("--offline") || !wantsLive;

if (wantsLive && !process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY) {
  process.stderr.write(
    "[kanon eval:live] FAIL: GEMINI_API_KEY or OPENAI_API_KEY is required for live eval (refusing silent offline downgrade).\n",
  );
  process.exit(1);
}

const banner = offline
  ? "[kanon eval] 评分器自检 + 生产 FTS 召回与 AI IC 防御回归 (offline scorer self-check + PGlite GIN FTS)..."
  : "[kanon eval:live] 在线 AI IC 准确率评测 + 生产 FTS 召回回归 (live)...";
process.stdout.write(`${banner}\n`);

const res = spawnSync(
  "pnpm",
  [
    "--filter",
    "@kanon/ai",
    "exec",
    "vitest",
    "run",
    "src/retrieval/golden-eval.test.ts",
    "src/retrieval/fts-recall.test.ts",
    "src/agent/ai-ic-v2.test.ts",
  ],
  {
    stdio: "inherit",
    env: { ...process.env, KANON_EVAL_MODE: offline ? "offline" : "live" },
  },
);

if (res.status !== 0) {
  process.exit(res.status ?? 1);
}
process.stdout.write(
  offline
    ? "[kanon eval] PASS: 评分器自检 + PGlite GIN FTS Recall@6 生产检索 + IC 门禁通过。\n"
    : "[kanon eval:live] PASS: 在线 IC 评测 + PGlite GIN FTS Recall@6 门禁通过。\n",
);
