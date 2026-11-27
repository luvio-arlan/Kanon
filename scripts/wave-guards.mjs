import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const RAW_FETCH_ALLOWLIST = new Set([
  "apps/web/src/shared/lib/kanon-fetch.ts",
  "apps/web/src/features/thesis/hooks/agent-sse-stream.ts",
]);

const REQUIRED_PROD_ENGINES = new Set([
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
  "createOrgInvitation",
  "acceptOrgInvitation",
]);

const FINANCIAL_BASE_FIELDS = new Set([
  "revenue",
  "totalDebt",
  "cashAndEquiv",
  "dilutedShares",
  "freeCashFlow",
  "baseOwnerFcfB",
  "ownerFcfMultipleBase",
  "revenueCagrPct",
  "currentRevenueB",
]);

const TENANT_COLS = new Set(["user_id", "org_id", "thesis_id", "account_id"]);
const TENANT_KEY_RE =
  /\b(?:userId|thesisId|orgId|accountId|tokenHash|user_id|thesis_id|org_id|account_id|accessWhere|whereClause|buildThesisWriteAccessWhere|buildThesisDeleteAccessWhere)\b|@kanon-tenant-checked/;
const UNTRUSTED_API_RE = /(?:req|request|body|raw|rec|data|params|searchParams|query|payload)/i;
const SAFE_NUM_FUNCS = new Set(["Number", "parseFloat", "parseInt"]);
const G5_CRITICAL_REPOS = new Set([
  "portfolio-ledger-store.ts",
  "ic-and-compliance-store.ts",
  "org-invitations-store.ts",
  "organizations-and-rls-store.ts",
]);
const HTTP_METHODS = new Set(["GET", "POST", "PATCH", "PUT", "DELETE"]);

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

function isUseClientFile(content) {
  return /^\s*["']use client["'];?/m.test(content.slice(0, 200));
}

function isFetchExpression(expr, aliases) {
  if (ts.isIdentifier(expr)) return aliases.has(expr.text);
  if (ts.isElementAccessExpression(expr) && ts.isStringLiteral(expr.argumentExpression)) {
    return expr.argumentExpression.text === "fetch";
  }
  if (!ts.isPropertyAccessExpression(expr)) return false;
  const name = expr.name.text;
  if (name === "fetch") return true;
  return (
    (name === "call" || name === "apply" || name === "bind") &&
    isFetchExpression(expr.expression, aliases)
  );
}

function inspectG1Call(node, sf, rel, aliases, errors) {
  const line = getLine(sf, node.getStart(sf));
  if (isFetchExpression(node.expression, aliases)) {
    errors.push(
      `${rel}:${line} [G1-no-raw-fetch-in-features] Use kanonFetch with Zod schema (raw/aliased fetch banned).`,
    );
    return;
  }
  if (
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === "sendBeacon"
  ) {
    errors.push(
      `${rel}:${line} [G1-no-raw-fetch-in-features] navigator.sendBeacon is banned in client code.`,
    );
  }
}

function inspectG1Node(node, sf, rel, aliases, errors) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
    if (isFetchExpression(node.initializer, aliases)) aliases.add(node.name.text);
    return;
  }
  if (ts.isCallExpression(node)) {
    inspectG1Call(node, sf, rel, aliases, errors);
    return;
  }
  const isBannedCtor =
    ts.isNewExpression(node) &&
    ts.isIdentifier(node.expression) &&
    (node.expression.text === "XMLHttpRequest" || node.expression.text === "EventSource");
  if (isBannedCtor) {
    errors.push(
      `${rel}:${getLine(sf, node.getStart(sf))} [G1-no-raw-fetch-in-features] ${node.expression.text} is banned; use kanonFetch/approved stream client.`,
    );
  }
}

