# KANON — Mistake-to-Rule Postmortems

> Every bug, AI hallucination, hydration mismatch, or design/architecture rework MUST be converted into a permanent rule here (and promoted to a Biome / `dependency-cruiser` check whenever statically enforceable).
> Goal: **Never make the same mistake twice.**

## Template (Append on Every Fix PR)

```markdown
### [YYYY-MM-DD] Short Rule Title

- **Mistake**: What went wrong (exact anti-pattern).
- **Correct Pattern**: What must be done instead.
- **Why / Gate**: Root cause + whether enforced by Biome / dependency-cruiser / Vitest.
```

## Pre-Seeded Guardrails (Day 0)

### [2026-11-23] Never Compute Financial Valuation Math Inside UI Components

- **Mistake**: Performing EPS × PE, upside/downside ratios, or percentage math inline inside React components with raw JS floats.
- **Correct Pattern**: Put all valuation, scenario, and ratio formulas in pure functions inside `packages/core/src/math/` with explicit rounding and Vitest coverage.
- **Why / Gate**: Prevents floating-point display drift and makes financial logic auditable. Enforced via `Vitest` + code review.

### [2026-11-23] Never Trust Unvalidated LLM JSON Outputs

- **Mistake**: Calling `JSON.parse()` directly on LLM responses or rendering AI-generated financial numbers without schema validation.
- **Correct Pattern**: Use `Vercel AI SDK` `generateObject` / `streamObject` with strict `Zod` schemas in `packages/ai`, and source financial figures strictly from cached SEC EDGAR / financial API rows in Postgres.
- **Why / Gate**: Eliminates silent runtime crashes and fabricated financial metrics. Enforced by `packages/ai` contract.

### [2026-11-23] Never Hardcode Hex Color Values or Raw Tailwind Palette Colors

- **Mistake**: Writing `bg-[#F7F7F5]`, `text-[#EA6B4A]`, `bg-white`, `text-black`, or `bg-gray-500` directly in components.
- **Correct Pattern**: Always reference semantic CSS variables / Tailwind theme tokens (`bg-canvas`, `bg-surface`, `bg-titanium`, `text-ink-primary`, `text-ink-inverse`, `border-hairline`) defined in `packages/ui/src/styles/tokens.css`.
- **Why / Gate**: Guarantees Light/Dark theme consistency and 100% Swiss Editorial visual cohesion with zero dark-mode contrast failures. Mechanically enforced by `pnpm design:check` (`scripts/check-design-and-limits.mjs`).

### [2026-11-23] Never Bypass `@kanon/ui` or Mix Unapproved Motion & Icon Styles

- **Mistake**: Importing `@heroui/*`, `@radix-ui/*`, `cmdk`, `vaul`, or `recharts` directly in `apps/web`, omitting `stroke={1.5}` on Tabler icons, or using `animate-bounce` / ad-hoc spring physics.
- **Correct Pattern**: Consume all HeroUI v3 & primitive components, sparklines, and `KANON_SPRING` motion constants exclusively through `@kanon/ui`, and enforce `stroke={1.5}` on every `<Icon*>` component.
- **Why / Gate**: Prevents visual drift, inconsistent stroke weights, and sluggish/playful animations. Mechanically enforced by `.dependency-cruiser.cjs` and `pnpm design:check`.

### [2026-11-23] Never Ship Paper Dependency Rules That Miss Unresolved Workspace Specifiers

- **Mistake**: Writing `dependency-cruiser` `to.path` rules matching only resolved filesystem paths (`^packages/core`) without matching bare workspace specifiers (`^@kanon/core`), causing forbidden imports in packages without that dependency in `package.json` to slip through silently.
- **Correct Pattern**: Always match BOTH resolved paths and bare package specifiers (ReDoS-safe linear regexes), and positively verify every new rule with a temporary adversarial violation probe before shipping.
- **Why / Gate**: Eliminates false-green "paper linters". Mechanically enforced by `.dependency-cruiser.cjs`.

### [2026-11-23] Never Crowd Interfaces With Sub-12px Ant-Text or Box-in-Box Clutter

