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

### [2026-11-23] Enforce Editorial Subtraction Mechanically (Zero Box-in-Box, Dashed Banners, Flat 20+ File Folders, or Dead UI Primitives)

- **Mistake**: Stacking multi-color switch boxes, dashed coral banners, toolbar button walls, and 3 heterogenous sections on one Step 5 screen, while leaving unused `vaul`/`@radix-ui` packages and 22 components piled in a single flat `thesis/components/` folder.
- **Correct Pattern**: Default Step 5 to serene monochrome dual tabs (`交易纪律台账` / `投研备忘录`) with progressive composer disclosure and a 44px single-line signature strip; consolidate 100% on HeroUI v3; decompose slices to `<= 12` files per `components/` directory; move network calls out of UI components.
- **Why / Gate**: Mechanically enforced by `no-box-in-box-card`, `no-dashed-banner-in-form`, `no-block-popover-in-p`, `max-use-effect`, `no-raw-fetch-in-components`, `max-directory-files` in `scripts/ast-guard-rules.mjs` + `pnpm knip` in `pnpm check`.

### [2026-11-23] Validate Persisted AI JSONB Payloads Server-Side & Keep Copilot Strictly Institutional

- **Mistake**: Importing runtime `@kanon/ai` AI SDK modules inside `"use client"` hooks to cast persisted `copilot_outputs` rows, or letting Copilot actions drift away from core fundamental research.
- **Correct Pattern**: Keep every Copilot action strictly aligned with fundamental value investing (`earnings_digest`, `red_team`, `investment_memo`), validate persisted JSONB payloads with `@kanon/ai` Zod `safeParse` inside Server Components before passing typed props to client islands, and keep `import type` only in client modules.
- **Why / Gate**: Preserves institutional investor product clarity, prevents Node/AI SDK leaks into client bundles, and eliminates unsafe type assertions. Enforced by `packages/ai` Zod schemas + `AGENTS.md` §1 & §3.

### [2026-11-24] Match HeroUI v3 `@layer base` Token Cascade & Guard CSS Grid Sticky / Overlay Ergonomics

- **Mistake**: Placing custom theme overrides inside `@layer theme` when `@heroui/styles` declares its default `:root`/`.dark` tokens in `@layer base`, applying `lg:sticky` to a CSS Grid sidebar without `lg:self-start`, placing Sonner toasts at `bottom-right` over sticky save CTAs, or styling native `<select>` pills with inconsistent OS vertical alignment.
- **Correct Pattern**: Declare KANON theme tokens in `@layer base` after `@import "@heroui/styles"`, pair `lg:sticky` inside CSS Grid with `lg:self-start`, position Sonner toasts at `top-center` with topbar offset (`68px`), keep frosted topbars at `>= 0.92` opacity, and use `@kanon/ui` `ActionMenu` pills instead of unstyled native `<select>` controls.
- **Why / Gate**: Prevents silent HeroUI token shadowing, ensures sticky navigation works on tall canvases, and maintains museum-grade alignment across Light and Dark modes. Verified via live browser QA.

### [2026-11-24] Enforce Universal Directory Density, Expand-Only Migrations, Dynamic DDL Parity & Zero Unchecked JSON Casts

- **Mistake**: Limiting directory density checks to `features/*/components` left `packages/ui/src/components` (19 files) and `packages/core/src/db` (17 files) flat; hardcoding a 9-table array in `repository.test.ts` risked future table drift; client fetch/SSE code cast `res.json() as T` without Zod validation; empty `catch {}` blocks silently hid BYOK errors; `AGENTS.md` drifted (`8 tables`).
- **Correct Pattern**: Enforce `<= 12` source files across all workspace source subdirectories, run versioned expand-only migrations (`packages/core/src/db/migrations/`) with destructive-SQL scanning, discover all Drizzle `pgTable` schemas dynamically via `is(entry, PgTable)` in `repository.test.ts`, route all client JSON/SSE through `kanonFetch` / Zod `safeParse`, propagate structured `fallbackReason` instead of empty catches, and verify `AGENTS.md` links/commands mechanically.
- **Why / Gate**: Mechanically enforced by `universal-max-directory-files`, `no-unchecked-json-cast`, `no-silent-catch`, `expand-only-migrations`, `no-client-runtime-ai-import`, and `docs-entry-parity` in `scripts/garden-guards.mjs` + dynamic DDL parity in `packages/core/src/db/repository.test.ts`.

