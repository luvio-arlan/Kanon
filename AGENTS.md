# KANON — Engineering & AI Agent Constitution (`AGENTS.md`)

> Single source of truth for humans and AI agents. Every architectural, aesthetic, and code-size invariant is mechanically enforced by `pnpm check` and `pnpm test` — never duplicate enforced rules here.

## 1. Product Identity & Non-Goals

- **KANON（卡农）** — `Conviction, composed.` / `在噪音里，谱出自己的确定性。`
- Desktop-first fundamental value-investing OS for serious individual investors & buy-side teams: 5-step guided research canvas, forensic SEC XBRL verification, multi-role IC Agent & red-teaming, dual-engine valuation + Reverse-DCF + 5×5 sensitivity workbench, zero-leverage discipline & quarterly cognitive review, and portfolio risk controls.
- **Hard Non-Goals**: No live candlestick trading terminal or broker execution, no buy/sell fortune-telling chat, no gamified streaks, no social feed.
- **Docs**: [docs/PRD.md](docs/PRD.md) · [docs/PRODUCT_ARCHITECTURE_V3.md](docs/PRODUCT_ARCHITECTURE_V3.md) · [.rules/editorial-craft.md](.rules/editorial-craft.md) · [.rules/postmortems.md](.rules/postmortems.md) · [deploy/README.md](deploy/README.md)

## 2. Architecture Map (Enforced by `.dependency-cruiser.cjs`)

```text
apps/web/src/
├── app/          # Thin Server Components & API Route Handlers (ONLY layer allowed to import @kanon/core/db)
├── shared/       # Foundational client primitives (kanonFetch, useThesisStepDraft; zero feature/app/db imports)
└── features/     # Acyclic bounded vertical slices (import sibling slices ONLY via index.ts)
packages/
├── ui/           # Pure HeroUI v3 + Swiss Editorial Titanium + NumberFlow (zero core/ai/web imports)
├── core/         # Drizzle schema + expand-only migrations + shared Zod contracts + pure math + exporters
└── ai/           # SEC EDGAR XBRL parser + Vercel AI SDK multi-step agent & copilot (server-only runtime)
```

## 3. Single Source of Truth & Operational Conventions

- **Contracts & Math**: Shared API/SSE/AI Zod contracts live in `packages/core/src/contracts/`; all financial formulas live strictly as pure functions in `packages/core/src/math/`.
- **Migrations**: Database changes are strictly **expand-only** inside `packages/core/src/db/migrations/` and automatically checked 1:1 against every Drizzle `pgTable` via dynamic reflection in `repository.test.ts`.
- **Client I/O & Drafts**: All client JSON/SSE calls go through `apps/web/src/shared/lib/kanon-fetch.ts` with Zod validation; all editable canvas steps use the shared draft engine with dirty-guard protection and `⌘S`.
- **Aesthetic Craft & Copy Restraint**: Follow [.rules/editorial-craft.md](.rules/editorial-craft.md) strictly — Swiss Editorial minimalism (95% monochrome Light/Dark canvas + Natural Titanium + coral focal accent), **zero ornamental microcopy or UI complexity** (no decorative footers, feature/tech taglines, explanatory subtitles, version labels, or redundant slogans). Every visible word must serve an immediate user action; prefer whitespace, typographic hierarchy, and optically accurate motion.
- **Production Topology**: `https://kanon.hk` (GitHub Pages auto-deployed from `marketing/`) + `https://app.kanon.hk` (Vercel monorepo `apps/web` + Neon Postgres `sin1`). See [deploy/README.md](deploy/README.md) before any deployment or infra change.

## 4. Verification Gates (Single Source of Truth)

```bash
pnpm check        # Biome + tsc + depcruise + AST/Garden/Docs guards + knip (zero-skip, zero-ratchet)
pnpm test         # Vitest: financial math goldens, dynamic DDL parity, zero-leverage & AI/API contracts
pnpm build        # Full Turborepo production build
pnpm dev          # Local Next.js dev server (persistent PGlite when DATABASE_URL unset)
pnpm db:push      # Push Drizzle schema to external PostgreSQL (DATABASE_URL)
```

> Any recurring bug (2+ occurrences) MUST be promoted to an Error-Driven L1/L2/L3 guard and logged in [.rules/postmortems.md](.rules/postmortems.md).
