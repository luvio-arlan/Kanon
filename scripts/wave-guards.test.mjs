#!/usr/bin/env node
/**
 * Adversarial negative-example tests for L2 AST guards G1–G8.
 * Every known bypass pattern MUST be caught; if any guard weakens, CI turns red immediately.
 */
import assert from "node:assert/strict";
import {
  checkG1ClientNetworkAst,
  checkG2ApiNumberParseAst,
  checkG6FinancialHonestyAst,
  checkG7ApiCapabilityGuard,
  checkRepoAst,
} from "./wave-guards.mjs";

function expectCaught(fn, expectedRule, label) {
  const errors = [];
  fn(errors);
  assert.ok(
    errors.some((e) => e.includes(expectedRule)),
    `[${label}] Expected ${expectedRule} to fire, got: ${JSON.stringify(errors)}`,
  );
}

// G1 negative examples (aliased fetch, bracket access, .call, XHR, EventSource, sendBeacon)
expectCaught(
  (e) => checkG1ClientNetworkAst("apps/web/src/features/a.ts", "const f = fetch; f('/api/x');", e),
  "G1-no-raw-fetch-in-features",
  "G1 aliased fetch",
);
expectCaught(
  (e) => checkG1ClientNetworkAst("apps/web/src/features/a.ts", "window['fetch']('/api/x');", e),
  "G1-no-raw-fetch-in-features",
  "G1 bracket fetch",
);
expectCaught(
  (e) =>
    checkG1ClientNetworkAst("apps/web/src/shared/a.ts", "fetch.call(globalThis, '/api/x');", e),
  "G1-no-raw-fetch-in-features",
  "G1 fetch.call",
);
expectCaught(
  (e) =>
    checkG1ClientNetworkAst("apps/web/src/app/page.tsx", "'use client'; new XMLHttpRequest();", e),
  "G1-no-raw-fetch-in-features",
  "G1 XHR in app use-client",
);
expectCaught(
  (e) =>
    checkG1ClientNetworkAst("apps/web/src/features/a.ts", "new EventSource('/api/stream');", e),
  "G1-no-raw-fetch-in-features",
  "G1 EventSource",
);

// G2 negative examples (Number, parseFloat, unary +)
expectCaught(
  (e) =>
    checkG2ApiNumberParseAst("apps/web/src/app/api/x/route.ts", "const v = Number(data.qty);", e),
  "G2-no-raw-number-parse-in-api",
  "G2 Number(data.x)",
);
expectCaught(
  (e) =>
    checkG2ApiNumberParseAst(
      "apps/web/src/app/api/x/route.ts",
      "const v = parseFloat(body.price);",
      e,
    ),
  "G2-no-raw-number-parse-in-api",
  "G2 parseFloat(body.x)",
);
expectCaught(
  (e) =>
    checkG2ApiNumberParseAst(
      "apps/web/src/app/api/x/route.ts",
      "const v = +searchParams.get('n');",
      e,
    ),
  "G2-no-raw-number-parse-in-api",
  "G2 unary + searchParams",
);

// G4 negative examples (aliased table, userTotpFactorsTable, missing tenant filter)
const sampleTenantTables = new Set(["thesesTable", "userTotpFactorsTable", "lotsTable"]);
expectCaught(
  (e) =>
    checkRepoAst(
      "packages/core/src/db/repositories/a.ts",
      "const t = thesesTable; db.update(t).set({ status: 'active' }).where(eq(t.id, id));",
      sampleTenantTables,
      e,
    ),
  "G4-repo-update-tenant-filter",
  "G4 aliased table without tenant filter",
);
expectCaught(
  (e) =>
    checkRepoAst(
      "packages/core/src/db/repositories/a.ts",
      "db.delete(userTotpFactorsTable).where(eq(userTotpFactorsTable.enabled, true));",
      sampleTenantTables,
      e,
    ),
  "G4-repo-update-tenant-filter",
  "G4 real userTotpFactorsTable without userId",
);
expectCaught(
  (e) =>
    checkRepoAst(
      "packages/core/src/db/repositories/a.ts",
      "db.update(lotsTable).set({ remainingQty: 0 }).where(eq(lotsTable.id, lotId));",
      sampleTenantTables,
      e,
    ),
  "G4-repo-update-tenant-filter",
  "G4 lotsTable without tenant key",
);