### [2026-11-24] Brand Site & Motion Craft Standards (Zero Blue Focus Rings, Zero Orphan Wraps, Zero Hover Jitter, Zero Cheap Polka-Dot Particles, Zero Meta-Tech Copy)

- **Mistake**:
  1. Leaving browser-default `:focus` blue outlines visible on mouse clicks across switches and accordion buttons.
  2. Using `flex` key-value spec rows without `white-space: nowrap` on short Chinese labels, causing mid-word wraps (`终端形/态`, `底层引/擎`) and single-character orphan tails (`报`, `权杠杆。`).
  3. Rendering giant display numerals (`0.00×`, `$211`) in `JetBrains Mono` with dotted zeros instead of clean open tabular Swiss numerals, or setting tight `overflow: hidden` clips that slice italic `p` descenders.
  4. Combining CSS `:hover { transform }` transitions with JS `pointermove` translation on buttons, causing cheap boundary jitter on hover.
  5. Floating scattered circular dot particles over luxury photography and using generic scale-zoom on every photo instead of architectural light-slit/refraction choreography.
  6. Breaking the fourth wall in customer-facing brand copy (`15 秒纯代码生成 · 60fps`), auto-collapsing open accordion cards when clicking siblings, or placing mismatched thin Songti Chinese side-by-side with tall narrow English serif on film end cards.
- **Correct Pattern**:
  1. Suppress default mouse-click focus outlines (`:focus { outline: none; }`) and style keyboard accessibility exclusively via `:focus-visible { outline: 1.5px solid var(--coral); outline-offset: 3px; }`.
  2. Structure key-value spec rows with fixed-width CSS Grid (`grid-template-columns: 76px minmax(0, 1fr)`) and `white-space: nowrap` on labels, keeping single-sentence captions clean on one line on desktop.
  3. Render oversized KPIs & lock readouts in clean geometric sans (`font-feature-settings: "tnum" 1, "zero" 0`) and reserve generous descender padding (`padding-bottom >= 0.2em`) inside animated clip masks.
  4. Never fight CSS hover transforms with JS pointer translation on buttons—use smooth CSS specular light-sheen sweeps and clean state transitions.
  5. Favor brand-authentic acoustic/architectural motion (pluckable harmonic Canon strings, vertical shutter slits, optical refraction sweeps, mechanical shackle lock-shut physics + subtle Web Audio tactile foley with mute toggle).
  6. Keep copy 100% customer-facing (`观看宣传视频`, zero implementation meta-jargon), keep expanded detail drawers independently open until toggled closed, and lock up bilingual film end cards vertically (`KanonMark` → `KANON` → `— 卡 农 —` in clean modern Chinese sans → italic tagline).
  7. Never wrap a 16×16 browser favicon in a heavy solid-black rounded square or squash its aspect ratio—use a transparent, adaptive SVG monogram (`@media (prefers-color-scheme: dark)`).
  8. Prefer liquid volumetric architectural light flow over generic wavy ribbon/sine-line backgrounds, and open prestige brand films in poised stillness rather than frantic static or jittery visual noise.
- **Why / Gate**: Prevents "AI-template" visual drift across marketing surfaces, motion films, and interactive demos. Permanent rule in `.rules/postmortems.md` + mandatory multi-viewport visual QA before delivery.

