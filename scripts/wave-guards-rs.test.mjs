#!/usr/bin/env node
/**
 * Adversarial negative + positive tests for Wave R/S/T L2 AST guards (G6+, G13, ...).
 * Every guard MUST catch >= 3 bypass patterns and MUST NOT false-positive on valid code.
 */
import assert from "node:assert/strict";
import {
  checkG6PlusValuationLiteralsAst,
  checkG9DbProvenanceAst,
  checkG10NoNetworkInDbTxAst,
  checkG12SystemContextAllowlistAst,
  checkG13SecFetchGatewayAst,
} from "./wave-guards-rs.mjs";

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

// G6+ negative examples (3+)
expectCaught(
  (e) =>
    checkG6PlusValuationLiteralsAst(
      "apps/web/src/features/valuation/components/drivers/sotp.tsx",
      "const seg = { metricValueB: 5, baseMultiple: 18 };",
      e,
    ),
  "G6-plus-no-fabricated-valuation-literals",
  "G6+ object literal fabricated SOTP segment",
);
expectCaught(
  (e) =>
    checkG6PlusValuationLiteralsAst(
      "apps/web/src/features/valuation/components/drivers/linked.tsx",
      "deriveDefaultLinkedDrivers({ baseRevCagrPct: 14, baseOperatingMarginPct: rev ? op / rev : 28 });",
      e,
    ),
  "G6-plus-no-fabricated-valuation-literals",
  "G6+ object literal & ternary numeric fallback in linked model",
);
expectCaught(
  (e) =>
    checkG6PlusValuationLiteralsAst(
      "apps/web/src/features/valuation/components/drivers/band.tsx",
      "const pos = b.percentileRank !== null ? b.percentileRank : 50;",
      e,
    ),
  "G6-plus-no-fabricated-valuation-literals",
  "G6+ ternary numeric fallback for missing percentileRank",
);
expectCaught(
  (e) =>
    checkG6PlusValuationLiteralsAst(
      "apps/web/src/features/valuation/components/drivers/band.tsx",
      "const pos = b.percentileRank ?? 50;",
      e,
    ),
  "G6-plus-no-fabricated-valuation-literals",
  "G6+ nullish numeric fallback for missing percentileRank",
);

// G6+ positive example
expectClean(
  (e) =>
    checkG6PlusValuationLiteralsAst(
      "apps/web/src/features/valuation/components/drivers/sotp.tsx",
      "const seg = { metricValueB: null, baseMultiple: null, step: 1 }; const pos = b.percentileRank !== null ? Math.max(4, b.percentileRank) : null;",
      e,
    ),
  "G6+ clean nullable defaults",
);

// G13 negative examples (3)
expectCaught(
  (e) =>
    checkG13SecFetchGatewayAst(
      "packages/ai/src/sec/custom.ts",
      "await fetch('https://data.sec.gov/submissions/CIK0001045810.json');",
      e,
    ),
  "G13-sec-fetch-gateway",
  "G13 direct fetch to data.sec.gov",
);
expectCaught(
  (e) =>
    checkG13SecFetchGatewayAst(
      "apps/web/src/app/api/sec/custom/route.ts",
      "const url = `https://www.sec.gov/files/company_tickers.json`; await globalThis.fetch(url);",
      e,
    ),
  "G13-sec-fetch-gateway",
  "G13 indirect variable fetch to www.sec.gov",
);
expectCaught(
  (e) =>
    checkG13SecFetchGatewayAst(
      "packages/ai/src/sec/reader.ts",
      "await fetchImpl('https://www.sec.gov/Archives/edgar/data/1045810/0001/doc.htm');",
      e,
    ),
  "G13-sec-fetch-gateway",
  "G13 fetchImpl bypass to www.sec.gov",
);

// G13 positive example
expectClean(
  (e) =>
    checkG13SecFetchGatewayAst(
      "packages/ai/src/sec/edgar-client.ts",
      "const docUrl = 'https://www.sec.gov/Archives/edgar/data/1/2/a.htm'; await fetchSecWithRetry('https://data.sec.gov/submissions/CIK0001045810.json', { timeoutMs: 7000 });",
      e,
    ),
  "G13 clean fetchSecWithRetry & URL constant",
);