// G5 negative example (2 writes outside runInTransaction)
expectCaught(
  (e) =>
    checkRepoAst(
      "packages/core/src/db/repositories/workflows/portfolio-ledger-store.ts",
      "export async function bad(db) { await db.insert(a).values({}); await db.update(b).set({}); }",
      sampleTenantTables,
      e,
    ),
  "G5-repo-multi-write-transaction",
  "G5 two writes outside runInTransaction",
);

// G6 negative examples (0 fallback, magic 18/20 fallback, circular price * shares)
expectCaught(
  (e) =>
    checkG6FinancialHonestyAst(
      "apps/web/src/features/valuation/a.ts",
      "const cagr = dr.revenueCagrPct ?? 18;",
      e,
    ),
  "G6-no-invented-financial-fallbacks",
  "G6 ?? 18 CAGR fallback",
);
expectCaught(
  (e) =>
    checkG6FinancialHonestyAst(
      "apps/web/src/features/valuation/a.ts",
      "const m = dr.ownerFcfMultipleBase ?? 20;",
      e,
    ),
  "G6-no-invented-financial-fallbacks",
  "G6 ?? 20 multiple fallback",
);
expectCaught(
  (e) =>
    checkG6FinancialHonestyAst(
      "apps/web/src/features/valuation/a.ts",
      "const fcf = (price * sharesM) / 22_000;",
      e,
    ),
  "G6-no-invented-financial-fallbacks",
  "G6 circular price*shares FCF synthesis",
);

// G7+ & G8 negative + positive examples
expectCaught(
  (e) =>
    checkG7ApiCapabilityGuard(
      "apps/web/src/app/api/theses/[id]/discipline/route.ts",
      "export async function POST() { const t = await getThesisById(db, id, uid); return ok(t); }",
      e,
    ),
  "G7-api-route-capability-guard",
  "G7+ POST without requireThesisAccess",
);
expectCaught(
  (e) =>
    checkG7ApiCapabilityGuard(
      "apps/web/src/app/api/theses/[id]/guidance/route.ts",
      'export async function POST() { /* requireThesisAccess(db, id, uid, "write", 0) */ return ok(); }',
      e,
    ),
  "G7-api-route-capability-guard",
  "G7+ comment bypass",
);
expectCaught(
  (e) =>
    checkG7ApiCapabilityGuard(
      "apps/web/src/app/api/ai/agent/apply/route.ts",
      'export async function POST() { await requireThesisAccess(tx, id, uid, "read", 0); return ok(); }',
      e,
    ),
  "G7-api-route-capability-guard",
  "G7+ POST using read capability",
);
expectCaught(
  (e) =>
    checkG7ApiCapabilityGuard(
      "apps/web/src/app/api/theses/[id]/ic/route.ts",
      "export async function POST() { const cap = 'write'; await requireThesisAccess(tx, id, uid, cap, 0); return ok(); }",
      e,
    ),
  "G7-api-route-capability-guard",
  "G7+ capability passed via variable",
);
expectCaught(
  (e) =>
    checkG7ApiCapabilityGuard(
      "apps/web/src/app/api/theses/[id]/route.ts",
      'export async function DELETE() { await requireThesisAccess(tx, id, uid, "write", 0); return ok(); }',
      e,
    ),
  "G7-api-route-capability-guard",
  "G7+ DELETE thesis using write capability",
);
const g7CleanErrors = [];
checkG7ApiCapabilityGuard(
  "apps/web/src/app/api/theses/[id]/route.ts",
  'export async function GET() { await requireThesisAccess(tx, id, uid, "read", 0); } export async function PATCH() { await requireThesisAccess(tx, id, uid, "write", 0); } export async function DELETE() { await requireThesisAccess(tx, id, uid, "delete", 0); }',
  g7CleanErrors,
);
assert.equal(g7CleanErrors.length, 0, `G7+ clean route failed: ${JSON.stringify(g7CleanErrors)}`);
expectCaught(
  (e) =>
    checkRepoAst(
      "packages/core/src/db/repositories/thesis/thesis-access.ts",
      "export async function assertThesisOwnership() { return true; }",
      sampleTenantTables,
      e,
    ),
  "G8-no-misleading-ownership-symbol",
  "G8 assertThesisOwnership banned",
);

process.stdout.write(
  "✓ wave-guards.test.mjs: all 21 adversarial bypass fixtures caught by G1–G8 (incl. G7+).\n",
);