- **Mistake**: Filling Bento cards with `text-[10px]`/`text-[11px]` micro-labels, redundant KPI boxes, and nested borders that turn an editorial investment OS into a noisy SaaS dashboard.
- **Correct Pattern**: Practice radical subtraction (max 3 clear visual layers per card), keep every visible label `>= 12px` (`text-xs`) and body copy `>= 14px` (`text-sm`), and defer deep detail into spring disclosures or right-side `Sheet` drawers.
- **Why / Gate**: Preserves Swiss Editorial breathing room and immediate reading desire. Mechanically enforced by `min-readable-font-size` in `scripts/check-design-and-limits.mjs`.

### [2026-11-23] Never Leak Server DB Modules Into Client Features or Use Type Escape Hatches

- **Mistake**: Importing `@kanon/core/db` inside `apps/web/src/features/**`, using `as unknown as` for `globalThis` singletons, or letting embedded Postgres DDL drift from Drizzle `pgTable` schemas.
- **Correct Pattern**: Restrict `@kanon/core/db` to Server Components and `app/api/**`, use `declare global` instead of `as unknown as`, and assert 1:1 column parity against `information_schema.columns` in Vitest.
- **Why / Gate**: Prevents WASM/Node bundle leaks, silent runtime SQL mismatches, and unsound casts. Mechanically enforced by `.dependency-cruiser.cjs` (`no-db-imports-in-web-features`), `scripts/check-design-and-limits.mjs` (`no-type-escape-hatch`), and `packages/core/src/db/repository.test.ts`.

### [2026-11-23] Always Follow HeroUI v3 Compound Slot Anatomy (`Switch.Content`, Scoped `--accent`)

- **Mistake**: Omitting `<Switch.Content>` inside HeroUI v3 `<Switch>` (preventing React Aria from mounting the interactive checkbox/switch input), or overriding `.slider__fill` color directly without overriding `--accent` on `.slider` (leaving `.slider__fill::before` in the parent `--accent` color).
- **Correct Pattern**: Always inspect `packages/ui/node_modules/@heroui/styles` and `@heroui/react/docs/components/*.md` before wrapping components; wrap switch controls inside `<Switch.Content>` and override `--accent` / `--switch-control-bg-checked` on the BEM block class in `theme-bridge.css`.
- **Why / Gate**: Guarantees native keyboard/pointer accessibility and zero dual-tone pseudo-element conflicts across Light & Dark themes. Verified via live browser QA + `.agents/skills/heroui-theming` scripts.

### [2026-11-23] Never Render HeroUI `<Popover.Trigger>` Default `<div>` Inside Inline `<p>` (React #418)

- **Mistake**: Using HeroUI v3 `<Popover.Trigger>` (which defaults to `<div role="button">`) inside inline `<GlossaryText>` wrapped by `<p>` tags, causing HTML5 auto-closing of `<p>` during SSR and triggering React Error #418 hydration mismatch on direct page reloads.
- **Correct Pattern**: Always pass `render={(triggerProps) => <span {...triggerProps} />}` on inline `<Popover.Trigger<"span">>` primitives, and avoid wrapping rich inline components in `<p>` tags when `<div>` is semantically safer.
- **Why / Gate**: Guarantees zero SSR/CSR hydration errors on direct reloads across all routes. Verified via live browser direct-reload QA.

### [2026-11-23] Validate Persisted AI JSONB Payloads Server-Side & Keep Copilot Strictly Institutional

- **Mistake**: Importing runtime `@kanon/ai` AI SDK modules inside `"use client"` hooks to cast persisted `copilot_outputs` rows, or letting Copilot actions drift away from core fundamental research.
- **Correct Pattern**: Keep every Copilot action strictly aligned with fundamental value investing (`earnings_digest`, `red_team`, `investment_memo`), validate persisted JSONB payloads with `@kanon/ai` Zod `safeParse` inside Server Components before passing typed props to client islands, and keep `import type` only in client modules.
- **Why / Gate**: Preserves institutional investor product clarity, prevents Node/AI SDK leaks into client bundles, and eliminates unsafe type assertions. Enforced by `packages/ai` Zod schemas + `AGENTS.md` §1 & §3.
