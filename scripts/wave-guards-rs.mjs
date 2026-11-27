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

/** Runs Wave R/S/T AST-level L2 mechanical guards (G6+, G13, and subsequent wave guards). */
export function checkWaveGuardsRs(root, errors) {
  const dirs = ["apps/web/src", "packages/ai/src", "packages/core/src"];
  for (const d of dirs) {
    const files = [];
    walkTsFiles(path.join(root, d), files);
    for (const full of files) {
      const rel = path.relative(root, full).split(path.sep).join("/");
      const content = fs.readFileSync(full, "utf8");
      checkG6PlusValuationLiteralsAst(rel, content, errors);
      checkG13SecFetchGatewayAst(rel, content, errors);
    }
  }
}
