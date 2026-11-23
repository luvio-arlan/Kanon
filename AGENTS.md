# KANON — Engineering & AI Agent Rulebook (`AGENTS.md`)

> Single source of truth for human engineers and AI coding agents.
> Every architecture, aesthetic, and code-size invariant below is mechanically enforced by `pnpm check` and `pnpm test` — zero paper linters.

## 1. Product Identity

- **Name**: `KANON`（卡农） — `Conviction, composed.` / `在噪音里，谱出自己的确定性。`
- **Mission**: Pure fundamental value-investing OS for serious individual investors & buy-side research institutions (desktop-first Web app) — 5-step guided research canvas, multi-year SEC XBRL verification, Devil's Advocate red-teaming, 3-scenario valuation + 5×5 sensitivity workbench, zero-leverage trading discipline, and one-page Investment Memo archival.
- **Full Spec**: [docs/PRD.md](docs/PRD.md) | **Institutional Memory**: [.rules/postmortems.md](.rules/postmortems.md)

## 2. Monorepo Architecture & Hard Boundaries (`.dependency-cruiser.cjs`)

```text
kanon/
├── apps/web/src/
│   ├── app/              # Thin Server Component routes & API handlers (ONLY layer allowed to import @kanon/core/db)
│   └── features/         # Vertical slices: thesis/ | valuation/ | journal/ | glossary/
├── packages/
│   ├── ui/               # HeroUI v3 + Swiss Editorial Titanium Design System (zero core/ai/web imports)
│   ├── core/             # Drizzle Postgres schema + PGlite/Postgres client + Zod + pure math + exporters
│   └── ai/               # SEC EDGAR client + Vercel AI SDK BYOK + Zod-validated Copilot contracts
├── scripts/              # Mechanical AST & aesthetic gate (check-design-and-limits.mjs)
└── .agents/skills/       # Installed HeroUI v3 skills (heroui-react, heroui-theming)
```

1. `packages/ui` MUST NOT import `packages/core`, `packages/ai`, or `apps/web`.
2. `packages/core` MUST NOT import `packages/ui`, `packages/ai`, or `apps/web`.
3. `apps/web/src/features/<A>` MUST NOT import internal files of `features/<B>` (only `features/<B>/index.ts`, `@kanon/core`, or `@kanon/ui`).
4. `apps/web/src/features/**` MUST NOT import `@kanon/core/db` (DB access stays strictly server-side in `app/` and `app/api/`).
5. `apps/web/src/**` MUST NOT import `@heroui/*`, `@radix-ui/*`, `react-aria-components`, `cmdk`, `vaul`, or `recharts` directly — consume themed wrappers from `@kanon/ui` only.

## 3. Single Source of Truth (Types, Math, DB & AI)

- **Types**: `Drizzle pgTable (packages/core/src/db/schema.ts)` + `Zod (packages/core/src/schemas/)` → APIs → Frontend. Never hand-write duplicate DTO interfaces in `apps/web`.
- **Financial Math**: All valuation, CAGR, odds ratio, and range-marker formulas live strictly as pure functions in `packages/core/src/math/` with Vitest coverage.
- **DDL Parity**: Embedded PGlite bootstrap DDL (`packages/core/src/db/ddl.ts`) is automatically verified 1:1 against `information_schema.columns` in `repository.test.ts`.
- **AI Safety**: Every LLM output in `packages/ai` is validated via strict Zod schemas; financial metrics are read exclusively from cached Postgres / SEC EDGAR facts.

## 4. Aesthetic & Interaction Craft Gate (`pnpm design:check`)

- **Palette & Materiality**: Warm Editorial Light (`#F7F7F5` canvas / `#FFFFFF` surface / `#E5E3DD` Apple Natural Titanium / `#EA6B4A` coral focus accent) & Machined Obsidian Dark (`#0B0C0E` / `#141518`). All HeroUI v3 & Tailwind tokens live exclusively in `packages/ui/src/styles/tokens.css` & `theme-bridge.css`.
- **Zero Hardcoded Colors**: Hardcoded Hex, `rgb()`/`hsl()`, and raw Tailwind palette utilities (`bg-gray-*`, `bg-white`, `text-black`) are mechanically blocked outside `tokens.css`.
- **Radical Subtraction & Typography Floor**: Max 3 visual layers per card, zero box-in-box clutter, `tabular-nums` on every number/ticker/index, and **strict 12px minimum readable font size** (`text-[10px]`/`text-[11px]` ant-text is mechanically blocked; body copy stays `14px+`).
- **Locked Stack & Tactile Motion**: HeroUI v3 wrapped inside `@kanon/ui` + `Tabler Icons` (`stroke={1.5}` mechanically enforced) + `KANON_SPRING` (`{ type: "spring", stiffness: 420, damping: 34, mass: 0.8 }`; raw spring literals & `animate-bounce`/`animate-ping` blocked).

## 5. Automated 4-Layer Quality Gates

| Layer  | Gate                                        | Enforces                                                                                                                                                                                                |
| :----- | :------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **L1** | `pnpm lint` + `pnpm typecheck`              | Biome strict (zero `any`, zero `console.*`, cognitive complexity <= 12) + `tsc --noEmit` across all 4 workspaces                                                                                        |
| **L2** | `pnpm depcruise` + `pnpm design:check`      | Module/DB/UI stack boundaries + AST limits (<= 250 lines/file, <= 50 lines/fn, <= 3 nesting, zero `as any`/`as never`/`as unknown as`, zero Hex/ant-text, `stroke={1.5}`)                               |
| **L3** | `pnpm test`                                 | Vitest: valuation & 5×5 sensitivity math, readiness scorer, in-memory Postgres CRUD + 8-table DDL parity (`copilot_outputs` included), Zero-Leverage Iron Rule, exporters, SEC EDGAR & Zod AI contracts |
| **L4** | `lefthook.yml` + `.github/workflows/ci.yml` | Pre-commit `pnpm check` + PR gate `pnpm check && pnpm test && pnpm build`                                                                                                                               |

## 6. Standard Commands

```bash
pnpm dev          # Start Next.js web app (auto-boots persistent local Postgres via PGlite if DATABASE_URL unset)
pnpm check        # Biome + tsc --noEmit + dependency-cruiser + AST design/limits gate
pnpm test         # Full Vitest suite (core math, Postgres DDL parity, exporters, AI contracts)
pnpm build        # Full Turborepo production build
pnpm db:push      # Push Drizzle schema to external PostgreSQL (Neon / Supabase via DATABASE_URL)
```