### [2026-11-24] Always Guard HeroUI Modal Opacity, Drawer Widths & Consistent NumberFlow Rounding

- **Mistake**: Relying solely on HeroUI's default 250ms `heroui-overlay-enter-105` animation (`opacity: 0 -> 1`) on `DialogModal` caused background content to bleed through during modal entry; fixed `500px` `Sheet` width caused horizontal overflow on multi-ticker comparison tables; mixing JS `.toFixed(1)` with `RollingNumber` (`Intl.NumberFormat`) caused a `$0.1` discrepancy on IEEE-754 half-way floats like `130.45`.
- **Correct Pattern**: Apply unlayered `.kanon-dialog-panel` opaque surface + fast `.kanon-dialog-container` entry (`opacity: 0.96 -> 1`) in `theme-bridge.css`, support `size="lg"` (`760px`) on `Sheet` for multi-column comparison drawers, keep action buttons `shrink-0 whitespace-nowrap` next to `min-w-0 flex-1` text, and use `<RollingNumber>` consistently across hero and sidebar KPIs.
- **Why / Gate**: Eliminates visual bleed-through, orphan button wrapping, and rounding discrepancies. Verified via dual-pass live browser QA + `pnpm test:api` 16-route contract suite.

### [2026-11-24] Eliminate Browser Autofill Blue Patches, Tab-Switch Jitter & Dashboard Information Overload

- **Mistake**:
  1. Leaving browser-default `:-webkit-autofill` unstyled painted glaring light-blue boxes over warm-alabaster / obsidian transparent underline auth inputs, while `pt-[clamp(24px,9vh,88px)]` sat awkwardly high on desktop monitors.
  2. Omitting `scrollbar-gutter: stable` on `html`, leaving unlayered `button:focus-visible` in `editorial.css` (which overrode Tailwind `focus-visible:outline-none` and painted double coral rings on tabs), and using `<AnimatePresence mode="wait">` + `filter: "blur(...)"` + card stagger replay caused horizontal scrollbar shifts, blank-frame height collapses, scroll-clamp jumps, and focus-ring flashes on tab switches.
  3. Stacking 7 topbar buttons, ornamental English eyebrows, duplicated marketing slogans, dual search bars, an always-on empty radar bar, 3-sentence hypothesis accordions on every Bento card, and raw backend jargon (`Postgres` / `落库`) overwhelmed newcomers with text while providing no guided starter flow.
- **Correct Pattern**:
  1. Override `:-webkit-autofill` / `:autofill` globally in `editorial.css` using `--autofill-bg` + `--ink-primary` + `.kanon-input-canvas`, and anchor auth forms with `items-start pt-[clamp(48px,15vh,148px)]`.
  2. Set `scrollbar-gutter: stable` on `html`, wrap base `:focus-visible` defaults inside `@layer base`, ban `<AnimatePresence mode="wait">` and `filter: "blur(...)"` on tab/step panels, use `min-h` floors + zero-displacement `KANON_LENS_VARIANTS` + overdamped `KANON_TAB_TRANSITION`.
  3. Streamline Cockpit topbar to 4 primary controls (overflow secondary utilities into `⋯`), replace boxed KPI+radar stacks with a quiet 4-metric hairline strip + signal-only pills, keep Bento cards to 3 clean layers with deep links (`/thesis/[id]?step=N`), provide a cookie-persisted zero-flash 3-step onboarding guide, and forbid backend DB jargon in UI features.
- **Why / Gate**: Mechanically enforced by `css-scrollbar-gutter-stable`, `css-autofill-hygiene`, `css-layered-focus-visible`, `no-mode-wait-tab-collapse`, `no-filter-blur-transition`, and `no-user-facing-db-jargon` in `pnpm check`.

### [2026-11-25] Enforce Concentric Radii, Institutional Copy Register, Machined Dropdowns & Zero-Recharts Cockpit Performance

