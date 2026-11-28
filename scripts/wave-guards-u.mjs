import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const IGNORED_DIRS = new Set(["node_modules", ".next", ".turbo", "dist", "coverage"]);

function parseTs(rel, content) {
  const kind = rel.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(rel, content, ts.ScriptTarget.Latest, true, kind);
}

function getLine(sf, pos) {
  return sf.getLineAndCharacterOfPosition(pos).line + 1;
}

function collectTsFiles(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectTsFiles(full, out);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
}

function extractNumericLiteralValue(node) {
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (
    ts.isPrefixUnaryExpression(node) &&
    (node.operator === ts.SyntaxKind.MinusToken || node.operator === ts.SyntaxKind.PlusToken) &&
    ts.isNumericLiteral(node.operand)
  ) {
    const val = Number(node.operand.text);
    return node.operator === ts.SyntaxKind.MinusToken ? -val : val;
  }
  return null;
}

const G21_PREFIXES = [
  "packages/core/src/math/performance/",
  "packages/core/src/math/risk/",
  "packages/core/src/math/attribution/",
  "packages/core/src/math/guidance/",
  "packages/core/src/math/segments/",
  "packages/core/src/db/repositories/portfolio/",
  "packages/core/src/db/repositories/intel/",
];

function checkG21BinaryFallback(node, sf, rel, errors) {
  const op = node.operatorToken.kind;
  const isNullish = op === ts.SyntaxKind.QuestionQuestionToken;
  const isOr = op === ts.SyntaxKind.BarBarToken;
  if (!isNullish && !isOr) return;
  const rightNum = extractNumericLiteralValue(node.right);
  const leftIsIdOrCall = ts.isIdentifier(node.left) || ts.isCallExpression(node.left);
  if (rightNum !== null && leftIsIdOrCall && (isOr || rightNum !== 0)) {
    errors.push(
      `${rel}:${getLine(sf, node.getStart(sf))} [G21-no-fabricated-numeric-fallback] Fabricated numeric fallback (${node.getText(sf)}) is banned; propagate null + explicit status.`,
    );
  }
}

function checkG21FillCall(node, sf, rel, errors) {
  if (
    !ts.isPropertyAccessExpression(node.expression) ||
    node.expression.name.text !== "fill" ||
    node.arguments.length < 1
  ) {
    return;
  }
  const fillVal = extractNumericLiteralValue(node.arguments[0]);
  if (fillVal !== null && fillVal !== 0) {
    errors.push(
      `${rel}:${getLine(sf, node.getStart(sf))} [G21-no-fabricated-numeric-fallback] .fill(${fillVal}) fabricates synthetic numeric series; use null or zero.`,
    );
  }
}

function checkG21Node(node, sf, rel, errors) {
  if (ts.isBinaryExpression(node)) checkG21BinaryFallback(node, sf, rel, errors);
  else if (ts.isCallExpression(node)) checkG21FillCall(node, sf, rel, errors);
}

