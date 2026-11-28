#!/usr/bin/env node
/**
 * Deterministic AI-native codebase topology generator (`docs/CODEBASE_MAP.md`).
 * Enforced byte-for-byte by G42 (`checkG42CodebaseMapParity` in `scripts/wave-guards-v.mjs`)
 * so any AI agent landing in KANON immediately knows where every route, feature, table,
 * repository, math engine, contract, AI module, UI component, and guard lives.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const IGNORED = new Set(["node_modules", ".next", ".turbo", "dist", "coverage"]);
const TEST_RE = /\.test\.(?:ts|tsx|mjs)$/;

function relPosix(root, fullPath) {
  return path.relative(root, fullPath).split(path.sep).join("/");
}

function listFiles(dir, predicate) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const walk = (cur) => {
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      if (IGNORED.has(entry.name) || entry.name.startsWith(".")) continue;
      const full = path.join(cur, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (predicate(entry.name, full)) out.push(full);
    }
  };
  walk(dir);
  return out.sort();
}

function listImmediateDirs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter(
      (e) =>
        e.isDirectory() &&
        !IGNORED.has(e.name) &&
        !e.name.startsWith("_") &&
        !e.name.startsWith("."),
    )
    .map((e) => e.name)
    .sort();
}

function listSourceBasenames(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && /\.(?:ts|tsx)$/.test(e.name) && !TEST_RE.test(e.name))
    .map((e) => e.name.replace(/\.(?:ts|tsx)$/, ""))
    .sort();
}

function extractRouteMethods(filePath) {
  const src = fs.readFileSync(filePath, "utf8");
  const methods = [];
  for (const m of ["GET", "POST", "PATCH", "PUT", "DELETE"]) {
    if (
      new RegExp(`export\\s+(?:async\\s+)?function\\s+${m}\\b|export\\s+const\\s+${m}\\s*=`).test(
        src,
      )
    ) {
      methods.push(m);
    }
  }
  return methods.join(", ") || "HANDLER";
}

function groupBySubdir(baseDir) {
  const groups = new Map();
  const rootFiles = listSourceBasenames(baseDir);
  if (rootFiles.length > 0) groups.set("(root)", rootFiles);
  for (const sub of listImmediateDirs(baseDir)) {
    const files = listFiles(
      path.join(baseDir, sub),
      (n) => /\.(?:ts|tsx)$/.test(n) && !TEST_RE.test(n),
    ).map((f) => relPosix(path.join(baseDir, sub), f).replace(/\.(?:ts|tsx)$/, ""));
    if (files.length > 0) groups.set(sub, files);
  }
  return groups;
}

function formatGroupedTable(baseRel, groups) {
  const lines = ["| Domain / Subdir | Path | Modules |", "| :--- | :--- | :--- |"];
  for (const [sub, files] of groups) {
    const dirPath = sub === "(root)" ? `${baseRel}/` : `${baseRel}/${sub}/`;
    lines.push(`| \`${sub}\` | \`${dirPath}\` | ${files.map((f) => `\`${f}\``).join(", ")} |`);
  }
  return lines.join("\n");
}

function collectPages(root) {
  const appDir = path.join(root, "apps/web/src/app");
  const pages = listFiles(appDir, (n) => n === "page.tsx");
  const rows = ["| Route | File |", "| :--- | :--- |"];
  for (const p of pages) {
    const rel = relPosix(appDir, p);
    const segs = rel
      .replace(/\/?page\.tsx$/, "")
      .split("/")
      .filter((s) => s && !s.startsWith("("));
    const urlPath = `/${segs.join("/")}`;
    rows.push(`| \`${urlPath}\` | \`apps/web/src/app/${rel}\` |`);
  }
  return rows.join("\n");
}

function collectFeatures(root) {
  const featDir = path.join(root, "apps/web/src/features");
  const rows = [
    "| Feature Slice | Public Entrypoints | Subdirectories |",
    "| :--- | :--- | :--- |",
  ];
  for (const slice of listImmediateDirs(featDir)) {
    const slicePath = path.join(featDir, slice);
    const entries = fs
      .readdirSync(slicePath, { withFileTypes: true })
      .filter((e) => e.isFile() && /^(?:index|public-.+)\.ts$/.test(e.name))
      .map((e) => `\`${e.name}\``)
      .sort();
    const subdirs = listImmediateDirs(slicePath).map((d) => `\`${d}/\``);
    rows.push(`| \`${slice}\` | ${entries.join(", ") || "—"} | ${subdirs.join(", ") || "—"} |`);
  }
  return rows.join("\n");
}

function collectApiRoutes(root) {
  const apiDir = path.join(root, "apps/web/src/app/api");
  const routes = listFiles(apiDir, (n) => n === "route.ts");
  const byDomain = new Map();
  for (const r of routes) {
    const rel = relPosix(apiDir, r);
    const domain = rel.split("/")[0] ?? "root";
    const endpoint = `/api/${rel.replace(/\/route\.ts$/, "")}`;
    const methods = extractRouteMethods(r);
    const bucket = byDomain.get(domain) ?? [];
    bucket.push(`\`${endpoint}\` (${methods})`);
    byDomain.set(domain, bucket);
  }
  const rows = [
    `Total: **${routes.length}** API route handlers (\`apps/web/src/app/api/**/route.ts\`, shared helpers in \`apps/web/src/app/api/_lib/\`).`,
    "",
    "| Domain | Endpoints & Methods |",
    "| :--- | :--- |",
  ];
  for (const [domain, items] of [...byDomain.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    rows.push(`| \`${domain}\` | ${items.join(" · ")} |`);
  }
  return rows.join("\n");
}

