import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const MUTATION_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

function walkRouteFiles(dirPath, results) {
  if (!fs.existsSync(dirPath)) return;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) walkRouteFiles(full, results);
    else if (entry.isFile() && entry.name === "route.ts") results.push(full);
  }
}

function isExported(node) {
  return Boolean(node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));
}

function getFnLikeBody(init) {
  if (!init) return null;
  if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) return init.body;
  return null;
}

function collectDeclFunctions(stmt, onFound) {
  if (ts.isFunctionDeclaration(stmt) && stmt.name && stmt.body) {
    onFound(stmt.name.text, stmt.name, stmt.body);
    return;
  }
  if (!ts.isVariableStatement(stmt)) return;
  for (const decl of stmt.declarationList.declarations) {
    const body = ts.isIdentifier(decl.name) ? getFnLikeBody(decl.initializer) : null;
    if (body) onFound(decl.name.text, decl.name, body);
  }
}

function collectHelperCallMap(sf) {
  const localFns = new Map();
  for (const stmt of sf.statements) {
    collectDeclFunctions(stmt, (name, _node, body) => localFns.set(name, body));
  }
  return localFns;
}

function collectExportedMutationHandlers(sf) {
  const handlers = [];
  for (const stmt of sf.statements) {
    if (!isExported(stmt)) continue;
    collectDeclFunctions(stmt, (name, nameNode, body) => {
      if (MUTATION_METHODS.has(name)) {
        handlers.push({ name, pos: nameNode.getStart(sf), body });
      }
    });
  }
  return handlers;
}

const CRON_AUTH_ROUTES = new Set(["apps/web/src/app/api/internal/jobs/tick/route.ts"]);

function callSatisfiesTargetGuard(callExpr, targetName, localFns, seen) {
  if (!ts.isIdentifier(callExpr.expression)) return false;
  const callee = callExpr.expression.text;
  if (callee === targetName) return true;
  const helperBody = localFns.get(callee);
  if (!helperBody || seen.has(callee)) return false;
  seen.add(callee);
  return nodeCallsTargetGuard(helperBody, targetName, localFns, seen);
}

function nodeCallsTargetGuard(root, targetName, localFns, seen = new Set()) {
  let found = false;
  function visit(node) {
    if (found) return;
    if (ts.isCallExpression(node) && callSatisfiesTargetGuard(node, targetName, localFns, seen)) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(root);
  return found;
}

export function checkApiMutationCsrfGuard(rootDir, errors) {
  const apiRoot = path.join(rootDir, "apps/web/src/app/api");
  const routes = [];
  walkRouteFiles(apiRoot, routes);

  for (const filePath of routes) {
    const rel = path.relative(rootDir, filePath).split(path.sep).join("/");
    const content = fs.readFileSync(filePath, "utf8");
    const sf = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
    const handlers = collectExportedMutationHandlers(sf);
    if (handlers.length === 0) continue;

    const requiredGuard = CRON_AUTH_ROUTES.has(rel) ? "verifyCronSecret" : "verifySameOrigin";
    const localFns = collectHelperCallMap(sf);
    for (const handler of handlers) {
      if (nodeCallsTargetGuard(handler.body, requiredGuard, localFns)) continue;
      const line = sf.getLineAndCharacterOfPosition(handler.pos).line + 1;
      errors.push(
        `${rel}:${line} [api-mutation-csrf-guard] Exported ${handler.name} handler does not call ${requiredGuard}(request, startedAt).`,
      );
    }
  }
}