- **Mistake**:
  1. Using jarring colloquial or morbid phrasing (`商业模式滤镜`, `事前验尸`, `水电煤`, `死因链条`, `红队挑刺`, `恐慌想割`, `法证排雷`, `一票否决`) degraded institutional credibility; inline `GlossaryPopoverCard` forced chunky `font-mono` with orange dashed underlines inside Chinese body copy.
  2. Mixing ad-hoc Tailwind radii (`rounded-sm/md/2xl`) broke optical concentricity inside popovers/cards; `ButtonGroup` rendered sharp grid-divided flat tinted boxes with noisy gray dots on unselected items; `Textarea` cast heavy card drop shadows inside cards and showed browser resize grippers; `DialogModal` and `ActionMenu` lacked unified close buttons, selection check columns, and placement-aware exit-faster-than-enter overlay curves.
  3. Mounting Recharts `<ResponsiveContainer><AreaChart>` inside every Cockpit Bento card, eagerly bundling all modals/sheets/secondary steps, recompiling Glossary regex per component instance, and importing `@kanon/ai` schemas in `/thesis/[id]/page.tsx` slowed hydration and added unnecessary waterfall latency.
- **Correct Pattern**:
  1. Enforce refined buy-side institutional terminology (`商业质量评估`, `逆向压力推演`, `反向质询`, `财务法证`, `暂不纳入`, `离场条件`) and quiet font-inheriting dotted inline glossary underlines.
  2. Standardize 6-tier concentric radius tokens (`rounded-card` 20px → `rounded-panel` 14px → `rounded-control` 10px → `rounded-item` 8px → `rounded-badge` 6px → `rounded-pill`), dedicated `overlay-motion.css` with `--ease-kanon` / `--ease-exit` / `--ease-overlay`, recessed `shadow-input` + `resize-none` textareas, tray-style `ButtonGroup`, and `ActionMenu` with native `selected` checkmarks and `.kanon-chevron` rotation.
  3. Replace Recharts sparklines with zero-dependency pure-SVG monotone splines, split off-screen views/modals/charts with `next/dynamic` + `useHasOpened`, cache Glossary regex via `WeakMap`, deduplicate SSR auth via `React.cache`, import Zod contracts from `@kanon/core`, and parallelize DB canvas bootstrap in a single initial wave.
- **Why / Gate**: Mechanically enforced by `semantic-radius-only`, `institutional-copy-hygiene`, `no-native-select`, `no-recharts-in-cockpit`, `css-concentric-tokens-and-motion`, and `no-jarring-inline-mono-glossary` in `pnpm check`.

### [2026-11-25] Seamless Invisible Auto-Save, Hairline Editorial Paper Grids & Conclusion-First Agent Dossier

- **Mistake**:
  1. Surfacing a full-width "有未保存修改" banner (`DraftStatusBar`), blocking step switches with `UnsavedChangesDialog`, requiring manual Save clicks on Steps 1–4, and popping success toasts created constant friction and layout jumps.
  2. Placing a coral progress strip along the bottom edge of the rounded `CanvasContextRibbon` and redundant coral bars on sidebar/cards created visual harshness.
  3. Rendering the IC Agent drawer with triple-nested bordered cards, a bright green progress bar, `1ms`/`2ms` dev-log timestamps, and 8 expanded trace cards ABOVE the actual IC Verdict buried conclusions under noisy debug chrome.
  4. Stacking 4 recessed gray-bordered `<Textarea>` boxes with `IC Framework` / English subtitles and 4 corner `填充示例` buttons inside white cards made research forms look like generic OA questionnaires, while English page subtitles (`Quality Assessment`, `STEP 01`, modal subtitles) cluttered reading calm.