function extractSchemaTables(src) {
  const found = [];
  let rlsCount = 0;
  for (const m of src.matchAll(/export\s+const\s+\w+\s*=\s*pgTable\(\s*"([a-z0-9_]+)"/g)) {
    const name = m[1];
    const start = m.index ?? 0;
    const nextExport = src.indexOf("export const ", start + 10);
    const block = src.slice(start, nextExport === -1 ? src.length : nextExport);
    const hasRls = block.includes(".enableRLS()");
    if (hasRls) rlsCount += 1;
    found.push(hasRls ? `\`${name}\` [RLS]` : `\`${name}\``);
  }
  return { found, rlsCount };
}

function collectDbTables(root) {
  const dbDir = path.join(root, "packages/core/src/db");
  const schemaFiles = listFiles(dbDir, (n) => /^schema(?:-[a-z0-9-]+)?\.ts$/.test(n));
  let totalTables = 0;
  let rlsTables = 0;
  const tableLines = ["| Schema File | Tables (`[RLS]` = `enableRLS()`) |", "| :--- | :--- |"];
  for (const file of schemaFiles) {
    const { found, rlsCount } = extractSchemaTables(fs.readFileSync(file, "utf8"));
    totalTables += found.length;
    rlsTables += rlsCount;
    if (found.length > 0) {
      tableLines.push(`| \`${relPosix(root, file)}\` | ${found.join(", ")} |`);
    }
  }
  const migFiles = listFiles(path.join(dbDir, "migrations"), (n) => /^\d{4}-.*\.ts$/.test(n));
  const latestMig =
    migFiles.length > 0 ? path.basename(migFiles[migFiles.length - 1], ".ts") : "none";
  return [
    `Total: **${totalTables}** Drizzle \`pgTable\` tables (**${rlsTables}** RLS-protected), **${migFiles.length}** expand-only migrations (latest: \`${latestMig}\`).`,
    "",
    ...tableLines,
  ].join("\n");
}

const SCRIPT_ROLES = {
  "scripts/api-security-guards.mjs":
    "AST per-handler CSRF (`verifySameOrigin`) gate on all API mutations",
  "scripts/ast-guard-rules.mjs":
    "Extended AST UI/React guards (box-in-box, popover-in-p, raw fetch, effect limits)",
  "scripts/check-design-and-limits.mjs":
    "Master `pnpm design:check` runner (file/fn/nesting limits, tokens, copy, all wave guards)",
  "scripts/garden-guards.mjs":
    "Directory density (<=12), expand-only migrations, AGENTS parity, optical/editorial CSS hygiene",
  "scripts/generate-codebase-map.mjs":
    "G42 — Deterministic generator for `docs/CODEBASE_MAP.md` (`pnpm map:update`)",
  "scripts/verify-api-contracts-hardened.mjs":
    "Hardened API contract assertions (G20 health, auth, MCP scopes, ledger, telemetry)",
  "scripts/verify-api-contracts.mjs":
    "50-route isolated API + SSR + Fail-Closed RLS (`KANON_RLS_ENFORCE_LOCAL=1`) verifier",
  "scripts/verify-ui-truncation.mjs":
    "Playwright DOM truncation & overflow verifier across desktop viewports and themes",
  "scripts/wave-guards.mjs":
    "G1–G8 — Client fetch/fallback bans, AST capability-to-method RBAC (G7+)",
  "scripts/wave-guards-rs.mjs":
    "G6+, G9–G19 — Single DB gateway, 3-phase LLM routes, immutable events, unadjusted close, E2E waits",
  "scripts/wave-guards-u.mjs":
    "G21–G30 — Zero fabricated fallbacks, split basis, chunk retention, entry-export prod callers",
  "scripts/wave-guards-v.mjs":
    "G32–G34, G39, G41–G42 — Prod health watch, single-source replay, telemetry isolation, hosted-AI quota, map parity",
};

function collectGuards(root) {
  const scriptsDir = path.join(root, "scripts");
  const guardFiles = listFiles(scriptsDir, (n) => n.endsWith(".mjs") && !TEST_RE.test(n));
  const rows = ["| Script | Role / Enforced Guards |", "| :--- | :--- |"];
  for (const f of guardFiles) {
    const rel = relPosix(root, f);
    const role = SCRIPT_ROLES[rel] ?? "Verification / utility script";
    rows.push(`| \`${rel}\` | ${role} |`);
  }
  return rows.join("\n");
}

function collectCoreSharedSubdirs(root) {
  const groups = groupBySubdir(path.join(root, "packages/core/src/contracts"));
  const lines = [formatGroupedTable("packages/core/src/contracts", groups), ""];
  const extras = ["schemas", "export", "security"];
  lines.push("| Sibling Domain | Path | Modules |", "| :--- | :--- | :--- |");
  for (const sub of extras) {
    const files = listFiles(
      path.join(root, "packages/core/src", sub),
      (n) => /\.ts$/.test(n) && !TEST_RE.test(n),
    ).map((f) => relPosix(path.join(root, "packages/core/src", sub), f).replace(/\.ts$/, ""));
    if (files.length > 0) {
      lines.push(
        `| \`${sub}\` | \`packages/core/src/${sub}/\` | ${files.map((f) => `\`${f}\``).join(", ")} |`,
      );
    }
  }
  return lines.join("\n");
}

export function buildCodebaseMap(root) {
  const sections = [
    "# KANON Codebase Map (Auto-Generated · Enforced by G42)",
    "",
    "> **Single source of truth for instant AI & human navigation.** Generated deterministically by `pnpm map:update` (`scripts/generate-codebase-map.mjs`) and checked byte-for-byte in `pnpm check` (G42). Do not hand-edit.",
    "",
    "## 1. Workspace Packages & Public Exports",
    "",
    "| Package | Entrypoints | Boundary Rule |",
    "| :--- | :--- | :--- |",
    "| `@kanon/ui` | `.` · `./theme` · `./charts` · `./tokens.css` | Pure UI primitives; zero `@kanon/core` / `@kanon/ai` / `apps/web` imports |",
    "| `@kanon/core` | `.` (contracts/math/schemas/export) · `./db` (Drizzle/repos) · `./testing` | Zero React/Next/AI imports; `./db` allowed only in `apps/web/src/app/**` |",
    "| `@kanon/ai` | `.` (SEC EDGAR, market adapters, retrieval, IC agent, copilot) | Server-only runtime; client slices may use `import type` only |",
    "| `@kanon/web` | `apps/web/src/{app,shared,features}` | Acyclic vertical slices; sibling features import only `index.ts` / `public-*.ts` |",
    "",
    "## 2. Web Pages (`apps/web/src/app/**/page.tsx`)",
    "",
    collectPages(root),
    "",
    "## 3. Frontend Feature Slices (`apps/web/src/features/*`)",
    "",
    collectFeatures(root),
    "",
    "## 4. Shared Client Primitives (`apps/web/src/shared/*`)",
    "",
    formatGroupedTable(
      "apps/web/src/shared",
      groupBySubdir(path.join(root, "apps/web/src/shared")),
    ),
    "",
    "## 5. API Route Surface (`apps/web/src/app/api/**/route.ts`)",
    "",
    collectApiRoutes(root),
    "",
    "## 6. Database Schema & RLS Matrix (`packages/core/src/db/`)",
    "",
    collectDbTables(root),
    "",
    "## 7. Data Repositories (`packages/core/src/db/repositories/`)",
    "",
    formatGroupedTable(
      "packages/core/src/db/repositories",
      groupBySubdir(path.join(root, "packages/core/src/db/repositories")),
    ),
    "",
    "## 8. Pure Financial Math (`packages/core/src/math/`)",
    "",
    formatGroupedTable(
      "packages/core/src/math",
      groupBySubdir(path.join(root, "packages/core/src/math")),
    ),
    "",
    "## 9. Shared Zod Contracts & Schemas (`packages/core/src/{contracts,schemas,export,security}/`)",
    "",
    collectCoreSharedSubdirs(root),
    "",
    "## 10. AI, SEC EDGAR, Retrieval & Market Engines (`packages/ai/src/`)",
    "",
    formatGroupedTable("packages/ai/src", groupBySubdir(path.join(root, "packages/ai/src"))),
    "",
    "## 11. Design System & UI Components (`packages/ui/src/`)",
    "",
    formatGroupedTable("packages/ui/src", groupBySubdir(path.join(root, "packages/ui/src"))),
    "",
    "## 12. Mechanical Quality Gates & Scripts (`scripts/*.mjs`)",
    "",
    collectGuards(root),
    "",
  ];
  return sections.join("\n");
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const root = process.cwd();
  const outPath = path.join(root, "docs/CODEBASE_MAP.md");
  const rendered = buildCodebaseMap(root);
  if (process.argv.includes("--check")) {
    const existing = fs.existsSync(outPath) ? fs.readFileSync(outPath, "utf8") : "";
    if (existing !== rendered) {
      process.stderr.write("docs/CODEBASE_MAP.md is out of date. Run `pnpm map:update`.\n");
      process.exit(1);
    }
    process.stdout.write("✓ docs/CODEBASE_MAP.md is up to date.\n");
  } else {
    fs.writeFileSync(outPath, rendered, "utf8");
    process.stdout.write(
      `✓ Wrote ${relPosix(root, outPath)} (${rendered.split("\n").length} lines).\n`,
    );
  }
}