/** G21: Bans fabricated numeric fallbacks (?? nonZero, || num on id/call, .fill(nonZero)). */
export function checkG21NoFabricatedNumericFallbackAst(rel, content, errors) {
  if (!G21_PREFIXES.some((p) => rel.startsWith(p))) return;
  const sf = parseTs(rel, content);
  const visit = (node) => {
    checkG21Node(node, sf, rel, errors);
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

const G22_BANNED_LIST_PREFIXES = [
  "apps/web/src/app/api/sec/",
  "apps/web/src/app/api/internal/jobs/tick/",
  "packages/core/src/db/repositories/intel/",
];

const G22_SLICE_PERSIST_PREFIXES = [
  "apps/web/src/app/api/_lib/sec-warehouse-sync.ts",
  "apps/web/src/app/api/sec/",
  "apps/web/src/app/api/internal/jobs/tick/",
];

/** G22: Bans raw listFilingsBySecurity in periodic-filing routes/stores and snapshot.filings.slice(0, N). */
export function checkG22PeriodicFilingsGatewayAst(rel, content, errors) {
  const checkListBan = G22_BANNED_LIST_PREFIXES.some((p) => rel.startsWith(p));
  const checkSliceBan = G22_SLICE_PERSIST_PREFIXES.some((p) => rel.startsWith(p));
  if (!checkListBan && !checkSliceBan) return;
  const sf = parseTs(rel, content);
  const visit = (node) => {
    if (checkListBan && ts.isIdentifier(node) && node.text === "listFilingsBySecurity") {
      errors.push(
        `${rel}:${getLine(sf, node.getStart(sf))} [G22-periodic-filings-gateway] listFilingsBySecurity is banned here; use listPeriodicFilingsBySecurity.`,
      );
    }
    if (
      checkSliceBan &&
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "slice" &&
      ts.isPropertyAccessExpression(node.expression.expression) &&
      node.expression.expression.name.text === "filings" &&
      node.arguments.length >= 2 &&
      extractNumericLiteralValue(node.arguments[0]) === 0
    ) {
      errors.push(
        `${rel}:${getLine(sf, node.getStart(sf))} [G22-periodic-filings-gateway] Truncating .filings.slice(0, N) before persistence drops periodic filings.`,
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

/** G23 (AST): Bans share-multiplication inside nav-*.ts (split-basis close consistency). */
export function checkG23NavSplitBasisAst(rel, content, errors) {
  if (!/^packages\/core\/src\/math\/performance\/nav-.*\.ts$/.test(rel)) return;
  const sf = parseTs(rel, content);
  const visit = (node) => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.AsteriskEqualsToken &&
      /shares/i.test(node.left.getText(sf))
    ) {
      errors.push(
        `${rel}:${getLine(sf, node.getStart(sf))} [G23-price-basis-ground-truth] Mutating shares via *= in nav-*.ts causes double-counting with split-adjusted closes; use split-basis.ts.`,
      );
    } else if (ts.isIdentifier(node) && node.text === "applySplitsForHolding") {
      errors.push(
        `${rel}:${getLine(sf, node.getStart(sf))} [G23-price-basis-ground-truth] applySplitsForHolding is banned in nav-*.ts; use split-basis.ts.`,
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

const JOB_ONCE_FILE = "apps/web/src/app/api/internal/jobs/tick/job-once.ts";

function checkBuildRedlineJobKey(rel, sf, node, errors) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    if (node.text.startsWith("build_redline:") && node.text.split(":").length < 3) {
      errors.push(
        `${rel}:${getLine(sf, node.getStart(sf))} [G25-job-once-after-gateway] build_redline job key "${node.text}" must include section suffix (build_redline:{acc}:{section}).`,
      );
    }
    return;
  }
  if (ts.isTemplateExpression(node) && node.head.text.startsWith("build_redline:")) {
    const colonCount =
      (node.head.text.match(/:/g)?.length ?? 0) +
      node.templateSpans.reduce((n, sp) => n + (sp.literal.text.match(/:/g)?.length ?? 0), 0);
    if (colonCount < 2) {
      errors.push(
        `${rel}:${getLine(sf, node.getStart(sf))} [G25-job-once-after-gateway] build_redline job key template must include section suffix (build_redline:\${acc}:\${section}).`,
      );
    }
  }
}

function checkAfterImport(rel, sf, node, errors) {
  if (
    !ts.isImportDeclaration(node) ||
    !ts.isStringLiteral(node.moduleSpecifier) ||
    node.moduleSpecifier.text !== "next/server"
  ) {
    return;
  }
  const bindings = node.importClause?.namedBindings;
  if (!bindings || !ts.isNamedImports(bindings)) return;
  for (const el of bindings.elements) {
    const imported = el.propertyName?.text ?? el.name.text;
    if (imported === "after") {
      errors.push(
        `${rel}:${getLine(sf, el.getStart(sf))} [G25-job-once-after-gateway] next/server after() is restricted to ${JOB_ONCE_FILE}; route background jobs via scheduleJobOnce.`,
      );
    }
  }
}

/** G25: Restricts next/server after() to tick/job-once.ts and requires section in build_redline job ids. */
export function checkG25JobOnceAfterGatewayAst(rel, content, errors) {
  const sf = parseTs(rel, content);
  const checkAfter = rel.startsWith("apps/web/src/") && rel !== JOB_ONCE_FILE;
  const visit = (node) => {
    if (checkAfter) checkAfterImport(rel, sf, node, errors);
    checkBuildRedlineJobKey(rel, sf, node, errors);
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

/** G27: Ensures eval:live does not pass --offline, nightly runs eval:live, and retrieval tests exercise searchFilingChunksFts. */
export function checkG27EvalProductionPath(root, errors) {
  const pkgPath = path.join(root, "package.json");
  const wfPath = path.join(root, ".github/workflows/golden-eval-nightly.yml");
  const retDir = path.join(root, "packages/ai/src/retrieval");
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    const liveCmd = pkg.scripts?.["eval:live"] ?? "";
    if (!liveCmd || liveCmd.includes("--offline")) {
      errors.push(
        `package.json:1 [G27-eval-exercises-production-path] scripts["eval:live"] must exist and never pass --offline.`,
      );
    }
  }
  if (fs.existsSync(wfPath)) {
    const wf = fs.readFileSync(wfPath, "utf8");
    if (!wf.includes("pnpm eval:live") || wf.includes("--offline")) {
      errors.push(
        `.github/workflows/golden-eval-nightly.yml:1 [G27-eval-exercises-production-path] Nightly workflow must run "pnpm eval:live" without --offline.`,
      );
    }
  }
  if (fs.existsSync(retDir)) {
    const hasFtsTest = fs
      .readdirSync(retDir)
      .filter((f) => f.endsWith(".test.ts"))
      .some((f) => fs.readFileSync(path.join(retDir, f), "utf8").includes("searchFilingChunksFts"));
    if (!hasFtsTest) {
      errors.push(
        `packages/ai/src/retrieval:1 [G27-eval-exercises-production-path] At least one retrieval test must exercise production searchFilingChunksFts.`,
      );
    }
  }
}

const G29_PREFIXES = [
  "apps/web/src/features/portfolio/",
  "apps/web/src/features/cockpit/components/overlays/",
  "apps/web/src/features/valuation/components/drivers/",
];

function hasRawDollarMoneyText(text) {
  return /\$\d/.test(text) || /\(\$(?:B|M)?\)/.test(text) || /\$\s*$/.test(text);
}

/** G29: Bans literal '$' currency formatting in portfolio/overlay/driver UI; enforce formatMoney(value, currency). */
export function checkG29MoneyCurrencyExplicitAst(rel, content, errors) {
  if (!G29_PREFIXES.some((p) => rel.startsWith(p))) return;
  const sf = parseTs(rel, content);
  const report = (node) => {
    errors.push(
      `${rel}:${getLine(sf, node.getStart(sf))} [G29-money-currency-explicit] Raw literal "$" currency formatting is banned; use formatMoney(value, currency) from @kanon/ui.`,
    );
  };
  const visit = (node) => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      if (hasRawDollarMoneyText(node.text)) report(node);
    } else if (ts.isJsxText(node)) {
      if (hasRawDollarMoneyText(node.text)) report(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

const ENTRY_FILES = [
  "packages/core/src/index.ts",
  "packages/core/src/db/index.ts",
  "packages/ai/src/index.ts",
];

function resolveLocalTsFile(fromFile, spec) {
  if (!spec.startsWith(".")) return null;
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const cand of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (fs.existsSync(cand)) return cand;
  }
  return null;
}

function collectNamedReExports(target, clause, out) {
  const sub = [];
  collectExportedFunctions(target, new Set(), sub);
  const fnSet = new Set(sub.map((s) => s.name));
  for (const el of clause.elements) {
    if (el.isTypeOnly) continue;
    const orig = el.propertyName?.text ?? el.name.text;
    if (fnSet.has(orig)) out.push({ name: el.name.text, file: target });
  }
}

function collectExportStatement(norm, stmt, visited, out) {
  const isExported = stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  if (isExported && ts.isFunctionDeclaration(stmt) && stmt.name) {
    out.push({ name: stmt.name.text, file: norm });
    return;
  }
  if (
    !ts.isExportDeclaration(stmt) ||
    !stmt.moduleSpecifier ||
    !ts.isStringLiteral(stmt.moduleSpecifier)
  ) {
    return;
  }
  const target = resolveLocalTsFile(norm, stmt.moduleSpecifier.text);
  if (!target) return;
  if (!stmt.exportClause) {
    collectExportedFunctions(target, visited, out);
  } else if (ts.isNamedExports(stmt.exportClause)) {
    collectNamedReExports(target, stmt.exportClause, out);
  }
}

function collectExportedFunctions(filePath, visited, out) {
  const norm = path.resolve(filePath);
  if (visited.has(norm) || !fs.existsSync(norm)) return;
  visited.add(norm);
  const sf = parseTs(norm, fs.readFileSync(norm, "utf8"));
  for (const stmt of sf.statements) {
    collectExportStatement(norm, stmt, visited, out);
  }
}

function hasProductionCaller(name, definingFile, barrelSet, contentsByFile) {
  const tokenRe = new RegExp(`\\b${name}\\b`);
  for (const [fileAbs, text] of contentsByFile) {
    if (fileAbs === definingFile || barrelSet.has(fileAbs)) continue;
    if (tokenRe.test(text)) return true;
  }
  return false;
}

function checkEntryExportsUsed(root, entryRel, ctx, errors) {
  const entryAbs = path.join(root, entryRel);
  if (!fs.existsSync(entryAbs)) return;
  const exported = [];
  collectExportedFunctions(entryAbs, new Set(), exported);
  for (const exp of exported) {
    const key = `${exp.name}@${exp.file}`;
    if (ctx.checked.has(key) || ctx.allowSet.has(exp.name)) continue;
    ctx.checked.add(key);
    if (!hasProductionCaller(exp.name, exp.file, ctx.barrelSet, ctx.contentsByFile)) {
      const rel = path.relative(root, exp.file).split(path.sep).join("/");
      errors.push(
        `${rel}:1 [G30-entry-export-prod-callers] Exported function "${exp.name}" (from ${entryRel}) has zero non-test callers.`,
      );
    }
  }
}

/** G30: Checks entry-point exported functions in @kanon/core, @kanon/core/db, @kanon/ai have >= 1 non-test caller. */
export function checkG30EntryExportProdCallers(root, errors, opts = {}) {
  const entryList = opts.entryFiles ?? ENTRY_FILES;
  const prodFiles = [];
  for (const dir of ["apps", "packages"]) {
    collectTsFiles(path.join(root, dir), prodFiles);
  }
  const ctx = {
    barrelSet: new Set(
      prodFiles.filter((f) => f.endsWith("/index.ts") || f.endsWith("\\index.ts")),
    ),
    contentsByFile: new Map(prodFiles.map((f) => [path.resolve(f), fs.readFileSync(f, "utf8")])),
    allowSet: new Set(opts.allowlist ?? []),
    checked: new Set(),
  };
  for (const entryRel of entryList) {
    checkEntryExportsUsed(root, entryRel, ctx, errors);
  }
}

/** Runs Wave U mechanical L2 guards (G21, G22, G23-AST, G25, G27, G29, G30). */
export function checkWaveGuardsU(root, errors) {
  const files = [];
  for (const dir of ["apps", "packages"]) {
    collectTsFiles(path.join(root, dir), files);
  }
  for (const filePath of files) {
    const rel = path.relative(root, filePath).split(path.sep).join("/");
    const content = fs.readFileSync(filePath, "utf8");
    checkG21NoFabricatedNumericFallbackAst(rel, content, errors);
    checkG22PeriodicFilingsGatewayAst(rel, content, errors);
    checkG23NavSplitBasisAst(rel, content, errors);
    checkG25JobOnceAfterGatewayAst(rel, content, errors);
    checkG29MoneyCurrencyExplicitAst(rel, content, errors);
  }
  checkG27EvalProductionPath(root, errors);
  checkG30EntryExportProdCallers(root, errors);
}
