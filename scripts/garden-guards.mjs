import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const MAX_DIR_SOURCE_FILES = 12;
const IGNORED_DIRS = new Set(["node_modules", ".next", ".turbo", "dist", "coverage"]);
const BUILTIN_PNPM_SUBCOMMANDS = new Set(["install", "exec", "dlx", "add", "remove", "filter"]);
const DESTRUCTIVE_SQL_RE =
  /\b(?:DROP\s+TABLE|DROP\s+COLUMN|TRUNCATE\s+TABLE|ALTER\s+TABLE\s+\w+\s+ALTER\s+COLUMN\s+\w+\s+(?:SET\s+DATA\s+)?TYPE)\b/i;

function addError(errors, relPath, line, rule, message) {
  errors.push(`${relPath}:${line} [${rule}] ${message}`);
}

function getLine(sf, pos) {
  return sf.getLineAndCharacterOfPosition(pos).line + 1;
}

export function checkUniversalDirDensity(rootDir, errors) {
  const roots = [
    path.join(rootDir, "apps/web/src"),
    path.join(rootDir, "packages/ui/src"),
    path.join(rootDir, "packages/core/src"),
    path.join(rootDir, "packages/ai/src"),
  ];

  function walkDir(dirPath) {
    if (!fs.existsSync(dirPath)) return;
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const srcFiles = entries.filter(
      (e) => e.isFile() && /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name),
    );
    if (srcFiles.length > MAX_DIR_SOURCE_FILES) {
      const rel = path.relative(rootDir, dirPath).split(path.sep).join("/");
      addError(
        errors,
        rel,
        1,
        "universal-max-directory-files",
        `Directory has ${srcFiles.length} source files (limit: ${MAX_DIR_SOURCE_FILES}). Split into bounded domain subdirectories with clean index.ts barrels.`,
      );
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !IGNORED_DIRS.has(entry.name)) {
        walkDir(path.join(dirPath, entry.name));
      }
    }
  }

  for (const r of roots) walkDir(r);
}

export function checkExpandOnlyMigrations(rootDir, errors) {
  const migDir = path.join(rootDir, "packages/core/src/db/migrations");
  if (!fs.existsSync(migDir)) return;
  for (const entry of fs.readdirSync(migDir, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.(ts|sql)$/.test(entry.name)) continue;
    const fullPath = path.join(migDir, entry.name);
    const rel = path.relative(rootDir, fullPath).split(path.sep).join("/");
    const lines = fs.readFileSync(fullPath, "utf8").split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      if (DESTRUCTIVE_SQL_RE.test(lines[i] ?? "")) {
        addError(
          errors,
          rel,
          i + 1,
          "expand-only-migrations",
          "Destructive SQL violates expand-only migration rule. Add nullable/defaulted columns or new tables instead so rollbacks stay zero-downtime.",
        );
      }
    }
  }
}

function checkDocsLineScripts(line, lineNo, scripts, errors) {
  for (const match of line.matchAll(/\bpnpm\s+([a-z][a-z0-9:_-]*)\b/g)) {
    const cmd = match[1];
    if (!cmd || BUILTIN_PNPM_SUBCOMMANDS.has(cmd) || scripts.has(cmd)) continue;
    addError(
      errors,
      "AGENTS.md",
      lineNo,
      "docs-entry-parity",
      `Referenced command "pnpm ${cmd}" does not exist in root package.json scripts.`,
    );
  }
}

