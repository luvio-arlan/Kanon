import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const VALUATION_FABRICATED_PROPS = new Set([
  "metricValueB",
  "bearMultiple",
  "baseMultiple",
  "bullMultiple",
  "baseRevCagrPct",
  "baseOperatingMarginPct",
  "sbcPctOfRev",
  "capexPctOfRev",
  "basePe",
  "revenueCagrPct",
  "ownerFcfMultipleBase",
  "baseOwnerFcfB",
]);

const SEC_HOST_RE = /https?:\/\/(?:www|data)\.sec\.gov\b/i;

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

function parseTs(filePath, content) {
  const kind = filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, kind);
}

function getLine(sf, pos) {
  return sf.getLineAndCharacterOfPosition(pos).line + 1;
}

function hasCommentTag(lines, lineNo, tag) {
  return (lines[lineNo - 1] ?? "").includes(tag) || (lines[lineNo - 2] ?? "").includes(tag);
}

function isNumericLit(node) {
  return (
    ts.isNumericLiteral(node) ||
    (ts.isPrefixUnaryExpression(node) && ts.isNumericLiteral(node.operand))
  );
}

function hasNumericBranch(node) {
  if (isNumericLit(node)) return true;
  if (ts.isConditionalExpression(node)) {
    return isNumericLit(node.whenTrue) || isNumericLit(node.whenFalse);
  }
  return false;
}

function readPropName(node) {
  if (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) return node.name.text;
  return null;
}

function inspectG6PlusProp(node, sf, lines, rel, errors) {
  const prop = readPropName(node);
  if (!prop || !VALUATION_FABRICATED_PROPS.has(prop)) return;
  if (!hasNumericBranch(node.initializer)) return;
  const line = getLine(sf, node.getStart(sf));
  if (!hasCommentTag(lines, line, "@kanon-fallback-ok:")) {
    errors.push(
      `${rel}:${line} [G6-plus-no-fabricated-valuation-literals] Property "${prop}" must not use a hardcoded numeric literal or ternary numeric fallback in valuation UI; use null + manual input.`,
    );
  }
}

function isPercentileFallbackNode(node, sf) {
  if (ts.isBinaryExpression(node)) {
    const op = node.operatorToken.kind;
    const isFallbackOp =
      op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.BarBarToken;
    return (
      isFallbackOp && node.left.getText(sf).includes("percentileRank") && isNumericLit(node.right)
    );
  }
  return (
    ts.isConditionalExpression(node) &&
    node.condition.getText(sf).includes("percentileRank") &&
    (isNumericLit(node.whenTrue) || isNumericLit(node.whenFalse))
  );
}

function inspectG6PlusPercentile(node, sf, lines, rel, errors) {
  if (!isPercentileFallbackNode(node, sf)) return;
  const line = getLine(sf, node.getStart(sf));
  if (!hasCommentTag(lines, line, "@kanon-fallback-ok:")) {
    errors.push(
      `${rel}:${line} [G6-plus-no-fabricated-valuation-literals] Never fallback missing percentileRank to a numeric literal; hide marker when null.`,
    );
  }
}

