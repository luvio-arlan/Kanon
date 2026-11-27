#!/usr/bin/env node
/**
 * Adversarial negative + positive tests for Wave R/S/T L2 AST guards (G6+, G13, ...).
 * Every guard MUST catch >= 3 bypass patterns and MUST NOT false-positive on valid code.
 */
import assert from "node:assert/strict";
import { checkG6PlusValuationLiteralsAst, checkG13SecFetchGatewayAst } from "./wave-guards-rs.mjs";

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

process.stdout.write(
  "✓ wave-guards-rs.test.mjs: all G6+ & G13 adversarial fixtures caught and clean examples passed.\n",
);