/** G1: AST check banning fetch (direct/aliased/property/.call/.apply), XHR, EventSource, sendBeacon in client code. */
export function checkG1ClientNetworkAst(rel, content, errors) {
  const inScope =
    rel.startsWith("apps/web/src/features/") ||
    rel.startsWith("apps/web/src/shared/") ||
    (rel.startsWith("apps/web/src/app/") && isUseClientFile(content));
  if (!inScope || RAW_FETCH_ALLOWLIST.has(rel)) return;
  const sf = parseTs(rel, content);
  const aliases = new Set(["fetch"]);
  const visit = (node) => {
    inspectG1Node(node, sf, rel, aliases, errors);
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

function isSafeInternalNumberArg(argText, lines, line) {
  return (
    argText.includes("process.env.") ||
    argText.includes("Date.now") ||
    argText.includes("performance.now") ||
    hasCommentTag(lines, line, "@kanon-validated:")
  );
}

function inspectG2Call(node, sf, lines, rel, errors) {
  if (!ts.isIdentifier(node.expression) || !SAFE_NUM_FUNCS.has(node.expression.text)) return;
  const arg = node.arguments[0];
  if (!arg || ts.isNumericLiteral(arg) || ts.isStringLiteral(arg)) return;
  const line = getLine(sf, node.getStart(sf));
  const argText = arg.getText(sf);
  if (!isSafeInternalNumberArg(argText, lines, line) && UNTRUSTED_API_RE.test(argText)) {
    errors.push(
      `${rel}:${line} [G2-no-raw-number-parse-in-api] Validate API numeric input via @kanon/core Zod schema (or annotate // @kanon-validated:).`,
    );
  }
}

function inspectG2Unary(node, sf, lines, rel, errors) {
  if (node.operator !== ts.SyntaxKind.PlusToken || ts.isNumericLiteral(node.operand)) return;
  const line = getLine(sf, node.getStart(sf));
  const text = node.operand.getText(sf);
  if (!hasCommentTag(lines, line, "@kanon-validated:") && UNTRUSTED_API_RE.test(text)) {
    errors.push(
      `${rel}:${line} [G2-no-raw-number-parse-in-api] Avoid unary + on untrusted API input; validate via Zod.`,
    );
  }
}

function inspectG2Node(node, sf, lines, rel, errors) {
  if (ts.isCallExpression(node)) inspectG2Call(node, sf, lines, rel, errors);
  else if (ts.isPrefixUnaryExpression(node)) inspectG2Unary(node, sf, lines, rel, errors);
}

/** G2: AST check banning raw Number()/parseFloat()/parseInt()/unary + on untrusted input in API routes. */
export function checkG2ApiNumberParseAst(rel, content, errors) {
  if (!rel.startsWith("apps/web/src/app/api/")) return;
  const sf = parseTs(rel, content);
  const lines = content.split("\n");
  const visit = (node) => {
    inspectG2Node(node, sf, lines, rel, errors);
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

function isNumericLit(node) {
  return (
    ts.isNumericLiteral(node) ||
    (ts.isPrefixUnaryExpression(node) && ts.isNumericLiteral(node.operand))
  );
}

function readFinancialBaseField(node) {
  if (ts.isPropertyAccessExpression(node) && FINANCIAL_BASE_FIELDS.has(node.name.text)) {
    return node.name.text;
  }
  return ts.isIdentifier(node) && FINANCIAL_BASE_FIELDS.has(node.text) ? node.text : null;
}

function inspectG6Fallback(node, sf, lines, rel, errors) {
  const field = readFinancialBaseField(node.left);
  if (!field || !isNumericLit(node.right)) return;
  const num = Number(node.right.getText(sf).replaceAll("_", ""));
  const line = getLine(sf, node.getStart(sf));
  const allowZeroCashDebt = (field === "cashAndEquiv" || field === "totalDebt") && num === 0;
  if (!allowZeroCashDebt && !hasCommentTag(lines, line, "@kanon-fallback-ok:")) {
    errors.push(
      `${rel}:${line} [G6-no-invented-financial-fallbacks] Never substitute numeric literal (${num}) for missing "${field}". Use null + empty state.`,
    );
  }
}

function inspectG6Multiply(node, sf, lines, rel, errors) {
  if (!rel.startsWith("apps/web/src/features/valuation/")) return;
  const combined = `${node.left.getText(sf)} ${node.right.getText(sf)}`;
  const hasPrice = /\b(?:price|currentPrice)\b/i.test(combined);
  const hasShares = /\b(?:shares|sharesM|dilutedShares)\b/i.test(combined);
  const line = getLine(sf, node.getStart(sf));
  if (hasPrice && hasShares && !hasCommentTag(lines, line, "@kanon-marketcap-ok:")) {
    errors.push(
      `${rel}:${line} [G6-no-invented-financial-fallbacks] Do not multiply price * shares in valuation UI to synthesize FCF/EPS.`,
    );
  }
}

function inspectG6Binary(node, sf, lines, rel, errors) {
  const op = node.operatorToken.kind;
  if (op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.BarBarToken) {
    inspectG6Fallback(node, sf, lines, rel, errors);
  } else if (op === ts.SyntaxKind.AsteriskToken) {
    inspectG6Multiply(node, sf, lines, rel, errors);
  }
}

/** G6: AST check banning invented numeric fallbacks for financial base fields & price*shares FCF fabrication. */
export function checkG6FinancialHonestyAst(rel, content, errors) {
  const inModelUi =
    rel.startsWith("apps/web/src/features/valuation/") ||
    rel.startsWith("apps/web/src/features/journal/");
  if (!inModelUi) return;
  const sf = parseTs(rel, content);
  const lines = content.split("\n");
  const visit = (node) => {
    if (ts.isBinaryExpression(node)) inspectG6Binary(node, sf, lines, rel, errors);
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

function extractCalledEngineName(node) {
  if (!ts.isCallExpression(node)) return null;
  if (ts.isIdentifier(node.expression)) return node.expression.text;
  if (ts.isPropertyAccessExpression(node.expression)) return node.expression.name.text;
  return null;
}

function collectEngineCallsInFile(sf, calledOrUsed) {
  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isTypeNode(node)) return;
    if (ts.isFunctionDeclaration(node) && node.name && REQUIRED_PROD_ENGINES.has(node.name.text)) {
      if (node.body) visit(node.body);
      return;
    }
    const sym = extractCalledEngineName(node);
    if (sym && REQUIRED_PROD_ENGINES.has(sym)) calledOrUsed.add(sym);
    ts.forEachChild(node, visit);
  }
  visit(sf);
}

/** G3: AST reachability requiring a real non-declaration call outside defining file & tests. */
function checkG3ReachabilityAst(root, errors) {
  const prodFiles = [];
  walkTsFiles(path.join(root, "apps/web/src"), prodFiles);
  walkTsFiles(path.join(root, "packages/ai/src"), prodFiles);
  const calledOrUsed = new Set();
  for (const full of prodFiles) {
    if (full.endsWith(`${path.sep}index.ts`)) continue;
    collectEngineCallsInFile(parseTs(full, fs.readFileSync(full, "utf8")), calledOrUsed);
  }
  for (const sym of REQUIRED_PROD_ENGINES) {
    if (!calledOrUsed.has(sym)) {
      errors.push(
        `packages/core:1 [G3-production-engine-reachability] Core engine "${sym}" has zero real runtime CallExpression callers in apps/web/src or packages/ai/src.`,
      );
    }
  }
}

function hasTenantColumnDef(colsText) {
  for (const col of TENANT_COLS) {
    if (colsText.includes(`"${col}"`) || colsText.includes(`'${col}'`)) return true;
  }
  return false;
}

function discoverTenantTables(root) {
  const dbDir = path.join(root, "packages/core/src/db");
  const tables = new Set();
  if (!fs.existsSync(dbDir)) return tables;
  for (const entry of fs.readdirSync(dbDir)) {
    if (!/^schema.*\.ts$/.test(entry)) continue;
    const full = path.join(dbDir, entry);
    const sf = parseTs(full, fs.readFileSync(full, "utf8"));
    const visit = (node) => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        ts.isCallExpression(node.initializer) &&
        node.initializer.expression.getText(sf) === "pgTable" &&
        node.initializer.arguments.length >= 2 &&
        hasTenantColumnDef(node.initializer.arguments[1].getText(sf))
      ) {
        tables.add(node.name.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return tables;
}

function countTopLevelDbWrites(body) {
  let count = 0;
  function walk(n) {
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === "runInTransaction"
    ) {
      return;
    }
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      const m = n.expression.name.text;
      if (m === "insert" || m === "update" || m === "delete") count += 1;
    }
    ts.forEachChild(n, walk);
  }
  walk(body);
  return count;
}

function resolveTenantTargetTable(node, tenantTables, tableAliases) {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return null;
  const method = node.expression.name.text;
  if ((method !== "update" && method !== "delete") || node.arguments.length === 0) return null;
  const arg = node.arguments[0];
  const tbl = ts.isIdentifier(arg) ? (tableAliases.get(arg.text) ?? arg.text) : null;
  return tbl && tenantTables.has(tbl) ? tbl : null;
}

function checkRepoMutationFilter(node, sf, lines, rel, tenantTables, tableAliases, errors) {
  const tbl = resolveTenantTargetTable(node, tenantTables, tableAliases);
  if (!tbl) return;
  let cur = node;
  while (cur.parent && !ts.isStatement(cur)) cur = cur.parent;
  const line = getLine(sf, node.getStart(sf));
  if (
    !TENANT_KEY_RE.test(cur.getText(sf)) &&
    !hasCommentTag(lines, line, "@kanon-tenant-checked")
  ) {
    errors.push(
      `${rel}:${line} [G4-repo-update-tenant-filter] Mutation on tenant table "${tbl}" must filter by userId/thesisId/orgId/accountId.`,
    );
  }
}

function checkRepoMultiWriteTx(node, sf, lines, rel, errors) {
  if (!ts.isFunctionDeclaration(node) || !node.body) return;
  if (!node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) return;
  const baseName = path.basename(rel);
  if (!G5_CRITICAL_REPOS.has(baseName)) return;
  const writes = countTopLevelDbWrites(node.body);
  const line = getLine(sf, node.getStart(sf));
  if (writes >= 2 && !hasCommentTag(lines, line, "@kanon-multi-write-ok:")) {
    errors.push(
      `${rel}:${line} [G5-repo-multi-write-transaction] Exported function "${node.name?.text ?? "anon"}" performs ${writes} writes outside runInTransaction.`,
    );
  }
}

/** G4 & G5 & G8 repository AST checks. */
export function checkRepoAst(rel, content, tenantTables, errors) {
  const sf = parseTs(rel, content);
  const lines = content.split("\n");
  const tableAliases = new Map();
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isIdentifier(node.initializer)
    ) {
      if (tenantTables.has(node.initializer.text))
        tableAliases.set(node.name.text, node.initializer.text);
    }
    if (ts.isIdentifier(node) && node.text === "assertThesisOwnership") {
      errors.push(
        `${rel}:${getLine(sf, node.getStart(sf))} [G8-no-misleading-ownership-symbol] "assertThesisOwnership" is banned; use capability-explicit getThesisAccess/assertThesisAccess.`,
      );
    }
    checkRepoMutationFilter(node, sf, lines, rel, tenantTables, tableAliases, errors);
    checkRepoMultiWriteTx(node, sf, lines, rel, errors);
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

/** G7: Thesis-scoped API routes MUST call requireThesisAccess (and never assertThesisOwnership). */
export function checkG7ApiCapabilityGuard(rel, content, errors) {
  const isScopedRoute =
    /^apps\/web\/src\/app\/api\/theses\/\[id\]\/.*route\.ts$/.test(rel) ||
    /^apps\/web\/src\/app\/api\/ai\/.*route\.ts$/.test(rel) ||
    rel === "apps/web/src/app/api/export/thesis/[id]/route.ts";
  if (!isScopedRoute) return;
  const sf = parseTs(rel, content);
  const visit = (node) => {
    if (ts.isIdentifier(node) && node.text === "assertThesisOwnership") {
      errors.push(
        `${rel}:${getLine(sf, node.getStart(sf))} [G8-no-misleading-ownership-symbol] "assertThesisOwnership" is banned in API routes.`,
      );
    }
    if (
      ts.isFunctionDeclaration(node) &&
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) &&
      node.name &&
      HTTP_METHODS.has(node.name.text) &&
      node.body &&
      !/\brequireThesisAccess\s*\(/.test(node.body.getText(sf))
    ) {
      errors.push(
        `${rel}:${getLine(sf, node.getStart(sf))} [G7-api-route-capability-guard] Exported ${node.name.text} handler must call requireThesisAccess(..., capability).`,
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

/** Runs Wave I–Q AST-level L2 mechanical guards (G1–G8). */
export function checkWaveGuards(root, errors) {
  const webFiles = [];
  walkTsFiles(path.join(root, "apps/web/src"), webFiles);
  for (const full of webFiles) {
    const rel = path.relative(root, full).split(path.sep).join("/");
    const content = fs.readFileSync(full, "utf8");
    checkG1ClientNetworkAst(rel, content, errors);
    checkG2ApiNumberParseAst(rel, content, errors);
    checkG6FinancialHonestyAst(rel, content, errors);
    checkG7ApiCapabilityGuard(rel, content, errors);
  }
  checkG3ReachabilityAst(root, errors);
  const tenantTables = discoverTenantTables(root);
  const repoFiles = [];
  walkTsFiles(path.join(root, "packages/core/src/db/repositories"), repoFiles);
  for (const full of repoFiles) {
    const rel = path.relative(root, full).split(path.sep).join("/");
    checkRepoAst(rel, fs.readFileSync(full, "utf8"), tenantTables, errors);
  }
}
