#!/usr/bin/env node
/**
 * Adversarial negative + positive tests for Wave V L2 guards (G32, G33, G34).
 * Every guard MUST catch >= 3 bypass patterns and MUST NOT false-positive on valid code.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  checkG32LiveHealthPostureWatch,
  checkG33LedgerReplayInputSingleSourceAst,
  checkG34NoFabricatedFallbackTernaryAst,
  checkG39TelemetryIsolatedFromJobStateAst,
  checkG41HostedAiQuotaGateAst,
} from "./wave-guards-v.mjs";

function expectCaught(fn, rule, label) {
  const errors = [];
  fn(errors);
  assert.ok(
    errors.some((e) => e.includes(rule)),
    `[${label}] Expected ${rule}, got: ${JSON.stringify(errors)}`,
  );
}

function expectClean(fn, label) {
  const errors = [];
  fn(errors);
  assert.equal(errors.length, 0, `[${label}] Unexpected: ${JSON.stringify(errors)}`);
}

function withTempRepo(files, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kanon-g32-"));
  try {
    for (const [rel, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), text);
    }
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const GOOD_WF =
  "on:\n  schedule:\n    - cron: \"17 * * * *\"\n# jq '.status == \"healthy\"' and '.db.bypassRls == false'\n";
const GOOD_README = "See deploy/rls-provision-app-role.sql\n";

// G32 — 3 negatives + 1 positive
for (const [label, files] of [
  ["no workflow", { "deploy/README.md": GOOD_README }],
  [
    "reachability only",
    { ".github/workflows/health-watch.yml": "on:\n  schedule:\n", "deploy/README.md": GOOD_README },
  ],
  [
    "no provisioning runbook",
    { ".github/workflows/health-watch.yml": GOOD_WF, "deploy/README.md": "x" },
  ],
]) {
  withTempRepo(files, (root) =>
    expectCaught(
      (e) => checkG32LiveHealthPostureWatch(root, e),
      "G32-live-health-posture-watch",
      `G32 ${label}`,
    ),
  );
}
withTempRepo(
  { ".github/workflows/health-watch.yml": GOOD_WF, "deploy/README.md": GOOD_README },
  (root) => expectClean((e) => checkG32LiveHealthPostureWatch(root, e), "G32 clean"),
);

// G33 — 3 negatives + 1 positive
const RISK = "apps/web/src/app/api/portfolio/risk/route.ts";
for (const [label, src] of [
  [
    "map literal",
    "rows.map((t) => ({ id: t.id, fees: t.fees, createdAtMs: t.createdAt.getTime() }));",
  ],
  ["nested route", "const x = { createdAtMs: 1 };"],
  ["spread literal", "const y = { ...row, createdAtMs: Date.now() };"],
]) {
  expectCaught(
    (e) =>
      checkG33LedgerReplayInputSingleSourceAst(
        label === "nested route" ? "apps/web/src/app/api/mcp/v2/tool.ts" : RISK,
        src,
        e,
      ),
    "G33-ledger-replay-input-single-source",
    `G33 ${label}`,
  );
}
expectClean(
  (e) =>
    checkG33LedgerReplayInputSingleSourceAst(
      RISK,
      "const ctx = await loadAnalyticsContextWithFx(withDb, params, route);",
      e,
    ),
  "G33 clean",
);

// G34 — 3 negatives + 1 positive
const NAV = "packages/core/src/math/performance/nav-helpers.ts";
for (const [label, rel, src] of [
  ["numeric ternary", NAV, "const fx = tx.fxToBase && tx.fxToBase > 0 ? tx.fxToBase : 1;"],
  [
    "USD ternary",
    "apps/web/src/app/api/portfolio/performance/route.ts",
    'const b = p.success ? p.data : "USD";',
  ],
  [
    "identity ternary",
    "packages/core/src/db/repositories/workflows/x.ts",
    'const s = row.fxSource ? row.fxSource : "identity";',
  ],
]) {
  expectCaught(
    (e) => checkG34NoFabricatedFallbackTernaryAst(rel, src, e),
    "G34-no-fabricated-fallback-ternary",
    `G34 ${label}`,
  );
}
expectClean(
  (e) =>
    checkG34NoFabricatedFallbackTernaryAst(
      NAV,
      "const k = Math.abs(r) < 1e-12 ? 1 : Math.log1p(r) / r; const t = isPoint ? 0.01 : 0.005; const c = n > 0 ? roundTo(s / n, 2) : 1;",
      e,
    ),
  "G34 clean",
);

// G39 — 3 negatives + 1 positive
const TICK = "apps/web/src/app/api/internal/jobs/tick/tick-runner.ts";
for (const [label, src] of [
  [
    "fail + telemetry",
    "await withSystemDb('cron_tick', async (tx) => { await failJobWithBackoff(tx, id, m); await recordAppErrorEvent(tx, e); });",
  ],
  [
    "complete + telemetry",
    "await withSystemDb('cron_tick', async (tx) => { await recordAppErrorEvent(tx, e); await completeJob(tx, id); });",
  ],
  [
    "skip + telemetry fn",
    "await withSystemDb('cron_tick', async function (tx) { await skipJob(tx, id, r); await recordAppErrorEvent(tx, e); });",
  ],
]) {
  expectCaught(
    (e) => checkG39TelemetryIsolatedFromJobStateAst(TICK, src, e),
    "G39-telemetry-isolated-from-job-state",
    `G39 ${label}`,
  );
}
expectClean(
  (e) =>
    checkG39TelemetryIsolatedFromJobStateAst(
      TICK,
      "await withSystemDb('cron_tick', (tx) => failJobWithBackoff(tx, id, m)); await withSystemDb('cron_tick', (tx) => recordAppErrorEvent(tx, e)).catch(() => undefined);",
      e,
    ),
  "G39 clean",
);

// G41 — 3 negatives + 1 positive
for (const rel of [
  "apps/web/src/app/api/ai/copilot/route.ts",
  "apps/web/src/app/api/ai/agent/route.ts",
  "apps/web/src/app/api/mcp/v2/route.ts",
]) {
  expectCaught(
    (e) =>
      checkG41HostedAiQuotaGateAst(
        rel,
        "const byok = await resolveEffectiveByok(tx, userId, request);",
        e,
      ),
    "G41-hosted-ai-quota-gate",
    `G41 ${rel}`,
  );
}
expectClean(
  (e) =>
    checkG41HostedAiQuotaGateAst(
      "apps/web/src/app/api/ai/copilot/route.ts",
      "const q = await checkHostedAiQuota(withDb, id, request, t); const b = await resolveEffectiveByok(tx, id, request);",
      e,
    ),
  "G41 clean",
);

process.stdout.write(
  "✓ wave-guards-v.test.mjs: all G32, G33, G34, G39 & G41 adversarial fixtures caught and clean examples passed.\n",
);
