import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { checkApiMutationCsrfGuard } from "./api-security-guards.mjs";
import { checkExtendedAstGuards } from "./ast-guard-rules.mjs";
import {
  checkDocsEntryParity,
  checkEditorialUiHygiene,
  checkExpandOnlyMigrations,
  checkGardenAstRules,
  checkMarketingOpticalGuards,
  checkUniversalDirDensity,
} from "./garden-guards.mjs";
import { checkWaveGuards } from "./wave-guards.mjs";
import { checkWaveGuardsRs } from "./wave-guards-rs.mjs";
import { checkWaveGuardsU } from "./wave-guards-u.mjs";
import { checkWaveGuardsV } from "./wave-guards-v.mjs";

const ROOT = process.cwd();
const SCAN_DIRS = ["apps", "packages"];
const IGNORED_DIRS = new Set(["node_modules", ".next", ".turbo", "dist", "coverage"]);
const MAX_FILE_LINES = 250;
const MAX_FN_LINES = 50;
const MAX_NESTING = 3;

const HEX_COLOR_RE = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/;
const FUNC_COLOR_RE = /\b(?:rgba?|hsla?)\s*\(/i;
const RAW_PALETTE_RE =
  /\b(?:bg|text|border|ring|fill|stroke)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:-\d{2,3})?(?:\/\d{1,3})?\b/;
const NOISY_MOTION_RE = /\banimate-(?:bounce|ping)\b/;
const RAW_ZINDEX_RE = /\bz-\[\d{2,}\]/;
const RAW_RADIUS_RE = /\brounded-(?:sm|md|lg|xl|2xl|3xl)\b/;
const TINY_TEXT_RE = /\btext-\[(?:[1-9]|1[01])(?:\.\d+)?px\]/;
const TS_SUPPRESS_RE = /@ts-(?:ignore|nocheck)\b/;
const TYPE_ESCAPE_RE = /\bas\s+(?:any|never|unknown\s+as)\b/;
const SPRING_LITERAL_RE = /\b(?:stiffness|damping)\s*:/;
const BLUR_FILTER_MOTION_RE = /\bfilter\s*:\s*["']blur\(/;
const USER_DB_JARGON_RE = /\bPostgreSQL\b|\bPostgres\b|落库/;
const COLLOQUIAL_COPY_RE =
  /事前验尸|商业模式滤镜|商业滤镜|水电煤|死因链条|红队挑刺|红队拷问|苛刻空头|恐慌想割|法证体检|法证排雷|印钞机|烧钱黑洞|拍脑袋|一票否决|真·反向|靠运气/;
const DASHED_BANNER_RE =
  /\bborder-dashed\b.*\bbg-(?:accent-coral|status-)|\bbg-(?:accent-coral|status-).*\bborder-dashed\b/;
const PRESS_SCALE_RE = /\bactive:scale-/;
const STEP_NAME_OBJECT_RE =
  /\b(?:id|step):\s*[1-5],\s*(?:code:\s*"0[1-5]",\s*)?(?:label|title):\s*"/;
const STEP_NAME_RECORD_RE =
  /^\s*[1-5]:\s*"(?:商业质量|核心假设|一阶资料|资料印证|一阶印证|财报印证|估值赔率|三情景|交易纪律|纪律与)/;

const NESTING_KINDS = new Set([
  ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement,
  ts.SyntaxKind.SwitchStatement,
  ts.SyntaxKind.TryStatement,
]);

function collectFiles(dirPath, results) {
  if (!fs.existsSync(dirPath)) return;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      collectFiles(fullPath, results);
      continue;
    }
    if (/\.(ts|tsx|css)$/.test(entry.name)) {
      results.push(fullPath);
    }
  }
}

function addError(errors, relPath, line, rule, message) {
  errors.push(`${relPath}:${line} [${rule}] ${message}`);
}

function checkTextRules(relPath, lines, errors) {
  const isTokenSheet = relPath === "packages/ui/src/styles/tokens.css";
  const isMotionSource = relPath === "packages/ui/src/lib/motion.ts";
  const isTestFile = /\.test\.tsx?$/.test(relPath);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const lineNo = i + 1;
    checkSingleLine(relPath, line, lineNo, { isTokenSheet, isMotionSource, isTestFile }, errors);
  }
}