// G9 negative examples (3+)
expectCaught(
  (e) =>
    checkG9DbProvenanceAst(
      "apps/web/src/app/api/theses/route.ts",
      'import { getKanonDb as g } from "@kanon/core/db"; export async function GET() { return g(); }',
      e,
    ),
  "G9-kanon-db-provenance",
  "G9 aliased getKanonDb import",
);
expectCaught(
  (e) =>
    checkG9DbProvenanceAst(
      "apps/web/src/app/api/theses/route.ts",
      'import * as kdb from "@kanon/core/db"; export async function GET() { return kdb.getKanonDb(); }',
      e,
    ),
  "G9-kanon-db-provenance",
  "G9 namespace member getKanonDb access",
);
expectCaught(
  (e) =>
    checkG9DbProvenanceAst(
      "apps/web/src/app/api/theses/route.ts",
      'import { listTheses } from "@kanon/core/db"; export async function GET() { return listTheses(db, "u1"); }',
      e,
    ),
  "G9-kanon-db-provenance",
  "G9 route imports @kanon/core/db without withDb/withUserDb/withSystemDb",
);
expectCaught(
  (e) =>
    checkG9DbProvenanceAst(
      "packages/core/src/db/repositories/thesis-queries.ts",
      'import { getKanonDb } from "../client"; export async function bad() { return getKanonDb(); }',
      e,
    ),
  "G9-kanon-db-provenance",
  "G9 repository calling getKanonDb",
);
expectClean(
  (e) =>
    checkG9DbProvenanceAst(
      "apps/web/src/app/api/theses/route.ts",
      'import { listTheses } from "@kanon/core/db"; export async function GET() { return auth.withDb((tx) => listTheses(tx, "u1")); }',
      e,
    ),
  "G9 clean route using auth.withDb",
);

// G10 negative examples (3+)
expectCaught(
  (e) =>
    checkG10NoNetworkInDbTxAst(
      "apps/web/src/app/api/sec/[ticker]/route.ts",
      'import { fetchSecEdgarWithPitFacts as fetchSec } from "@kanon/ai"; auth.withDb(async (tx) => { await fetchSec("NVDA"); });',
      e,
    ),
  "G10-no-network-in-db-tx",
  "G10 aliased @kanon/ai call inside withDb",
);
expectCaught(
  (e) =>
    checkG10NoNetworkInDbTxAst(
      "apps/web/src/app/api/internal/jobs/tick/route.ts",
      'withSystemDb("cron_tick", async (tx) => { const run = async () => fetch("https://example.com"); await run(); });',
      e,
    ),
  "G10-no-network-in-db-tx",
  "G10 nested arrow calling fetch inside withSystemDb",
);
expectCaught(
  (e) =>
    checkG10NoNetworkInDbTxAst(
      "apps/web/src/app/api/theses/route.ts",
      "auth.withDb(async (tx) => { after(() => sync()); });",
      e,
    ),
  "G10-no-network-in-db-tx",
  "G10 after() inside withDb",
);
expectClean(
  (e) =>
    checkG10NoNetworkInDbTxAst(
      "apps/web/src/app/api/ai/copilot/route.ts",
      'import { runThesisCopilot } from "@kanon/ai"; const data = await auth.withDb((tx) => getThesisById(tx, id)); const res = await runThesisCopilot(data);',
      e,
    ),
  "G10 clean 3-phase split outside DB tx",
);

// G12 negative examples (4)
expectCaught(
  (e) =>
    checkG12SystemContextAllowlistAst(
      "apps/web/src/app/api/health/route.ts",
      'const reason = "health"; withSystemDb(reason, (tx) => pingKanonDb(tx));',
      e,
    ),
  "G12-system-context-allowlist",
  "G12 non-literal reason variable",
);
expectCaught(
  (e) =>
    checkG12SystemContextAllowlistAst(
      "apps/web/src/app/api/theses/route.ts",
      'withSystemDb("cron_tick", (tx) => listTheses(tx));',
      e,
    ),
  "G12-system-context-allowlist",
  "G12 unapproved file calling withSystemDb",
);
expectCaught(
  (e) =>
    checkG12SystemContextAllowlistAst(
      "apps/web/src/app/api/theses/route.ts",
      "await tx.execute(sql`SELECT set_config('kanon.system', 'on', true)`);",
      e,
    ),
  "G12-system-context-allowlist",
  "G12 raw set_config('kanon.system') in route",
);
expectCaught(
  (e) =>
    checkG12SystemContextAllowlistAst(
      "apps/web/src/app/api/market/refresh-prices/route.ts",
      'auth.withDb((tx) => updateThesisPriceByTicker(tx, "NVDA", 120));',
      e,
    ),
  "G12-system-context-allowlist",
  "G12 system-only helper called outside withSystemDb",
);
expectClean(
  (e) =>
    checkG12SystemContextAllowlistAst(
      "apps/web/src/app/api/internal/jobs/tick/route.ts",
      'withSystemDb("cron_tick", (tx) => enqueueWatchlistJobs(tx, "2026-11-27"));',
      e,
    ),
  "G12 allowlisted cron_tick system helper",
);

process.stdout.write(
  "✓ wave-guards-rs.test.mjs: all G6+, G9, G10, G12 & G13 adversarial fixtures caught and clean examples passed.\n",
);