function checkDocsLineLinks(rootDir, line, lineNo, errors) {
  for (const match of line.matchAll(/\]\((?!https?:\/\/|#|mailto:)([^)]+)\)/g)) {
    const target = match[1]?.split("#")[0];
    if (!target || fs.existsSync(path.resolve(rootDir, target))) continue;
    addError(
      errors,
      "AGENTS.md",
      lineNo,
      "docs-entry-parity",
      `Broken local link "${target}" in AGENTS.md. Update or remove stale reference.`,
    );
  }
}

export function checkDocsEntryParity(rootDir, errors) {
  const agentsPath = path.join(rootDir, "AGENTS.md");
  const pkgPath = path.join(rootDir, "package.json");
  if (!fs.existsSync(agentsPath) || !fs.existsSync(pkgPath)) return;
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const scripts = new Set(Object.keys(pkg.scripts ?? {}));
  const lines = fs.readFileSync(agentsPath, "utf8").split("\n");

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    checkDocsLineScripts(line, i + 1, scripts, errors);
    checkDocsLineLinks(rootDir, line, i + 1, errors);
  }
}

function unwrapExpr(node) {
  let cur = node;
  while (ts.isParenthesizedExpression(cur) || ts.isAwaitExpression(cur)) {
    cur = cur.expression;
  }
  return cur;
}

function isJsonDeserializationCall(node, sf) {
  const inner = unwrapExpr(node);
  if (!ts.isCallExpression(inner)) return false;
  const text = inner.expression.getText(sf);
  return text === "JSON.parse" || text.endsWith(".json");
}

function isTypeOnlyImportClause(clause) {
  if (clause?.isTypeOnly) return true;
  if (!clause?.namedBindings || !ts.isNamedImports(clause.namedBindings)) return false;
  return clause.namedBindings.elements.every((el) => el.isTypeOnly);
}

function checkRuntimeAiImport(relPath, sf, node, isClientSlice, errors) {
  if (!isClientSlice || !ts.isImportDeclaration(node)) return;
  if (!ts.isStringLiteral(node.moduleSpecifier) || node.moduleSpecifier.text !== "@kanon/ai") {
    return;
  }
  if (!isTypeOnlyImportClause(node.importClause)) {
    addError(
      errors,
      relPath,
      getLine(sf, node.getStart(sf)),
      "no-client-runtime-ai-import",
      "Client slices MUST NOT import runtime modules from @kanon/ai. Import Zod schemas from @kanon/core or use `import type` only.",
    );
  }
}

export function checkGardenAstRules(relPath, sf, isTestFile, errors) {
  if (isTestFile) return;
  const isClientSlice = /^apps\/web\/src\/(?:features|shared)\//.test(relPath);

  function walk(node) {
    if (ts.isAsExpression(node) && isJsonDeserializationCall(node.expression, sf)) {
      addError(
        errors,
        relPath,
        getLine(sf, node.getStart(sf)),
        "no-unchecked-json-cast",
        "Unchecked JSON cast forbidden. Validate with kanonFetch(url, ZodSchema) or Schema.safeParse(...) from @kanon/core.",
      );
    }
    if (ts.isCatchClause(node) && node.block.statements.length === 0) {
      addError(
        errors,
        relPath,
        getLine(sf, node.getStart(sf)),
        "no-silent-catch",
        "Empty catch block silently swallows errors. Capture the error and propagate fallbackReason or return a typed fallback result.",
      );
    }
    checkRuntimeAiImport(relPath, sf, node, isClientSlice, errors);
    ts.forEachChild(node, walk);
  }

  walk(sf);
}

function lineAtIndex(source, index) {
  return source.slice(0, index).split("\n").length;
}

function checkDistortedSvgCircles(html, relPath, errors) {
  for (const match of html.matchAll(/<svg\b([^>]*)>([\s\S]*?)<\/svg>/gi)) {
    const attrs = match[1] ?? "";
    const body = match[2] ?? "";
    if (/preserveAspectRatio\s*=\s*["']none["']/i.test(attrs) && /<circle\b/i.test(body)) {
      addError(
        errors,
        relPath,
        lineAtIndex(html, match.index ?? 0),
        "svg-no-distorted-circles",
        'SVG containing <circle> MUST NOT use preserveAspectRatio="none" (distorts circles into ovals; .rules/editorial-craft.md §4).',
      );
    }
  }
}

function checkAnimatedSvgFillBox(html, relPath, cls, block, matchIndex, errors) {
  const needsFillBox =
    /transform-origin\s*:\s*center\b/.test(block) &&
    /animation\s*:/.test(block) &&
    !/transform-box\s*:\s*fill-box\b/.test(block);
  if (!needsFillBox) return;
  const svgChildRe = new RegExp(
    `<(?:circle|path|rect|ellipse|polygon|g)\\b[^>]*class\\s*=\\s*["'][^"']*\\b${cls}\\b`,
    "i",
  );
  if (!svgChildRe.test(html)) return;
  addError(
    errors,
    relPath,
    lineAtIndex(html, matchIndex),
    "svg-beacon-fill-box",
    `Animated SVG class ".${cls}" uses transform-origin: center without transform-box: fill-box (causes element to fly off-canvas; .rules/editorial-craft.md §4).`,
  );
}

function checkSvgStrokeDrawPaths(html, relPath, strokeDrawClasses, errors) {
  for (const cls of strokeDrawClasses) {
    const pathRe = new RegExp(
      `<path\\b([^>]*class\\s*=\\s*["'][^"']*\\b${cls}\\b[^"']*["'][^>]*)>`,
      "gi",
    );
    for (const match of html.matchAll(pathRe)) {
      if (!/\bpathLength\s*=\s*["']100["']/.test(match[1] ?? "")) {
        addError(
          errors,
          relPath,
          lineAtIndex(html, match.index ?? 0),
          "svg-pathlength-draw",
          `Animated stroke-draw <path class="${cls}"> MUST declare pathLength="100" instead of hardcoded pixel dasharray (.rules/editorial-craft.md §4).`,
        );
      }
    }
  }
}

export function checkMarketingOpticalGuards(rootDir, errors) {
  const relPath = "marketing/index.html";
  const filePath = path.join(rootDir, relPath);
  if (!fs.existsSync(filePath)) return;
  const html = fs.readFileSync(filePath, "utf8");
  checkDistortedSvgCircles(html, relPath, errors);

  const strokeDrawClasses = new Set();
  for (const match of html.matchAll(/\.([a-zA-Z0-9_-]+)\s*\{([^}]*)\}/g)) {
    const cls = match[1] ?? "";
    const block = match[2] ?? "";
    if (/stroke-dashoffset\s*:/.test(block) && /animation\s*:/.test(block)) {
      strokeDrawClasses.add(cls);
    }
    checkAnimatedSvgFillBox(html, relPath, cls, block, match.index ?? 0, errors);
  }
  checkSvgStrokeDrawPaths(html, relPath, strokeDrawClasses, errors);
}