function checkEditorialLineRules(relPath, line, lineNo, flags, errors) {
  if (!flags.isMotionSource && !flags.isTestFile && SPRING_LITERAL_RE.test(line)) {
    addError(errors, relPath, lineNo, "locked-motion-token", "Import KANON_SPRING from @kanon/ui.");
  }
  if (!flags.isTestFile && BLUR_FILTER_MOTION_RE.test(line)) {
    addError(
      errors,
      relPath,
      lineNo,
      "no-filter-blur-transition",
      'Animating filter: "blur(...)" causes GPU repaint jank on heavy cards/tables. Use opacity/transform only (.rules/editorial-craft.md §2).',
    );
  }
  if (
    !flags.isTestFile &&
    /^apps\/web\/src\/features\//.test(relPath) &&
    USER_DB_JARGON_RE.test(line)
  ) {
    addError(
      errors,
      relPath,
      lineNo,
      "no-user-facing-db-jargon",
      "Avoid exposing Postgres/PostgreSQL/落库 infrastructure jargon in user-facing UI features (.rules/editorial-craft.md §1).",
    );
  }
  if (
    !flags.isTestFile &&
    /^(?:apps\/web\/src\/features|packages\/core\/src|packages\/ai\/src)\//.test(relPath) &&
    COLLOQUIAL_COPY_RE.test(line)
  ) {
    addError(
      errors,
      relPath,
      lineNo,
      "institutional-copy-hygiene",
      "Colloquial or morbid phrasing forbidden. Use dignified institutional buy-side Chinese (e.g. 商业质量评估, 逆向压力推演, 反向质询, 财务法证, 暂不纳入) (.rules/editorial-craft.md §1).",
    );
  }
  if (
    !flags.isTestFile &&
    !flags.isTokenSheet &&
    /^(?:apps\/web\/src|packages\/ui\/src)\//.test(relPath) &&
    RAW_RADIUS_RE.test(line)
  ) {
    addError(
      errors,
      relPath,
      lineNo,
      "semantic-radius-only",
      "Raw Tailwind radius breaks concentric corner geometry. Use KANON semantic radius tokens (rounded-card, rounded-panel, rounded-control, rounded-item, rounded-badge, rounded-pill) (.rules/editorial-craft.md §2).",
    );
  }
  if (
    !flags.isTestFile &&
    /^(?:apps\/web\/src|packages\/ui\/src)\//.test(relPath) &&
    PRESS_SCALE_RE.test(line)
  ) {
    addError(
      errors,
      relPath,
      lineNo,
      "no-press-scale",
      "active:scale-* causes jittery micro-shrink on editorial buttons. Use crisp color/border feedback only (.rules/editorial-craft.md §2).",
    );
  }
}

function checkStepNameSource(relPath, line, lineNo, flags, errors) {
  if (flags.isTestFile || !/^apps\/web\/src\//.test(relPath)) return;
  if (!STEP_NAME_OBJECT_RE.test(line) && !STEP_NAME_RECORD_RE.test(line)) return;
  addError(
    errors,
    relPath,
    lineNo,
    "single-source-step-names",
    "Five-step canvas names must come from RESEARCH_STEP_META / getResearchStepMeta in @kanon/core, never local label maps.",
  );
}

function checkSingleLine(relPath, line, lineNo, flags, errors) {
  if (TS_SUPPRESS_RE.test(line)) {
    addError(
      errors,
      relPath,
      lineNo,
      "no-ts-suppress",
      "Fix the strict type instead of suppressing TS.",
    );
  }
  if (!flags.isTestFile && TYPE_ESCAPE_RE.test(line)) {
    addError(
      errors,
      relPath,
      lineNo,
      "no-type-escape-hatch",
      "Avoid `as any` / `as never` / `as unknown as`. Model types via Zod/Drizzle or declare global.",
    );
  }
  if (NOISY_MOTION_RE.test(line)) {
    addError(
      errors,
      relPath,
      lineNo,
      "aesthetic-motion",
      "No playful bounce/ping. Use KANON_SPRING.",
    );
  }
  if (!flags.isTestFile && DASHED_BANNER_RE.test(line)) {
    addError(
      errors,
      relPath,
      lineNo,
      "no-dashed-banner-in-form",
      "Dashed colored alert banners clutter editorial forms. Use a quiet inline trigger link instead.",
    );
  }
  if (RAW_ZINDEX_RE.test(line)) {
    addError(errors, relPath, lineNo, "z-index-scale", "Use semantic Tailwind z-10..z-50 scale.");
  }
  if (TINY_TEXT_RE.test(line)) {
    addError(
      errors,
      relPath,
      lineNo,
      "min-readable-font-size",
      "Font size < 12px creates visual clutter. Use text-xs (12px) minimum and text-sm (14px+) for body copy.",
    );
  }
  checkEditorialLineRules(relPath, line, lineNo, flags, errors);
  checkStepNameSource(relPath, line, lineNo, flags, errors);
  if (flags.isTokenSheet || flags.isTestFile) return;
  checkColorLine(relPath, line, lineNo, errors);
}

function checkColorLine(relPath, line, lineNo, errors) {
  if (HEX_COLOR_RE.test(line)) {
    addError(
      errors,
      relPath,
      lineNo,
      "no-hardcoded-hex",
      "Hardcoded Hex color forbidden. Use semantic CSS tokens from packages/ui/src/styles/tokens.css.",
    );
  }
  if (FUNC_COLOR_RE.test(line)) {
    addError(
      errors,
      relPath,
      lineNo,
      "no-raw-color-fn",
      "Raw rgb()/hsl() forbidden outside tokens.css. Use semantic tokens or color-mix() in tokens.css.",
    );
  }
  if (RAW_PALETTE_RE.test(line)) {
    addError(
      errors,
      relPath,
      lineNo,
      "no-raw-tailwind-palette",
      "Raw Tailwind palette colors break Light/Dark cohesion. Use KANON tokens (bg-canvas, bg-surface, text-ink-primary, etc.).",
    );
  }
}

function getLine(sf, pos) {
  return sf.getLineAndCharacterOfPosition(pos).line + 1;
}

function isFunctionLike(node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node) ||
    ts.isMethodDeclaration(node)
  );
}

