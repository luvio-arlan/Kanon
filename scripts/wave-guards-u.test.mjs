#!/usr/bin/env node
/**
 * Adversarial negative + positive tests for Wave U L2 AST/garden guards (G21, G22, G23, G25, G27, G29, G30).
 * Every guard MUST catch >= 3 bypass patterns and MUST NOT false-positive on valid code.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  checkG21NoFabricatedNumericFallbackAst,
  checkG22PeriodicFilingsGatewayAst,
  checkG23NavSplitBasisAst,
  checkG25JobOnceAfterGatewayAst,
  checkG27EvalProductionPath,
  checkG29MoneyCurrencyExplicitAst,
  checkG30EntryExportProdCallers,
} from "./wave-guards-u.mjs";

function expectCaught(fn, expectedRule, label) {
  const errors = [];
  fn(errors);
  assert.ok(
    errors.some((e) => e.includes(expectedRule)),
    `[${label}] Expected ${expectedRule} to fire, got: ${JSON.stringify(errors)}`,
  );
}

function expectClean(fn, label) {
  const errors = [];
  fn(errors);
  assert.equal(errors.length, 0, `[${label}] Unexpected guard errors: ${JSON.stringify(errors)}`);
}

// G21 negative examples (3) + positive
expectCaught(
  (e) =>
    checkG21NoFabricatedNumericFallbackAst(
      "packages/core/src/math/attribution/decision-matrix.ts",
      "const beta = pitBeta ?? 1;",
      e,
    ),
  "G21-no-fabricated-numeric-fallback",
  "G21 identifier ?? nonZero",
);
expectCaught(
  (e) =>
    checkG21NoFabricatedNumericFallbackAst(
      "packages/core/src/math/risk/covariance.ts",
      "const w = computeVol(x) || 0.25;",
      e,
    ),
  "G21-no-fabricated-numeric-fallback",
  "G21 call || numeric",
);
expectCaught(
  (e) =>
    checkG21NoFabricatedNumericFallbackAst(
      "packages/core/src/math/risk/covariance.ts",
      "const arr = new Array(n).fill(1);",
      e,
    ),
  "G21-no-fabricated-numeric-fallback",
  "G21 .fill(nonZero)",
);
expectClean(
  (e) =>
    checkG21NoFabricatedNumericFallbackAst(
      "packages/core/src/math/risk/covariance.ts",
      "const minDays = params.minDays ?? 60; const v = vols[i] ?? 1; const zeros = new Array(n).fill(0);",
      e,
    ),
  "G21 clean config default, index narrowing, and zero fill",
);

// G22 negative examples (3) + positive
expectCaught(
  (e) =>
    checkG22PeriodicFilingsGatewayAst(
      "apps/web/src/app/api/sec/[ticker]/redline/route.ts",
      "const rows = await listFilingsBySecurity(tx, ticker, 20);",
      e,
    ),
  "G22-periodic-filings-gateway",
  "G22 listFilingsBySecurity in api/sec",
);
expectCaught(
  (e) =>
    checkG22PeriodicFilingsGatewayAst(
      "packages/core/src/db/repositories/intel/redline-store.ts",
      "const rows = await listFilingsBySecurity(db, ticker, 10);",
      e,
    ),
  "G22-periodic-filings-gateway",
  "G22 listFilingsBySecurity in repositories/intel",
);
expectCaught(
  (e) =>
    checkG22PeriodicFilingsGatewayAst(
      "apps/web/src/app/api/_lib/sec-warehouse-sync.ts",
      "for (const f of snapshot.filings.slice(0, 10)) { await upsertFiling(tx, f); }",
      e,
    ),
  "G22-periodic-filings-gateway",
  "G22 snapshot.filings.slice(0, 10) truncation",
);
expectClean(
  (e) =>
    checkG22PeriodicFilingsGatewayAst(
      "apps/web/src/app/api/sec/[ticker]/redline/route.ts",
      "const rows = await listPeriodicFilingsBySecurity(tx, ticker, 20);",
      e,
    ),
  "G22 clean listPeriodicFilingsBySecurity",
);

// G23 negative examples (3) + positive
expectCaught(
  (e) =>
    checkG23NavSplitBasisAst(
      "packages/core/src/math/performance/nav-helpers.ts",
      "h.shares *= splitRatio;",
      e,
    ),
  "G23-price-basis-ground-truth",
  "G23 h.shares *= in nav-helpers",
);
expectCaught(
  (e) =>
    checkG23NavSplitBasisAst(
      "packages/core/src/math/performance/nav-series.ts",
      "shares *= 10;",
      e,
    ),
  "G23-price-basis-ground-truth",
  "G23 shares *= in nav-series",
);
expectCaught(
  (e) =>
    checkG23NavSplitBasisAst(
      "packages/core/src/math/performance/nav-helpers.ts",
      "applySplitsForHolding(h, splits);",
      e,
    ),
  "G23-price-basis-ground-truth",
  "G23 applySplitsForHolding banned",
);
expectClean(
  (e) =>
    checkG23NavSplitBasisAst(
      "packages/core/src/math/performance/nav-series.ts",
      "const mv = basisAdjustedShares * bar.close;",
      e,
    ),
  "G23 clean split-basis valuation",
);

// G25 negative examples (3) + positive
expectCaught(
  (e) =>
    checkG25JobOnceAfterGatewayAst(
      "apps/web/src/app/api/sec/[ticker]/redline/route.ts",
      'import { after } from "next/server"; after(() => {});',
      e,
    ),
  "G25-job-once-after-gateway",
  "G25 direct after() import outside job-once.ts",
);
expectCaught(
  (e) =>
    checkG25JobOnceAfterGatewayAst(
      "apps/web/src/app/api/theses/route.ts",
      'import { after as runBg } from "next/server";',
      e,
    ),
  "G25-job-once-after-gateway",
  "G25 aliased after import outside job-once.ts",
);
expectCaught(
  (e) =>
    checkG25JobOnceAfterGatewayAst(
      "apps/web/src/app/api/_lib/sec-warehouse-sync.ts",
      "const id = `build_redline:$" + "{acc}`;",
      e,
    ),
  "G25-job-once-after-gateway",
  "G25 build_redline job key missing section suffix",
);
expectClean(
  (e) =>
    checkG25JobOnceAfterGatewayAst(
      "apps/web/src/app/api/internal/jobs/tick/job-once.ts",
      'import { after } from "next/server"; const id = `build_redline:$' +
        "{acc}:$" +
        "{sec}`; after(() => id);",
      e,
    ),
  "G25 clean job-once.ts and section-qualified build_redline key",
);

// G29 negative examples (3) + positive
expectCaught(
  (e) =>
    checkG29MoneyCurrencyExplicitAst(
      "apps/web/src/features/valuation/components/drivers/sotp-sec-import.tsx",
      "const label = `$${val}B`;",
      e,
    ),
  "G29-money-currency-explicit",
  "G29 template literal dollar prefix",
);
expectCaught(
  (e) =>
    checkG29MoneyCurrencyExplicitAst(
      "apps/web/src/features/portfolio/components/compare-theses-sheet.tsx",
      "export function X() { return <div>$" + "{price}</div>; }",
      e,
    ),
  "G29-money-currency-explicit",
  "G29 JSX dollar prefix",
);
expectCaught(
  (e) =>
    checkG29MoneyCurrencyExplicitAst(
      "apps/web/src/features/cockpit/components/overlays/ledger-sheet-parts.tsx",
      'const lbl = "成本 ($)";',
      e,
    ),
  "G29-money-currency-explicit",
  "G29 string literal ($)",
);
expectClean(
  (e) =>
    checkG29MoneyCurrencyExplicitAst(
      "apps/web/src/features/portfolio/components/compare-theses-sheet.tsx",
      "const label = `$" + "{pct.toFixed(1)}%`; const money = formatMoney(val, currency);",
      e,
    ),
  "G29 clean template interpolation and formatMoney",
);

// G27 & G30 temporary workspace adversarial fixtures (3+ negatives + positive)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kanon-g27-g30-"));
try {
  // G27 neg 1: eval:live contains --offline
  fs.mkdirSync(path.join(tmp, ".github/workflows"), { recursive: true });
  fs.mkdirSync(path.join(tmp, "packages/ai/src/retrieval"), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, "package.json"),
    JSON.stringify({ scripts: { "eval:live": "node run.mjs --offline" } }),
  );
  fs.writeFileSync(path.join(tmp, ".github/workflows/golden-eval-nightly.yml"), "run: pnpm eval\n");
  fs.writeFileSync(path.join(tmp, "packages/ai/src/retrieval/a.test.ts"), "export const x = 1;\n");
  const g27Errs = [];
  checkG27EvalProductionPath(tmp, g27Errs);
  assert.equal(g27Errs.length, 3, `G27 expected 3 violations, got: ${JSON.stringify(g27Errs)}`);

  // G27 positive
  fs.writeFileSync(
    path.join(tmp, "package.json"),
    JSON.stringify({ scripts: { "eval:live": "node run.mjs --live" } }),
  );
  fs.writeFileSync(
    path.join(tmp, ".github/workflows/golden-eval-nightly.yml"),
    "run: pnpm eval:live\n",
  );
  fs.writeFileSync(
    path.join(tmp, "packages/ai/src/retrieval/fts-recall.test.ts"),
    "import { searchFilingChunksFts } from '@kanon/core/db';\n",
  );
  expectClean((e) => checkG27EvalProductionPath(tmp, e), "G27 clean eval config");

  // G30 neg (3): dead exports in core, core/db, ai + positive caller
  fs.mkdirSync(path.join(tmp, "packages/core/src/db"), { recursive: true });
  fs.mkdirSync(path.join(tmp, "packages/ai/src"), { recursive: true });
  fs.mkdirSync(path.join(tmp, "apps/web/src/app"), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, "packages/core/src/dead.ts"),
    "export function deadCoreFn() { return 1; }\nexport function liveCoreFn() { return 2; }\n",
  );
  fs.writeFileSync(path.join(tmp, "packages/core/src/index.ts"), 'export * from "./dead";\n');
  fs.writeFileSync(
    path.join(tmp, "packages/core/src/db/repo.ts"),
    "export function deadDbFn() { return 1; }\n",
  );
  fs.writeFileSync(path.join(tmp, "packages/core/src/db/index.ts"), 'export * from "./repo";\n');
  fs.writeFileSync(
    path.join(tmp, "packages/ai/src/helper.ts"),
    "export function deadAiFn() { return 1; }\n",
  );
  fs.writeFileSync(path.join(tmp, "packages/ai/src/index.ts"), 'export * from "./helper";\n');
  fs.writeFileSync(
    path.join(tmp, "apps/web/src/app/page.ts"),
    'import { liveCoreFn } from "@kanon/core"; export const v = liveCoreFn();\n',
  );
  const g30Errs = [];
  checkG30EntryExportProdCallers(tmp, g30Errs);
  assert.equal(g30Errs.length, 3, `G30 expected 3 dead exports, got: ${JSON.stringify(g30Errs)}`);
  assert.ok(!g30Errs.some((e) => e.includes("liveCoreFn")), "G30 must not flag called liveCoreFn");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

process.stdout.write(
  "✓ wave-guards-u.test.mjs: all G21, G22, G23, G25, G27, G29 & G30 adversarial fixtures caught and clean examples passed.\n",
);
