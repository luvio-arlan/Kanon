import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const MAX_DIR_COMPONENT_FILES = 12;
const MAX_USE_EFFECT_PER_FILE = 1;
const POPOVER_TAGS = new Set(["GlossaryText", "GlossaryPopoverCard"]);

function getLine(sf, pos) {
  return sf.getLineAndCharacterOfPosition(pos).line + 1;
}

function addError(errors, relPath, line, rule, message) {
  errors.push(`${relPath}:${line} [${rule}] ${message}`);
}

export function checkFeatureDirDensity(rootDir, errors) {
  const featuresRoot = path.join(rootDir, "apps/web/src/features");
  if (!fs.existsSync(featuresRoot)) return;
  for (const slice of fs.readdirSync(featuresRoot, { withFileTypes: true })) {
    if (!slice.isDirectory()) continue;
    const compDir = path.join(featuresRoot, slice.name, "components");
    if (!fs.existsSync(compDir)) continue;
    const count = fs
      .readdirSync(compDir, { withFileTypes: true })
      .filter((e) => e.isFile() && /\.(ts|tsx)$/.test(e.name)).length;
    if (count > MAX_DIR_COMPONENT_FILES) {
      addError(
        errors,
        `apps/web/src/features/${slice.name}/components`,
        1,
        "max-directory-files",
        `Directory has ${count} files (limit: ${MAX_DIR_COMPONENT_FILES}). Split into focused bounded feature slices.`,
      );
    }
  }
}

function checkJsxGuard(relPath, sf, node, ctx, errors) {
  const tag = node.tagName.getText(sf);
  const line = getLine(sf, node.getStart(sf));
  if (tag === "Card" && ctx.insideCard) {
    addError(
      errors,
      relPath,
      line,
      "no-box-in-box-card",
      "Nested <Card> inside <Card> creates box-in-box clutter. Use divide-y hairlines or SegmentedTabs instead.",
    );
  }
  if (POPOVER_TAGS.has(tag) && ctx.insideP) {
    addError(
      errors,
      relPath,
      line,
      "no-block-popover-in-p",
      `<${tag}> inside <p> risks SSR HTML auto-closing (React #418). Wrap the text container in <div> instead.`,
    );
  }
}

function checkCallGuard(relPath, sf, node, state, errors) {
  const callee = node.expression.getText(sf);
  if (callee === "useEffect") {
    state.useEffectCount += 1;
  }
  if (state.isFeatureComponent && callee === "fetch") {
    addError(
      errors,
      relPath,
      getLine(sf, node.getStart(sf)),
      "no-raw-fetch-in-components",
      "Raw fetch() inside feature components is forbidden. Extract network calls into features/<slice>/lib/*-api.ts or hooks/*-api.ts.",
    );
  }
}

export function checkExtendedAstGuards(relPath, sf, isTestFile, errors) {
  if (isTestFile) return;
  const state = {
    isFeatureComponent: /^apps\/web\/src\/features\/[^/]+\/components\//.test(relPath),
    useEffectCount: 0,
  };

  function walk(node, ctx) {
    if (ts.isCallExpression(node)) {
      checkCallGuard(relPath, sf, node, state, errors);
    }
    if (ts.isJsxElement(node)) {
      const tag = node.openingElement.tagName.getText(sf);
      checkJsxGuard(relPath, sf, node.openingElement, ctx, errors);
      const nextCtx = {
        insideCard: ctx.insideCard || tag === "Card",
        insideP: ctx.insideP || tag === "p",
      };
      for (const child of node.children) walk(child, nextCtx);
      return;
    }
    if (ts.isJsxSelfClosingElement(node)) {
      checkJsxGuard(relPath, sf, node, ctx, errors);
    }
    ts.forEachChild(node, (child) => walk(child, ctx));
  }

  walk(sf, { insideCard: false, insideP: false });

  if (state.useEffectCount > MAX_USE_EFFECT_PER_FILE) {
    addError(
      errors,
      relPath,
      1,
      "max-use-effect",
      `File has ${state.useEffectCount} useEffect calls (limit: ${MAX_USE_EFFECT_PER_FILE}). Extract side effects into a dedicated custom hook or derive state synchronously.`,
    );
  }
}