function checkAstRules(relPath, content, errors) {
  const isTsx = relPath.endsWith(".tsx");
  const isTestFile = /\.test\.tsx?$/.test(relPath);
  const kind = isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(relPath, content, ts.ScriptTarget.Latest, true, kind);

  function walk(node, depth) {
    const nextDepth = NESTING_KINDS.has(node.kind) ? depth + 1 : depth;
    if (nextDepth > MAX_NESTING && !isTestFile) {
      addError(
        errors,
        relPath,
        getLine(sf, node.getStart(sf)),
        "max-nesting-depth",
        `Nesting depth ${nextDepth} exceeds limit of ${MAX_NESTING}. Extract helper or use early returns.`,
      );
    }
    if (isFunctionLike(node) && !isTestFile) {
      checkFunctionLength(relPath, sf, node, errors);
      ts.forEachChild(node, (child) => walk(child, 0));
      return;
    }
    if (isTsx && (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node))) {
      checkTablerIconStroke(relPath, sf, node, errors);
    }
    ts.forEachChild(node, (child) => walk(child, nextDepth));
  }

  walk(sf, 0);
  checkExtendedAstGuards(relPath, sf, isTestFile, errors);
  checkGardenAstRules(relPath, sf, isTestFile, errors);
}

function checkFunctionLength(relPath, sf, node, errors) {
  const startLine = getLine(sf, node.getStart(sf));
  const endLine = getLine(sf, node.getEnd());
  const span = endLine - startLine + 1;
  if (span > MAX_FN_LINES) {
    addError(
      errors,
      relPath,
      startLine,
      "max-function-lines",
      `Function spans ${span} lines (limit: ${MAX_FN_LINES}). Split into smaller helpers/sub-components.`,
    );
  }
}

function checkTablerIconStroke(relPath, sf, node, errors) {
  const tag = node.tagName.getText(sf);
  if (!/^Icon[A-Z]/.test(tag)) return;
  const strokeAttr = node.attributes.properties.find(
    (prop) => ts.isJsxAttribute(prop) && prop.name.getText(sf) === "stroke",
  );
  if (!strokeAttr || !ts.isJsxAttribute(strokeAttr)) {
    addError(
      errors,
      relPath,
      getLine(sf, node.getStart(sf)),
      "tabler-stroke-width",
      `<${tag}> MUST specify stroke={1.5} (AGENTS.md §4).`,
    );
    return;
  }
  const initText = strokeAttr.initializer?.getText(sf) ?? "";
  if (initText !== "{1.5}") {
    addError(
      errors,
      relPath,
      getLine(sf, node.getStart(sf)),
      "tabler-stroke-width",
      `<${tag}> uses stroke=${initText}; MUST be stroke={1.5} (AGENTS.md §4).`,
    );
  }
}

function main() {
  const files = [];
  for (const dir of SCAN_DIRS) {
    collectFiles(path.join(ROOT, dir), files);
  }
  const errors = [];
  checkUniversalDirDensity(ROOT, errors);
  checkExpandOnlyMigrations(ROOT, errors);
  checkDocsEntryParity(ROOT, errors);
  checkMarketingOpticalGuards(ROOT, errors);
  checkEditorialUiHygiene(ROOT, errors);
  checkApiMutationCsrfGuard(ROOT, errors);
  checkWaveGuards(ROOT, errors);
  checkWaveGuardsRs(ROOT, errors);
  checkWaveGuardsU(ROOT, errors);
  checkWaveGuardsV(ROOT, errors);
  for (const filePath of files) {
    const relPath = path.relative(ROOT, filePath).split(path.sep).join("/");
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split("\n");
    if (lines.length > MAX_FILE_LINES && !/\.test\.tsx?$/.test(relPath)) {
      addError(
        errors,
        relPath,
        lines.length,
        "max-file-lines",
        `File has ${lines.length} lines (limit: ${MAX_FILE_LINES}). Split cleanly into sub-modules.`,
      );
    }
    checkTextRules(relPath, lines, errors);
    if (/\.tsx?$/.test(relPath)) {
      checkAstRules(relPath, content, errors);
    }
  }
  if (errors.length > 0) {
    process.stderr.write(`KANON Design & Limits Gate failed (${errors.length} violation(s)):\n`);
    for (const err of errors) {
      process.stderr.write(`  - ${err}\n`);
    }
    process.exit(1);
  }
  process.stdout.write(`KANON Design & Limits Gate passed (${files.length} files verified).\n`);
}

main();
