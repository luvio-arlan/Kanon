import fs from "node:fs";
import path from "node:path";

const RAW_FETCH_ALLOWLIST = new Set(["apps/web/src/features/thesis/hooks/agent-sse-stream.ts"]);

const REQUIRED_PROD_ENGINES = [
  "calculateBeneishMScore",
  "calculateAltmanZScore",
  "calculatePiotroskiFScore",
  "calculateDuPontDecomposition",
  "calculateWacc",
  "getFactsAsOf",
  "detectFactRestatements",
  "hybridSearchChunks",
  "searchFilingChunksLexical",
  "scanFilingRedFlags",
  "enqueueJob",
  "evaluateAlertRules",
  "addOrgMember",
];

const TENANT_TABLES_RE =
  /\.(?:update|delete)\(\s*(?:thesesTable|portfolioAccountsTable|forecastsTable|inboxItemsTable|alertRulesTable|icApprovalsTable|userAiCredentialsTable|userTotpTable)\s*\)/;
const TENANT_KEY_RE =
  /userId|thesisId|orgId|accountId|user_id|thesis_id|org_id|account_id|@kanon-tenant-checked/;

const INVENTED_FALLBACK_RE =
  /\?\.(?:revenue|totalDebt|cashAndEquiv|dilutedShares)\s*(?:\?\?|\|\||\?[^:\n]{1,60}:\s*[1-9]\d*)/;

function walkTsFiles(dirPath, results) {
  if (!fs.existsSync(dirPath)) return;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === "dist") continue;
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) walkTsFiles(full, results);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      results.push(full);
    }
  }
}

function inspectWebLine(rel, line, lineNo, errors) {
  const inFeatures = rel.startsWith("apps/web/src/features/");
  if (inFeatures && !RAW_FETCH_ALLOWLIST.has(rel) && /\bfetch\s*\(/.test(line)) {
    errors.push(`${rel}:${lineNo} [G1-no-raw-fetch-in-features] Use kanonFetch with Zod schema.`);
  }
  if (rel.startsWith("apps/web/src/app/api/") && /Number\((?:rec|raw|body)\./.test(line)) {
    errors.push(
      `${rel}:${lineNo} [G2-no-raw-number-parse-in-api] Validate API input via @kanon/core Zod schema.`,
    );
  }
  const inModelUi =
    rel.startsWith("apps/web/src/features/valuation/") ||
    rel.startsWith("apps/web/src/features/journal/");
  if (inModelUi && INVENTED_FALLBACK_RE.test(line)) {
    errors.push(
      `${rel}:${lineNo} [G6-no-invented-financial-fallbacks] Never substitute arbitrary numeric fallbacks for missing financial base fields.`,
    );
  }
}

function checkG1G2G6(root, errors) {
  const webFiles = [];
  walkTsFiles(path.join(root, "apps/web/src"), webFiles);
  for (const full of webFiles) {
    const rel = path.relative(root, full).split(path.sep).join("/");
    const lines = fs.readFileSync(full, "utf8").split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      inspectWebLine(rel, lines[i] ?? "", i + 1, errors);
    }
  }
}

function checkG3Reachability(root, errors) {
  const prodFiles = [];
  walkTsFiles(path.join(root, "apps/web/src"), prodFiles);
  walkTsFiles(path.join(root, "packages/ai/src"), prodFiles);
  const corpus = prodFiles
    .filter((f) => !f.endsWith(`${path.sep}index.ts`))
    .map((f) => fs.readFileSync(f, "utf8"))
    .join("\n");
  for (const sym of REQUIRED_PROD_ENGINES) {
    if (!new RegExp(`\\b${sym}\\b`).test(corpus)) {
      errors.push(
        `packages/core:1 [G3-production-engine-reachability] Core engine "${sym}" has zero production callers in apps/web/src or packages/ai/src.`,
      );
    }
  }
}

function inspectRepoFile(rel, content, errors) {
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    if (!TENANT_TABLES_RE.test(lines[i] ?? "")) continue;
    const windowText = lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 12)).join("\n");
    if (!TENANT_KEY_RE.test(windowText)) {
      errors.push(
        `${rel}:${i + 1} [G4-repo-update-tenant-filter] Tenant table mutation must filter by userId/thesisId/orgId/accountId.`,
      );
    }
  }
  const requiresTx =
    rel.endsWith("portfolio-ledger-store.ts") || rel.endsWith("ic-and-compliance-store.ts");
  if (requiresTx && !content.includes("runInTransaction")) {
    errors.push(
      `${rel}:1 [G5-repo-multi-write-transaction] Multi-write ledger/IC mutations must execute inside runInTransaction.`,
    );
  }
}

function checkG4G5Repositories(root, errors) {
  const repoFiles = [];
  walkTsFiles(path.join(root, "packages/core/src/db/repositories"), repoFiles);
  for (const full of repoFiles) {
    const rel = path.relative(root, full).split(path.sep).join("/");
    inspectRepoFile(rel, fs.readFileSync(full, "utf8"), errors);
  }
}

/** Runs Wave I–M L2 mechanical guards (G1–G6). */
export function checkWaveGuards(root, errors) {
  checkG1G2G6(root, errors);
  checkG3Reachability(root, errors);
  checkG4G5Repositories(root, errors);
}