/** G6+: Catches object-literal and ternary numeric fallbacks in valuation UI components. */
export function checkG6PlusValuationLiteralsAst(rel, content, errors) {
  if (!rel.startsWith("apps/web/src/features/valuation/")) return;
  const sf = parseTs(rel, content);
  const lines = content.split("\n");
  const visit = (node) => {
    if (ts.isPropertyAssignment(node)) inspectG6PlusProp(node, sf, lines, rel, errors);
    else if (ts.isBinaryExpression(node) || ts.isConditionalExpression(node)) {
      inspectG6PlusPercentile(node, sf, lines, rel, errors);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

function isDirectFetchCallee(expr) {
  if (ts.isIdentifier(expr)) {
    if (expr.text === "fetchSecWithRetry") return false;
    return expr.text === "fetch" || expr.text === "fetchImpl";
  }
  if (ts.isPropertyAccessExpression(expr)) {
    return expr.name.text === "fetch";
  }
  return false;
}

function exprReferencesSecUrl(node, secUrlVars, sf) {
  if (!node) return false;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return SEC_HOST_RE.test(node.text);
  }
  if (ts.isTemplateExpression(node)) {
    return SEC_HOST_RE.test(node.getText(sf));
  }
  if (ts.isIdentifier(node)) return secUrlVars.has(node.text);
  return SEC_HOST_RE.test(node.getText(sf));
}

/** G13: All HTTP fetches to www.sec.gov / data.sec.gov MUST route through fetchSecWithRetry. */
export function checkG13SecFetchGatewayAst(rel, content, errors) {
  if (rel === "packages/ai/src/sec/sec-http.ts") return;
  if (
    !rel.startsWith("apps/web/src/") &&
    !rel.startsWith("packages/ai/src/") &&
    !rel.startsWith("packages/core/src/")
  ) {
    return;
  }
  const sf = parseTs(rel, content);
  const secUrlVars = new Set();
  const collectVars = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      SEC_HOST_RE.test(node.initializer.getText(sf))
    ) {
      secUrlVars.add(node.name.text);
    }
    ts.forEachChild(node, collectVars);
  };
  collectVars(sf);
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      isDirectFetchCallee(node.expression) &&
      exprReferencesSecUrl(node.arguments[0], secUrlVars, sf)
    ) {
      errors.push(
        `${rel}:${getLine(sf, node.getStart(sf))} [G13-sec-fetch-gateway] Requests to www.sec.gov / data.sec.gov MUST go through fetchSecWithRetry (global SEC token bucket).`,
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

const DB_CONTEXT_FILE = "apps/web/src/app/api/_lib/db-context.ts";
const DB_CONTEXT_CALL_NAMES = new Set(["withDb", "withUserDb", "withSystemDb"]);
const BANNED_LLM_FUNCS = new Set(["streamText", "generateText", "generateObject", "streamObject"]);
const SYSTEM_ONLY_DB_FUNCS = new Set([
  "updateThesisPriceByTicker",
  "enqueueWatchlistJobs",
  "evaluateAlertRules",
  "listThesisWatchersByTicker",
  "resolvePendingGuidanceCommitments",
  "pruneStaleFilingChunks",
  "pruneOldAppErrorEvents",
  "recordAppErrorEvent",
]);

const SYSTEM_DB_ALLOWLIST = new Map([
  ["apps/web/src/app/api/_lib/auth-session.ts", new Set(["auth_bootstrap"])],
  ["apps/web/src/app/api/_lib/on-demand-sync.ts", new Set(["on_demand_sync"])],
  ["apps/web/src/app/api/_lib/request-guards.ts", new Set(["rate_limit"])],
  ["apps/web/src/app/api/_lib/sec-intel-jobs.ts", new Set(["cron_tick", "user_triggered_sync"])],
  ["apps/web/src/app/api/_lib/sec-warehouse-sync.ts", new Set(["alert_fanout"])],
  ["apps/web/src/app/api/auth/login/route.ts", new Set(["auth_bootstrap"])],
  ["apps/web/src/app/api/auth/logout/route.ts", new Set(["auth_bootstrap"])],
  ["apps/web/src/app/api/auth/register/route.ts", new Set(["auth_bootstrap"])],
  ["apps/web/src/app/api/calendar/[token]/route.ts", new Set(["calendar_feed"])],
  ["apps/web/src/app/api/health/route.ts", new Set(["health"])],
  ["apps/web/src/app/api/internal/jobs/tick/job-handlers.ts", new Set(["cron_tick"])],
  ["apps/web/src/app/api/internal/jobs/tick/job-once.ts", new Set(["user_triggered_sync"])],
  ["apps/web/src/app/api/internal/jobs/tick/route.ts", new Set(["cron_tick"])],
  [
    "apps/web/src/app/api/internal/jobs/tick/segment-sync-job.ts",
    new Set(["cron_tick", "user_triggered_sync"]),
  ],
  ["apps/web/src/app/api/internal/jobs/tick/tick-runner.ts", new Set(["cron_tick"])],
  ["apps/web/src/app/api/sec/[ticker]/route.ts", new Set(["user_triggered_sync"])],
  ["apps/web/src/app/api/sec/[ticker]/filing/route.ts", new Set(["user_triggered_sync"])],
  ["apps/web/src/app/api/sec/[ticker]/redline/route.ts", new Set(["user_triggered_sync"])],
  ["apps/web/src/app/api/sec/[ticker]/segments/route.ts", new Set(["user_triggered_sync"])],
  ["apps/web/src/app/api/telemetry/client-errors/route.ts", new Set(["telemetry"])],
]);

const SET_CONFIG_ALLOWED_FILES = new Set([
  "packages/core/src/db/repositories/security/tenant-context.ts",
  "packages/core/src/db/migrate-cli.ts",
  "packages/core/scripts/rotate-envelopes.mjs",
]);

function isDbContextCall(node) {
  if (!ts.isCallExpression(node)) return null;
  if (ts.isIdentifier(node.expression) && DB_CONTEXT_CALL_NAMES.has(node.expression.text)) {
    return node.expression.text;
  }
  if (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "withDb") {
    return "withDb";
  }
  return null;
}

function getDbContextCallbackArg(node, kind) {
  if (kind === "withDb") return node.arguments[0] ?? null;
  return node.arguments[1] ?? null;
}

function isCoreDbValueImport(decl) {
  if (!ts.isStringLiteral(decl.moduleSpecifier) || decl.moduleSpecifier.text !== "@kanon/core/db") {
    return false;
  }
  const clause = decl.importClause;
  if (!clause || clause.isTypeOnly) return false;
  if (clause.name) return true;
  const bindings = clause.namedBindings;
  if (!bindings) return false;
  if (ts.isNamespaceImport(bindings)) return true;
  if (ts.isNamedImports(bindings)) {
    return bindings.elements.some((el) => !el.isTypeOnly && !el.name.text.endsWith("Error"));
  }
  return false;
}

function inspectG9ImportSpecifiers(node, sf, rel, isWeb, errors) {
  const bindings = node.importClause?.namedBindings;
  if (!bindings || !ts.isNamedImports(bindings)) return;
  for (const el of bindings.elements) {
    const orig = (el.propertyName ?? el.name).text;
    if (orig === "getKanonDb") {
      errors.push(
        `${rel}:${getLine(sf, el.getStart(sf))} [G9-kanon-db-provenance] getKanonDb may only be imported in ${DB_CONTEXT_FILE}.`,
      );
    }
    if (isWeb && (orig === "withTenantContext" || orig === "withSystemContext")) {
      errors.push(
        `${rel}:${getLine(sf, el.getStart(sf))} [G9-kanon-db-provenance] ${orig} may only be imported in ${DB_CONTEXT_FILE}.`,
      );
    }
  }
}

function inspectG9MemberOrCall(node, sf, rel, errors) {
  if (ts.isPropertyAccessExpression(node) && node.name.text === "getKanonDb") {
    errors.push(
      `${rel}:${getLine(sf, node.getStart(sf))} [G9-kanon-db-provenance] Member access .getKanonDb is forbidden outside ${DB_CONTEXT_FILE}.`,
    );
  }
  const isBracketGetDb =
    ts.isElementAccessExpression(node) &&
    ts.isStringLiteral(node.argumentExpression) &&
    node.argumentExpression.text === "getKanonDb";
  if (isBracketGetDb) {
    errors.push(
      `${rel}:${getLine(sf, node.getStart(sf))} [G9-kanon-db-provenance] Bracket access ["getKanonDb"] is forbidden outside ${DB_CONTEXT_FILE}.`,
    );
  }
  const isDirectCall =
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "getKanonDb";
  if (isDirectCall) {
    errors.push(
      `${rel}:${getLine(sf, node.getStart(sf))} [G9-kanon-db-provenance] Direct getKanonDb() call is forbidden outside ${DB_CONTEXT_FILE}.`,
    );
  }
}

/** G9: Enforces getKanonDb / withTenantContext / withSystemContext provenance & route context binding. */
export function checkG9DbProvenanceAst(rel, content, errors) {
  const isWeb = rel.startsWith("apps/web/src/");
  const isRepo = rel.startsWith("packages/core/src/db/repositories/");
  if ((!isWeb && !isRepo) || rel === DB_CONTEXT_FILE) return;
  const sf = parseTs(rel, content);
  let importsCoreDbValue = false;
  let callsDbContext = false;
  const visit = (node) => {
    if (ts.isImportDeclaration(node)) {
      if (isCoreDbValueImport(node)) importsCoreDbValue = true;
      inspectG9ImportSpecifiers(node, sf, rel, isWeb, errors);
    }
    inspectG9MemberOrCall(node, sf, rel, errors);
    if (isDbContextCall(node)) callsDbContext = true;
    ts.forEachChild(node, visit);
  };
  visit(sf);
  const isAppEntry =
    rel.startsWith("apps/web/src/app/") &&
    (rel.endsWith("/route.ts") || rel.endsWith("/page.tsx") || rel.endsWith("/layout.tsx"));
  if (isAppEntry && importsCoreDbValue && !callsDbContext) {
    errors.push(
      `${rel}:1 [G9-kanon-db-provenance] App entry imports @kanon/core/db value symbols without calling withDb/withUserDb/withSystemDb.`,
    );
  }
}

function addImportClauseNames(clause, names) {
  if (!clause || clause.isTypeOnly) return;
  if (clause.name) names.add(clause.name.text);
  const bindings = clause.namedBindings;
  if (!bindings) return;
  if (ts.isNamespaceImport(bindings)) {
    names.add(bindings.name.text);
    return;
  }
  if (!ts.isNamedImports(bindings)) return;
  for (const el of bindings.elements) {
    if (!el.isTypeOnly) names.add(el.name.text);
  }
}

function collectAiValueImports(sf) {
  const names = new Set();
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    if (!ts.isStringLiteral(stmt.moduleSpecifier) || stmt.moduleSpecifier.text !== "@kanon/ai") {
      continue;
    }
    addImportClauseNames(stmt.importClause, names);
  }
  return names;
}

function inspectG10IdentifierCall(callee, line, aiImports, rel, errors) {
  const name = callee.text;
  if (name === "fetch" || name === "after" || name === "setTimeout") {
    errors.push(
      `${rel}:${line} [G10-no-network-in-db-tx] ${name}() is forbidden inside DB context transactions.`,
    );
  } else if (BANNED_LLM_FUNCS.has(name)) {
    errors.push(
      `${rel}:${line} [G10-no-network-in-db-tx] LLM call ${name}() is forbidden inside DB context transactions.`,
    );
  } else if (aiImports.has(name)) {
    errors.push(
      `${rel}:${line} [G10-no-network-in-db-tx] @kanon/ai call "${name}()" is forbidden inside DB context transactions.`,
    );
  }
}

function inspectG10PropertyCall(callee, line, aiImports, sf, rel, errors) {
  if (callee.name.text === "fetch") {
    errors.push(
      `${rel}:${line} [G10-no-network-in-db-tx] .fetch() is forbidden inside DB context transactions.`,
    );
  } else if (ts.isIdentifier(callee.expression) && aiImports.has(callee.expression.text)) {
    errors.push(
      `${rel}:${line} [G10-no-network-in-db-tx] @kanon/ai call "${callee.getText(sf)}()" is forbidden inside DB context transactions.`,
    );
  }
}

function inspectTxCallbackBody(cbNode, aiImports, sf, rel, errors) {
  const walk = (n) => {
    const isEventSource =
      ts.isNewExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "EventSource";
    if (isEventSource) {
      errors.push(
        `${rel}:${getLine(sf, n.getStart(sf))} [G10-no-network-in-db-tx] new EventSource is forbidden inside DB context transactions.`,
      );
    }
    if (ts.isCallExpression(n)) {
      const line = getLine(sf, n.getStart(sf));
      if (ts.isIdentifier(n.expression)) {
        inspectG10IdentifierCall(n.expression, line, aiImports, rel, errors);
      } else if (ts.isPropertyAccessExpression(n.expression)) {
        inspectG10PropertyCall(n.expression, line, aiImports, sf, rel, errors);
      }
    }
    ts.forEachChild(n, walk);
  };
  walk(cbNode);
}

/** G10: Bans fetch, after, setTimeout, EventSource, @kanon/ai value calls, and LLM calls inside DB context callbacks. */
export function checkG10NoNetworkInDbTxAst(rel, content, errors) {
  if (!rel.startsWith("apps/web/src/")) return;
  const sf = parseTs(rel, content);
  const aiImports = collectAiValueImports(sf);
  const visit = (node) => {
    const kind = isDbContextCall(node);
    if (kind) {
      const cb = getDbContextCallbackArg(node, kind);
      if (cb) inspectTxCallbackBody(cb, aiImports, sf, rel, errors);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

function isSetConfigAllowedFile(rel) {
  return SET_CONFIG_ALLOWED_FILES.has(rel) || rel.startsWith("packages/core/src/db/migrations/");
}

function isTextLiteralLike(node) {
  return (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isTemplateHead(node) ||
    ts.isTemplateMiddle(node) ||
    ts.isTemplateTail(node)
  );
}

function checkRawSetConfigLiterals(sf, rel, errors) {
  const visit = (node) => {
    if (
      isTextLiteralLike(node) &&
      (node.text.includes("set_config(") || node.text.includes("kanon.system"))
    ) {
      errors.push(
        `${rel}:${getLine(sf, node.getStart(sf))} [G12-system-context-allowlist] Direct set_config('kanon.system', ...) is forbidden outside allowlisted DB context/migration files.`,
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

function validateWithSystemDbCall(node, sf, rel, errors) {
  const line = getLine(sf, node.getStart(sf));
  const reasonArg = node.arguments[0];
  if (
    !reasonArg ||
    (!ts.isStringLiteral(reasonArg) && !ts.isNoSubstitutionTemplateLiteral(reasonArg))
  ) {
    errors.push(
      `${rel}:${line} [G12-system-context-allowlist] withSystemDb first argument MUST be a string literal reason.`,
    );
    return;
  }
  const allowedReasons = SYSTEM_DB_ALLOWLIST.get(rel);
  if (!allowedReasons?.has(reasonArg.text)) {
    errors.push(
      `${rel}:${line} [G12-system-context-allowlist] withSystemDb("${reasonArg.text}") is not allowlisted for ${rel}.`,
    );
  }
}

function inspectG12Call(node, insideSystemDb, sf, rel, errors, walk) {
  if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) return false;
  const name = node.expression.text;
  if (name === "withSystemDb") {
    validateWithSystemDbCall(node, sf, rel, errors);
    if (node.arguments[1]) walk(node.arguments[1], true);
    return true;
  }
  if (SYSTEM_ONLY_DB_FUNCS.has(name) && !insideSystemDb) {
    errors.push(
      `${rel}:${getLine(sf, node.getStart(sf))} [G12-system-context-allowlist] System-only DB helper "${name}()" may only be called inside a withSystemDb(...) callback.`,
    );
  }
  return false;
}

/** G12: Enforces literal allowlisted reasons on withSystemDb, bans rogue set_config/kanon.system, and gates system-only DB helpers. */
export function checkG12SystemContextAllowlistAst(rel, content, errors) {
  const sf = parseTs(rel, content);
  if (!isSetConfigAllowedFile(rel)) checkRawSetConfigLiterals(sf, rel, errors);
  if (!rel.startsWith("apps/web/src/") || rel === DB_CONTEXT_FILE) return;
  const walk = (node, insideSystemDb) => {
    if (inspectG12Call(node, insideSystemDb, sf, rel, errors, walk)) return;
    ts.forEachChild(node, (child) => walk(child, insideSystemDb));
  };
  walk(sf, false);
}

function inspectG19PropCall(node, line, lines, rel, errors) {
  const expr = node.expression;
  const method = expr.name.text;
  if (method === "waitForTimeout") {
    errors.push(
      `${rel}:${line} [G19-e2e-no-arbitrary-wait] waitForTimeout is banned in E2E specs; wait on observable UI/API state.`,
    );
    return;
  }
  const arg0 = node.arguments[0];
  if (
    method === "waitForLoadState" &&
    arg0 &&
    ts.isStringLiteral(arg0) &&
    arg0.text === "networkidle"
  ) {
    errors.push(
      `${rel}:${line} [G19-e2e-no-arbitrary-wait] waitForLoadState("networkidle") is banned in E2E specs.`,
    );
    return;
  }
  const isQuarantineSkip =
    (method === "skip" || method === "fixme") &&
    ts.isIdentifier(expr.expression) &&
    expr.expression.text === "test";
  if (isQuarantineSkip && !hasCommentTag(lines, line, "@kanon-quarantine:")) {
    errors.push(
      `${rel}:${line} [G19-e2e-no-arbitrary-wait] test.${method} requires // @kanon-quarantine: <issue-url> annotation.`,
    );
  }
}

/** G19: Bans waitForTimeout, setTimeout, waitForLoadState("networkidle"), and unquarantined test.skip/fixme in apps/web/e2e. */
export function checkG19E2eNoArbitraryWaitAst(rel, content, errors) {
  if (!rel.startsWith("apps/web/e2e/")) return;
  const sf = parseTs(rel, content);
  const lines = content.split("\n");
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const line = getLine(sf, node.getStart(sf));
      if (ts.isIdentifier(node.expression) && node.expression.text === "setTimeout") {
        errors.push(
          `${rel}:${line} [G19-e2e-no-arbitrary-wait] setTimeout is banned in E2E specs; use expect.poll or explicit locator waits.`,
        );
      } else if (ts.isPropertyAccessExpression(node.expression)) {
        inspectG19PropCall(node, line, lines, rel, errors);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

const GUIDANCE_STORE_FILE = "packages/core/src/db/repositories/intel/guidance-store.ts";

function isInsideConfirmGuidanceFn(node) {
  let cur = node.parent;
  while (cur) {
    if (ts.isFunctionDeclaration(cur) && cur.name?.text === "confirmGuidanceCommitment")
      return true;
    cur = cur.parent;
  }
  return false;
}

/** G17: Only confirmGuidanceCommitment in guidance-store.ts may write status='confirmed' to guidance_commitments. */
export function checkG17HitlConfirmOnlyAst(rel, content, errors) {
  if (rel.startsWith("packages/core/src/db/migrations/")) return;
  if (!content.includes("guidanceCommitmentsTable") && !content.includes("guidance_commitments")) {
    return;
  }
  const sf = parseTs(rel, content);
  const visit = (node) => {
    if (
      ts.isPropertyAssignment(node) &&
      readPropName(node) === "status" &&
      ts.isStringLiteral(node.initializer) &&
      node.initializer.text === "confirmed"
    ) {
      const allowed = rel === GUIDANCE_STORE_FILE && isInsideConfirmGuidanceFn(node);
      if (!allowed) {
        errors.push(
          `${rel}:${getLine(sf, node.getStart(sf))} [G17-hitl-confirm-only] Writing status="confirmed" for guidance_commitments is only allowed inside confirmGuidanceCommitment.`,
        );
      }
    } else if (
      isTextLiteralLike(node) &&
      /guidance_commitments/i.test(node.text) &&
      /['"]confirmed['"]/.test(node.text) &&
      /\b(?:INSERT|UPDATE)\b/i.test(node.text)
    ) {
      errors.push(
        `${rel}:${getLine(sf, node.getStart(sf))} [G17-hitl-confirm-only] Raw SQL writing confirmed status to guidance_commitments is forbidden.`,
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

/** G18: Bans ILIKE/LIKE substring search on filing_chunks.text and removed searchFilingChunksLexical. */
export function checkG18NoSubstringChunkRetrievalAst(rel, content, errors) {
  if (
    !rel.startsWith("apps/web/src/") &&
    !rel.startsWith("packages/ai/src/") &&
    !rel.startsWith("packages/core/src/")
  ) {
    return;
  }
  const sf = parseTs(rel, content);
  const visit = (node) => {
    if (ts.isIdentifier(node) && node.text === "searchFilingChunksLexical") {
      errors.push(
        `${rel}:${getLine(sf, node.getStart(sf))} [G18-no-substring-chunk-retrieval] searchFilingChunksLexical is banned; use searchFilingChunksFts.`,
      );
    } else if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      (node.expression.text === "ilike" || node.expression.text === "like") &&
      node.arguments[0]?.getText(sf).includes("filingChunksTable.text")
    ) {
      errors.push(
        `${rel}:${getLine(sf, node.getStart(sf))} [G18-no-substring-chunk-retrieval] Substring ${node.expression.text}() on filingChunksTable.text is banned; use GIN FTS.`,
      );
    } else if (
      isTextLiteralLike(node) &&
      /filing_chunks/i.test(node.text) &&
      /\bI?LIKE\b/i.test(node.text)
    ) {
      errors.push(
        `${rel}:${getLine(sf, node.getStart(sf))} [G18-no-substring-chunk-retrieval] Raw SQL ILIKE/LIKE on filing_chunks is banned; use to_tsvector/websearch_to_tsquery.`,
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

const HYP_EVENT_EXEMPT_FILES = new Set([]);

function isFunctionLikeNode(node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node) ||
    ts.isMethodDeclaration(node)
  );
}

function isHypothesesTableWrite(n, sf) {
  return (
    ts.isPropertyAccessExpression(n.expression) &&
    (n.expression.name.text === "update" || n.expression.name.text === "insert") &&
    n.arguments[0]?.getText(sf) === "hypothesesTable"
  );
}

function inspectHypWriteInFunction(fnNode, sf, rel, errors) {
  let hasHypMutation = false;
  let hasEventAppend = false;
  let mutLine = 1;
  const walk = (n) => {
    if (n !== fnNode && isFunctionLikeNode(n)) return;
    if (ts.isCallExpression(n)) {
      if (ts.isIdentifier(n.expression) && n.expression.text === "appendHypothesisStatusEvent") {
        hasEventAppend = true;
      } else if (isHypothesesTableWrite(n, sf)) {
        hasHypMutation = true;
        mutLine = getLine(sf, n.getStart(sf));
      }
    }
    ts.forEachChild(n, walk);
  };
  walk(fnNode);
  if (hasHypMutation && !hasEventAppend) {
    errors.push(
      `${rel}:${mutLine} [G14-hypothesis-status-event-pairing] Mutations on hypothesesTable MUST call appendHypothesisStatusEvent in the same function.`,
    );
  }
}

/** G14+: Every repository function/arrow/method mutating hypothesesTable must pair appendHypothesisStatusEvent (zero exemptions). */
export function checkG14HypothesisEventPairingAst(rel, content, errors) {
  if (!rel.startsWith("packages/core/src/db/repositories/") || HYP_EVENT_EXEMPT_FILES.has(rel)) {
    return;
  }
  if (!content.includes("hypothesesTable")) return;
  const sf = parseTs(rel, content);
  const visit = (node) => {
    if (isFunctionLikeNode(node) && node.body) {
      inspectHypWriteInFunction(node.body, sf, rel, errors);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

const IMMUTABLE_TABLES = new Set(["decisionSnapshotsTable", "hypothesisStatusEventsTable"]);

/** G15: Bans UPDATE/DELETE on immutable decision_snapshots and append-only hypothesis_status_events. */
export function checkG15ImmutableLedgerTablesAst(rel, content, errors) {
  if (rel.startsWith("packages/core/src/db/migrations/")) return;
  const sf = parseTs(rel, content);
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      (node.expression.name.text === "update" || node.expression.name.text === "delete") &&
      IMMUTABLE_TABLES.has(node.arguments[0]?.getText(sf) ?? "")
    ) {
      errors.push(
        `${rel}:${getLine(sf, node.getStart(sf))} [G15-immutable-ledger-tables] ${node.expression.name.text}(${node.arguments[0]?.getText(sf)}) is forbidden on immutable/append-only table.`,
      );
    } else if (
      isTextLiteralLike(node) &&
      /\b(?:UPDATE|DELETE\s+FROM)\s+(?:decision_snapshots|hypothesis_status_events)\b/i.test(
        node.text,
      )
    ) {
      errors.push(
        `${rel}:${getLine(sf, node.getStart(sf))} [G15-immutable-ledger-tables] Raw SQL UPDATE/DELETE on decision_snapshots or hypothesis_status_events is forbidden.`,
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

const CLOSE_ONLY_PREFIXES = [
  "packages/core/src/math/performance/",
  "packages/core/src/math/risk/",
  "packages/core/src/math/attribution/",
  "packages/core/src/db/repositories/portfolio/",
  "apps/web/src/app/api/portfolio/",
];

/** G16: Portfolio NAV, risk, and attribution paths must use split-basis consistent `.close` (never `.adjClose`). */
export function checkG16HoldingsUseCloseOnlyAst(rel, content, errors) {
  if (!CLOSE_ONLY_PREFIXES.some((p) => rel.startsWith(p))) return;
  const sf = parseTs(rel, content);
  const visit = (node) => {
    if (
      ts.isPropertyAccessExpression(node) &&
      (node.name.text === "adjClose" || node.name.text === "adj_close")
    ) {
      errors.push(
        `${rel}:${getLine(sf, node.getStart(sf))} [G16-holdings-use-close-only] Property .${node.name.text} is banned in portfolio performance/risk/attribution; use split-adjusted .close consistent with split-basis.ts.`,
      );
    } else if (ts.isIdentifier(node) && (node.text === "adjClose" || node.text === "adj_close")) {
      errors.push(
        `${rel}:${getLine(sf, node.getStart(sf))} [G16-holdings-use-close-only] Identifier ${node.text} is banned in portfolio performance/risk/attribution; use split-adjusted close consistent with split-basis.ts.`,
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

/** Runs Wave R/S/T AST-level L2 mechanical guards (G6+, G9, G10, G12, G13, G14-G19). */
export function checkWaveGuardsRs(root, errors) {
  const dirs = ["apps/web/src", "packages/ai/src", "packages/core/src"];
  for (const d of dirs) {
    const files = [];
    walkTsFiles(path.join(root, d), files);
    for (const full of files) {
      const rel = path.relative(root, full).split(path.sep).join("/");
      const content = fs.readFileSync(full, "utf8");
      checkG6PlusValuationLiteralsAst(rel, content, errors);
      checkG9DbProvenanceAst(rel, content, errors);
      checkG10NoNetworkInDbTxAst(rel, content, errors);
      checkG12SystemContextAllowlistAst(rel, content, errors);
      checkG13SecFetchGatewayAst(rel, content, errors);
      checkG14HypothesisEventPairingAst(rel, content, errors);
      checkG15ImmutableLedgerTablesAst(rel, content, errors);
      checkG16HoldingsUseCloseOnlyAst(rel, content, errors);
      checkG17HitlConfirmOnlyAst(rel, content, errors);
      checkG18NoSubstringChunkRetrievalAst(rel, content, errors);
    }
  }
  const e2eFiles = [];
  walkTsFiles(path.join(root, "apps/web/e2e"), e2eFiles);
  for (const full of e2eFiles) {
    const rel = path.relative(root, full).split(path.sep).join("/");
    checkG19E2eNoArbitraryWaitAst(rel, fs.readFileSync(full, "utf8"), errors);
  }
}