- **Correct Pattern**:
  1. Debounced silent auto-save (`useThesisStepDraft` + `useAutoSaveScheduler`) with version-pinned crash recovery, in-flight trailing queue, instant flush on step switch, whisper-quiet ribbon sync indicator, and 5-minute same-step revision coalescing (`recordThesisRevision`).
  2. Remove decorative coral edge bars from sticky ribbons, sidebars, and cards.
  3. Present IC Agent as a conclusion-first single-layer hairline dossier (`Verdict Monolith` → `4-Role Debate` → `Proposals` → default-collapsed borderless `Audit Timeline`).
  4. Use borderless archival-paper inputs (`variant="editorial"`) inside `1px` hairline crosshair grids with hover/focus-revealed helper actions, and remove ornamental English subtitles, eyebrows, and verbose captions globally.
- **Why / Gate**: Elevates KANON from form-heavy SaaS into a calm, frictionless Swiss Editorial institutional research canvas. Verified via `repository.test.ts` revision coalescing test, `pnpm check`, `pnpm test:api`, and live dual-theme visual QA.

### [2026-11-25] Enforce Atomic Agent Batching, Full Archive v3 Parity, Mutation CSRF Guard & Serverless Rate Limits

- **Mistake**:
  1. Looping sequential client-side `patchStep` calls for multi-proposal Agent adoption read stale React closure state (`ctrl.thesis.businessFilter`), silently overwriting earlier proposals in the batch.
  2. Persisting `valuationModelMode` / `driverInputs` only in schema/backend while leaving Step 4 UI panels on ephemeral `useState`, and omitting `catalysts` / `quarterlyReviews` / `agentRuns` from Archive JSON import/export caused silent data loss on reload or backup restore.
  3. Applying `verifySameOrigin` selectively to only half of mutation routes and storing rate-limit buckets in volatile Serverless process memory left thesis mutations exposed to CSRF and reset rate limits across cold starts.
- **Correct Pattern**:
  1. Merge multi-proposal Agent writes inside one atomic DB transaction (`applyAgentProposalsAtomic`) returning hydrated thesis + revisions, and pair `expectedUpdatedAt` OCC (`409 CONFLICT`) with `BroadcastChannel` multi-tab sync.
  2. Keep Step 4 driver inputs, Step 3 transcript drafts, and Archive v3 (`schemaVersion: "kanon-archive/v3"`) 100% lossless with round-trip Golden tests in `repository.test.ts`.
  3. Enforce `verifySameOrigin` on every `POST/PATCH/PUT/DELETE` route mechanically via `api-mutation-csrf-guard`, and back high-risk rate limits with Postgres `rate_limit_buckets` (`0007-rate-limit-buckets.ts`).
- **Why / Gate**: Mechanically enforced by `api-mutation-csrf-guard` in `scripts/api-security-guards.mjs`, dynamic DDL parity + Archive v3 round-trip tests in `packages/core/src/db/repository.test.ts`, and `403`/`409` assertions in `scripts/verify-api-contracts.mjs`.

### [2026-11-25] Cache Parsed SEC Filings in Postgres and Ground IC Agent Proposals Against Evidence

- **Mistake**: Re-downloading multi-megabyte SEC EDGAR HTML documents on every Source Clipper open caused 3–8s latency and risked SEC rate-limits, while keeping Agent proposals purely template-based missed 10-K/10-Q paragraph evidence and unverified LLM figures risked numeric hallucinations.
- **Correct Pattern**: Persist parsed SEC sections and cross-quarter diffs in `sec_filing_documents_cache` (`0008-sec-filing-docs-cache.ts`), use configurable `KANON_SEC_USER_AGENT` with bounded retry (`sec-http.ts`), retrieve filing paragraphs deterministically via BM25 (`search_sec_filing_excerpts`), and pass optional LLM proposals through `isProposalGrounded` figure verification before presentation.
- **Why / Gate**: Enforced by `filing-search-tool.test.ts`, `sec-forensics-v2.test.ts`, `sec_filing_documents_cache` DDL parity in `repository.test.ts`, and `/api/ai/agent/ask` contract checks.
