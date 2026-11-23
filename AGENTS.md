# KANON — Engineering & AI Agent Rulebook (`AGENTS.md`)

> Single source of truth for human engineers and AI coding agents.
> Every architecture, aesthetic, and code-size invariant is mechanically enforced by `pnpm check` and `pnpm test` — zero paper linters.

## 1. Product Identity

- **Name**: `KANON`（卡农） — `Conviction, composed.` / `在噪音里，谱出自己的确定性。`
- **Mission**: Pure fundamental value-investing OS for serious individual investors & buy-side research institutions (desktop-first Web app) — 5-step guided research canvas, multi-year SEC XBRL verification, Devil's Advocate red-teaming, 3-scenario valuation + 5×5 sensitivity workbench, zero-leverage trading discipline, and one-page Investment Memo archival.
- **Full Spec**: [docs/PRD.md](docs/PRD.md) | **Institutional Memory**: [.rules/postmortems.md](.rules/postmortems.md)

## 2. Monorepo Bounded Slices (`.dependency-cruiser.cjs`)

```text
kanon/
├── apps/web/src/
│   ├── app/              # Thin Server Component routes & API handlers (ONLY layer allowed to import @kanon/core/db)
│   └── features/         # Strictly acyclic vertical slices (<= 12 files per components/):
│                         # cockpit/ | thesis/ | research-steps/ | valuation/ | journal/ | glossary/ | ai-settings/
├── packages/
│   ├── ui/               # Pure HeroUI v3 + Swiss Editorial Titanium + NumberFlow (zero core/ai/web/radix/vaul)
│   ├── core/             # Drizzle Postgres schema + PGlite/Postgres client + Zod + pure math + exporters
│   └── ai/               # SEC EDGAR client + Vercel AI SDK BYOK + Zod-validated Copilot contracts
├── scripts/              # Mechanical AST aesthetic & architecture gates (check-design-and-limits.mjs + ast-guard-rules.mjs)
└── .agents/skills/       # Installed HeroUI v3 skills (heroui-react, heroui-theming)
```

1. `packages/ui` MUST NOT import `packages/core`, `packages/ai`, or `apps/web`.
2. `packages/core` MUST NOT import `packages/ui`, `packages/ai`, or `apps/web`.
3. `apps/web/src/features/<A>` MUST ONLY import public barrels `features/<B>/index.ts`, `@kanon/core`, or `@kanon/ui` (zero circular deps).
4. `apps/web/src/features/**` MUST NOT import `@kanon/core/db`; UI components MUST NOT call raw `fetch()`.
5. `apps/web/src/**` MUST consume all UI primitives through `@kanon/ui` only.

## 3. Single Source of Truth (Types, Math, DB & AI)

- **Types**: `Drizzle pgTable (packages/core/src/db/schema.ts)` + `Zod (packages/core/src/schemas/)` → APIs → Frontend.
- **Financial Math**: All valuation, CAGR, odds ratio, 5×5 sensitivity, and readiness formulas live strictly as pure functions in `packages/core/src/math/`.
- **DDL Parity**: Embedded PGlite bootstrap DDL (`packages/core/src/db/ddl.ts`) is automatically verified 1:1 against `information_schema.columns` (8 tables) in `repository.test.ts`.
- **AI Safety**: Every LLM output in `packages/ai` is validated via strict Zod schemas; persisted JSONB rows are parsed server-side; financial metrics come exclusively from Postgres / SEC EDGAR.

## 4. Aesthetic Craft & Automated 4-Layer Gates

All visual invariants (95% monochrome Light `#F7F7F5` / Dark `#0B0C0E` + Apple Natural Titanium `#E5E3DD` + coral `#EA6B4A` focal accent, `>= 12px` font floor, `stroke={1.5}`, `KANON_SPRING`, zero box-in-box `<Card>`, zero dashed alert banners, zero `<GlossaryText>` inside `<p>`, `<= 12` components per slice, `<= 1` `useEffect` per file, zero dead exports/deps) are mechanically enforced:

| Layer  | Gate                                                 | Enforces                                                                                                                                                       |
| :----- | :--------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **L1** | `pnpm lint` + `pnpm typecheck`                       | Biome strict (zero `any`, zero `console.*`, cognitive complexity <= 12) + `tsc --noEmit` across all 4 workspaces                                               |
| **L2** | `pnpm depcruise` + `pnpm design:check` + `pnpm knip` | Strict DAG boundaries + AST limits (<= 250 lines/file, <= 50 lines/fn, <= 3 nesting, zero box-in-box/dashed banners/raw fetch/escape hatches) + zero dead code |
| **L3** | `pnpm test`                                          | Vitest: valuation & 5×5 sensitivity math, readiness scorer, 8-table Postgres DDL parity, Zero-Leverage Iron Rule, exporters, SEC EDGAR & Zod AI contracts      |
| **L4** | `lefthook.yml` + `.github/workflows/ci.yml`          | Pre-commit `pnpm check` + PR gate `pnpm check && pnpm test && pnpm build`                                                                                      |

## 5. Standard Commands

```bash
pnpm dev          # Start Next.js web app (auto-boots persistent local Postgres via PGlite if DATABASE_URL unset)
pnpm check        # Biome + tsc --noEmit + dependency-cruiser + AST aesthetic/limits gate + knip dead-code gate
pnpm test         # Full Vitest suite
pnpm build        # Full Turborepo production build
pnpm db:push      # Push Drizzle schema to external PostgreSQL (Neon / Supabase via DATABASE_URL)
```
