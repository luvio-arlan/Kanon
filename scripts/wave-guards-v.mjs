import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import {
  collectTsFiles,
  extractNumericLiteralValue,
  G21_PREFIXES,
  getLine,
  parseTs,
} from "./wave-guards-u.mjs";

/** G32: a live production health watch must exist and assert the RLS posture, not just reachability. */
export function checkG32LiveHealthPostureWatch(root, errors) {
  const wf = path.join(root, ".github/workflows/health-watch.yml");
  const readme = path.join(root, "deploy/README.md");
  const wfText = fs.existsSync(wf) ? fs.readFileSync(wf, "utf8") : "";
  for (const needle of ["schedule:", '.status == "healthy"', ".db.bypassRls == false"]) {
    if (!wfText.includes(needle)) {
      errors.push(
        `.github/workflows/health-watch.yml [G32-live-health-posture-watch] Missing "${needle}": production health must be watched and fail on degraded or BYPASSRLS posture.`,
      );
    }
  }
  const readmeText = fs.existsSync(readme) ? fs.readFileSync(readme, "utf8") : "";
  if (!readmeText.includes("rls-provision-app-role.sql")) {
    errors.push(
      "deploy/README.md [G32-live-health-posture-watch] Deploy runbook must reference deploy/rls-provision-app-role.sql (NOBYPASSRLS app role).",
    );
  }
}

const G33_PREFIX = "apps/web/src/app/api/";

/** G33: API routes must not hand-build ledger replay inputs; only `toReplayTxInput` maps rows (V0-3). */
export function checkG33LedgerReplayInputSingleSourceAst(rel, content, errors) {
  if (!rel.startsWith(G33_PREFIX)) return;
  const sf = parseTs(rel, content);
  const visit = (node) => {
    if (
      ts.isObjectLiteralExpression(node) &&
      node.properties.some(
        (p) => p.name && ts.isIdentifier(p.name) && p.name.text === "createdAtMs",
      )
    ) {
      errors.push(
        `${rel}:${getLine(sf, node.getStart(sf))} [G33-ledger-replay-input-single-source] Hand-built replay input; use toReplayTxInput / loadPortfolioAnalyticsContext so currency, FX and reversal semantics stay identical.`,
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

const G34_PREFIXES = [
  ...G21_PREFIXES,
  "packages/core/src/db/repositories/workflows/",
  "apps/web/src/app/api/portfolio/",
];
const G34_FABRICATED_STRINGS = new Set(["USD", "identity"]);

function rootIdentifier(node) {
  let cur = node;
  while (ts.isPropertyAccessExpression(cur) || ts.isElementAccessExpression(cur))
    cur = cur.expression;
  return ts.isIdentifier(cur) ? cur.text : null;
}

function conditionMentions(cond, name) {
  let found = false;
  const visit = (n) => {
    if (found) return;
    if (ts.isIdentifier(n) && n.text === name) found = true;
    else ts.forEachChild(n, visit);
  };
  visit(cond);
  return found;
}

/** A guard-shaped ternary: the condition validates the very value returned on the true branch. */
function isGuardedValueTernary(node) {
  const root = rootIdentifier(node.whenTrue);
  return root !== null && conditionMentions(node.condition, root);
}

function isFabricatedFallbackLiteral(node) {
  const num = extractNumericLiteralValue(node);
  if (num !== null) return num !== 0;
  return ts.isStringLiteral(node) && G34_FABRICATED_STRINGS.has(node.text);
}

/** G34: extends G21 to ternary fallbacks (`ok ? x : 1`, `parsed.success ? parsed.data : "USD"`). */
export function checkG34NoFabricatedFallbackTernaryAst(rel, content, errors) {
  if (!G34_PREFIXES.some((p) => rel.startsWith(p))) return;
  const sf = parseTs(rel, content);
  const visit = (node) => {
    if (
      ts.isConditionalExpression(node) &&
      isGuardedValueTernary(node) &&
      isFabricatedFallbackLiteral(node.whenFalse)
    ) {
      errors.push(
        `${rel}:${getLine(sf, node.getStart(sf))} [G34-no-fabricated-fallback-ternary] Fabricated fallback (${node.getText(sf)}); propagate null + explicit status instead.`,
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

const JOB_STATE_CALLS = new Set(["failJobWithBackoff", "completeJob", "skipJob"]);

function calledNames(fnNode) {
  const names = new Set();
  const visit = (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) names.add(n.expression.text);
    ts.forEachChild(n, visit);
  };
  visit(fnNode);
  return names;
}

/** G39: telemetry writes must never share a transaction with job state transitions (V2-3). */
export function checkG39TelemetryIsolatedFromJobStateAst(rel, content, errors) {
  if (!rel.startsWith("apps/web/src/app/api/")) return;
  const sf = parseTs(rel, content);
  const visit = (node) => {
    const isSystemDbCall =
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "withSystemDb";
    const cb = isSystemDbCall ? node.arguments[1] : undefined;
    if (cb && (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb))) {
      const names = calledNames(cb);
      if (names.has("recordAppErrorEvent") && [...JOB_STATE_CALLS].some((n) => names.has(n))) {
        errors.push(
          `${rel}:${getLine(sf, node.getStart(sf))} [G39-telemetry-isolated-from-job-state] recordAppErrorEvent shares a transaction with a job state write; a telemetry failure would roll back the job record.`,
        );
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

/** G41: any route that resolves AI credentials must pass the hosted-AI cost gate first (V2-2). */
export function checkG41HostedAiQuotaGateAst(rel, content, errors) {
  if (!/^apps\/web\/src\/app\/api\/.+\/route\.ts$/.test(rel)) return;
  if (!content.includes("resolveEffectiveByok(")) return;
  if (!content.includes("checkHostedAiQuota(")) {
    errors.push(
      `${rel}:1 [G41-hosted-ai-quota-gate] Route resolves AI credentials without checkHostedAiQuota; hosted server-key spend would be unbounded.`,
    );
  }
}

export function checkWaveGuardsV(root, errors) {
  const files = [];
  for (const dir of ["apps", "packages"]) collectTsFiles(path.join(root, dir), files);
  for (const filePath of files) {
    const rel = path.relative(root, filePath).split(path.sep).join("/");
    const content = fs.readFileSync(filePath, "utf8");
    checkG33LedgerReplayInputSingleSourceAst(rel, content, errors);
    checkG34NoFabricatedFallbackTernaryAst(rel, content, errors);
    checkG39TelemetryIsolatedFromJobStateAst(rel, content, errors);
    checkG41HostedAiQuotaGateAst(rel, content, errors);
  }
  checkG32LiveHealthPostureWatch(root, errors);
}
