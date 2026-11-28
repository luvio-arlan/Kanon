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

### [2026-11-25] Maintain Bounded Subdirectories, Dynamic DDL Parity & Exact Enum Unions When Adding Research Lineage and Portfolio Calibration

- **Mistake**: Growing `cross-check-editor.tsx` / `valuation-reverse-dcf-panel.tsx` past the 250-line file cap and risking flat folder overflow (`>= 12` files) when adding Step 2/3 evidence lineage (`hypothesisId`) and portfolio cognitive calibration.
- **Correct Pattern**: Always add new Schema columns via expand-only migrations (`0009-cross-check-hypothesis-link.ts`), extract cohesive sub-cards into bounded domain subdirectories (`lineage/`, `drivers/`, `calibration/`) to keep every module `<= 250` lines, remap child IDs safely on archive import (`archive-importer.ts`), and strictly reuse canonical Zod enum unions (`EmotionState`, `CrossCheck`).
- **Why / Gate**: Enforced by `universal-max-directory-files`, `universal-max-file-lines`, `expand-only-migrations` in `pnpm check`, `repository.test.ts` DDL parity, and `portfolio-calibration.test.ts`.

### [2026-11-25] Enforce Strict PAT Scopes on MCP v2, Lean SSR Projections & Focus-Safe Keyboard Shortcuts

- **Mistake**: Exposing external MCP write tools without explicit `read` vs `read_write` token scope gating risks unintended workspace mutations from read-only desktop integrations; loading full sibling JSONB valuation blobs during SSR canvas bootstrap slows initial TTFT; binding global `Enter` shortcuts when no card is keyboard-selected hijacks native link/button activation.
- **Correct Pattern**: Propagate `scope: ApiTokenScope` through `requireMcpAuthContext` and enforce `scope === "read_write"` before dispatching `append_cross_check_note`, `add_catalyst_event`, or `draft_quarterly_review`; split sibling valuation SSR queries into lightweight scalar column projections while capping initial revisions at 12; guard global `Enter` shortcuts to bind only when `selectedIndex >= 0`.
- **Why / Gate**: Verified via `verify-api-contracts.mjs` (`read` 403-style MCP block vs `read_write` 200 pass, 30 routes inventoried), `pnpm check`, `pnpm test`, and `pnpm build`.

### [2026-11-25] Never Feed Live Slider Values Back Into Their Own Range (`2.4^N` Runaway) or Hardcode Sign/Horizon Strings

- **Mistake**:
  1. Passing live dragged `d.cases.bull.eps` into `computeEpsRange(Math.max(..., d.cases.bull.eps))` multiplied `max` by `2.4×` and `min` by `0.25×` on every pointermove frame—creating an exponential $x_{n+1} = 2.4 x_n$ runaway feedback loop that exploded EPS to `1e31`, auto-saved corrupted numbers to Postgres/localStorage, and shattered layouts across Step 4 and the sidebar.
  2. Hardcoding `（-` before `Math.abs(downsidePct)` misreported asymmetric floors (`bearTarget > currentPrice`) as negative drawdowns (`-188.9%`), hardcoding `三年复合年化`/`3Y` ignored 2Y/5Y horizons, `Number(e.target.value) || 0` broke typing negative buybacks (`-1%`), `EV/FCF 主锚` acted as a cosmetic-only toggle, and SEC XBRL `row.fy` indexing + `rows[idx - 4]` quarterly YoY broke on stock splits (NVDA/AAPL/AVGO) and missing Q4s.
- **Correct Pattern**:
  1. Pin slider ranges from stable initial anchors + explicit commit ceilings (never live `onChange` state), clamp `PrecisionSlider` bounds defensively, enforce upper bounds (`MAX_VALUATION_EPS/PE/PRICE`) in Zod schemas, auto-compact `RollingNumber` above `1M`, and pair `sanitizeValuationInput` with idempotent migration `0010_heal_runaway_valuation` to self-heal already-corrupted rows.
  2. Display signed `bear.returnPct`, dynamic `{horizonYears}`, semantic upside tones, selectable `<article>` + explicit clip button in Source Clipper, ref-tracked `expectedUpdatedAt` on queued autosaves, boolean-checked Step 5 submits, period-end + latest-filed XBRL keying, and exact prior-year quarter label matching.
- **Why / Gate**: Prevents exponential UI feedback loops, corrupted persistence, and financial calculation drift. Verified via `valuation-scenarios.test.ts`, `valuation-advanced.test.ts`, `pnpm check`, `pnpm test`, `pnpm build`, and `pnpm test:api`.

### [2026-11-25] Guard ADR Per-Share Currency Parity, Acyclic Schemas & Zero-Theater Calibration (v7 Research OS)

- **Mistake**:
  1. Applying an ADR share ratio (`5:1`) unconditionally on SEC XBRL `USD/shares` facts multiplied already-ADR-normalized EPS by 5×; importing `v4-extensions` from `v7-research-os` while `v4-extensions` imported `v7-research-os` created a runtime circular Zod schema initialization crash.
  2. Relying solely on free-text `sectorTag` grouping hid correlated semiconductor concentration across custom labels; padding calibration scores with API-locked `zeroLeverageCompliancePct` (30%) inflated zero-sample scores to 72/100; omitting YTD cash-flow de-cumulation and 10-K TOC filtering starved quarterly FCF and MD&A retrieval.
- **Correct Pattern**:
  1. Apply ADR share conversion ONLY when `reportingCurrency !== "USD"` (local-currency 20-F ordinary shares), keep extension schema modules strictly DAG-acyclic (leaf `v7-research-os.ts` imports only `zod`), and route all client `kanonFetch` response schemas through `@kanon/core` contracts.
  2. Normalize factor clusters via `classifyEconomicFactor`, treat Zero-Leverage strictly as a pass/fail gate alongside Brier Score & SPY benchmark alpha, de-cumulate 10-Q 6M/9M cash flows + derive Q4 (`FY - 9M`), skip TOC page-number lines in 10-K HTML, parse Form 4 XML (`cluster_buy` vs `10b5-1`), and combine cross-lingual CN→EN BM25 with Vercel AI SDK multi-step tool calling (`autonomous-ic.ts`).
- **Why / Gate**: Mechanically enforced by `pnpm check` (`depcruise`, `knip`, 393-file Garden limits), `v7-models.test.ts`, `sec-v7.test.ts`, `filing-search-tool.test.ts`, `repository.test.ts` DDL parity (`0011_v7_research_os`), and 32-route `pnpm test:api`.

### [2026-11-25] Eliminate Autosave Spinner Stalls, JSONB Key-Order Save Loops & Segmented Control Jitter

- **Mistake**:
  1. Comparing client drafts with raw `JSON.stringify(a) === JSON.stringify(b)` broke whenever Postgres `jsonb` reordered object keys, Zod `.trim()` stripped trailing whitespace, or client item builders omitted nullable keys (`kpiRule: null`, `linkedThesisId: null`)—causing infinite dirty/autosave loops; triggering `"saving"` immediately during the 650ms debounce and omitting `"idle"` resets on early-return paths left the ribbon spinner stuck indefinitely.
  2. `PATCH /api/theses/[id]` ran three separate full 6-table `getThesisById` hydrations (pre-TX OCC check, TX existence check, post-write hydration with serial child fetches) plus a post-TX revision query (~13 serial DB round-trips per click), making remote Postgres saves visibly sluggish.
  3. Conditionally mounting the colored status dot + `font-semibold` inside `ButtonGroupItem` and animating a variable-width `QuietSyncIndicator` inside `CanvasContextRibbon` shifted sibling buttons horizontally on every click and autosave transition.
- **Correct Pattern**:
  1. Use key-order-independent canonical hashing (`stableDraftHash` / `isDraftEqual`) + `lastSavedHash` server-ack dedup, tighten debounce to `350ms`, delay spinner reveal by `160ms` (only while an actual HTTP request is in flight), add `15s` `AbortController` fetch timeout, and guarantee clean `"idle"` transitions on revert/invalid/unmount/step-switch.
  2. Parallelize `getThesisById` parent + child queries into 1 RTT and consolidate `PATCH /api/theses/[id]` into `updateThesisStepChecked` (single-query 2-column OCC check + write + parallel hydrate + revision + listRevisions in one transaction).
  3. Reserve optical selected width inside `ButtonGroupItem` via a CSS Grid ghost sizer (`equalWidth` on Step 1's 4-row verdict matrix) and lock `QuietSyncIndicator` (`w-[72px]`) and step-pill prefixes (`w-4`) into fixed-width zero-shift slots.
- **Why / Gate**: Guarantees zero stuck spinners, zero infinite save loops, sub-second perceived saves, and `0px` horizontal button jitter. Verified via `repository.test.ts` (`updateThesisStepChecked` OCC + atomic write), `pnpm check`, `pnpm test`, `pnpm build`, and `pnpm test:api`.

### [2026-11-26] Full-Stack Hardening: Multi-Tenant Isolation, Per-Handler AST Security, Math/SEC Accuracy, Bundle Splitting & Print/WCAG Craft

- **Mistake**:
  1. Writing manual 5Y financials (`PUT /api/sec/[ticker]`) into the global `sec_snapshots` cache allowed one tenant to overwrite another's SEC data; file-level CSRF regex missed unguarded secondary mutation handlers in multi-handler route files; non-recursive migration scanning skipped `migrations/v2/`; unguarded child IDs (`hypotheses`/`catalysts`/`crossChecks`) and partial `PATCH` defaults risked cross-thesis ID reuse and silent field resets.
  2. Linked operating model double-counted SBC while `EV/EBIT` misapplied after-tax cash adjustments; Reverse-DCF bisection assumed monotonic RONIC growth; BYOK fetch allowed DNS rebinding / redirect SSRF and weak prompt-evidence boundaries; CSV export missed `=+-@\t\r` formula-injection payloads.
  3. Importing `@kanon/ui` and cross-feature barrels statically dragged Recharts, AI settings, and modal code into `/login` and `/` (`1.34–1.50 MB` raw JS); HeroUI v3 overlay/slider selectors (`.popover__content`, `[data-slot="thumb"]`, lower-specificity motion) were silently overridden; Dark Mode printed dark ink on dark paper and several muted/status tokens missed WCAG 2.1 AA `4.5:1`.
- **Correct Pattern**:
  1. Isolate manual financial overrides per user in `user_sec_overrides` (`0012-user-sec-overrides.ts`), lock thesis mutations with `.for("update")` + re-mint foreign child IDs + validate `linkedThesisId`, upgrade `scripts/api-security-guards.mjs` to TypeScript AST per-handler verification (removing allowlists), and scan `migrations/` recursively in `scripts/garden-guards.mjs`.
  2. Fix Operating Model SBC/EV-EBIT/negative-FCF/0-equity-floor math, grid-bracket Reverse-DCF RONIC solutions, harden `createSafeByokFetch` (DNS public-IP check + `redirect: "error"` + nonce-delimited `wrapUntrustedEvidence`), neutralize CSV formula prefixes, and enforce strict 0-tolerance numeric grounding + target allowlists.
  3. Split `@kanon/ui/theme` and `@kanon/ui/charts` subpath exports + `"sideEffects"` flags + lazy `public-*.ts` feature entrypoints + shared `client-provider-storage.ts`, wrap Dark Mode tokens in `@media not print`, match HeroUI v3 `(0,3,0)` overlay selectors, lift muted/coral/status contrast to WCAG 2.1 AA, and enforce `no-press-scale` (`/\bactive:scale-/`) mechanically in `scripts/check-design-and-limits.mjs`.
- **Why / Gate**: Mechanically enforced across all 32 API routes and 4 packages via `pnpm check` (AST per-handler CSRF, recursive expand-only migrations, `no-press-scale`, `depcruise`, `knip`), expanded Vitest financial/SEC/AI/DB golden suites (`pnpm test`), production bundle build (`pnpm build`), and isolated 32-route API contract verification (`pnpm test:api`).

### [2026-11-26] Single-Source Step Names, Honest Readiness, Live-Priced Onboarding & Persistent Cockpit Views

- **Mistake**:
  1. Five separate local label maps (`STEP_SHORT`, `STEP_NAMES`, `STEPS`, `STEP_COMMANDS`, `STEP_SHORT_NAMES`) drifted into four different names for the same step (e.g. Step 5 = 交易纪律 / 交易纪律与复盘 / 纪律与备忘录 / 零杠杆纪律复盘), so the rail, ribbon, footer, cockpit CTA and command palette disagreed with each other and with the page heading.
  2. `calculateResearchReadiness` used `hypotheses.every(...)`, which is vacuously `true` for an empty list, marking Step 2 complete with zero hypotheses; the cockpit card then rendered `0/0 已验证` and the done-hint was hard-coded to `3 条阈值已定`.
  3. New-thesis presets and the empty-state quick start created archives at stale hard-coded prices (`TSM $192`, `MSFT $425`…), and the modal defaulted to a fake `$150` reference price that could be saved unnoticed; identification needed an extra click and fired a toast on top of the inline notice.
  4. Cockpit view / filter / sort lived only in React state, so reloading, returning from a thesis or sharing a link always reset to 研究总览; the canvas back link skipped the pending-autosave flush and `[` / `]` thesis cycling dropped the active step.
- **Correct Pattern**:
  1. Consume `RESEARCH_STEP_META` / `getResearchStepMeta` from `@kanon/core` for every step title, short label and code; page headings, rail, ribbon pills, footer nav, cockpit CTA and command palette now share one source.
  2. Require `hypotheses.length > 0` before Step 2 counts as complete, derive hints from real counts, and show `尚无核心假设` instead of `0/0 已验证`.
  3. Treat presets as curated copy only: always refresh price / EPS / sparkline through a quiet `apiBootstrapTicker` before creating, start the modal with an empty price, auto-identify on ticker blur (sequence-guarded against stale responses), and disable submit until ticker + positive price are present.
  4. Mirror cockpit `?view=&filter=&sort=` via whitelisted `parseCockpitViewState` (SSR-initialised, `history.replaceState` synced, remembered in `sessionStorage`), flush pending saves before leaving the canvas, keep `?step=` when cycling theses, and carry `next=` (incl. step / view) through login redirects.
- **Why / Gate**: `single-source-step-names` in `scripts/check-design-and-limits.mjs` rejects any local step-name map in `apps/web/src`; readiness semantics covered by `repository.test.ts`; verified via `pnpm check`, `pnpm test`, `pnpm build`, and `pnpm test:api`.

### [2026-11-26] Never Present Derived Estimates as Real Market Data, Silently Heal Invalid Valuation Inputs, or Score Unmatured Brier Predictions (Stage 0 Honesty & Correctness)

- **Mistake**:
  1. Labeling SEC historical CAGR extrapolation (`sec-derived`) as "市场一致预期", synthesizing fake "历史与行业估值分位带" via `p50 * 0.65 / 1.45`, and defaulting unknown tickers to `MSFT/NVDA/GOOGL/AMZN` peers misled investors into treating heuristics as real market data.
  2. Silently healing invalid valuation inputs inside `sanitizeValuationInput` by fabricating `price / 22` EPS and `17/22/27x` PE masked broken user inputs across analytics, calibration, and exports.
  3. Flattening 3-scenario valuation distributions into binary Kelly with a `?? 4` fallback odds constant, computing ROIC with a hardcoded `21%` tax rate (ignoring operating leases, goodwill, and 2% operating cash), hiding a `0.35` CapEx drag constant in the linked operating model, and scoring unmatured predictions with current-price proximity as a "Brier score" introduced conceptual methodology errors.
- **Correct Pattern**:
  1. Return `consensus.source = "unavailable"` (all fields `null`), `valuationBand = null`, and `peers = []` when no real data provider or peer mapping exists; expose historical extrapolation and real peer multiple ranges only under explicit, separate labels.
  2. Return a discriminated `{ ok: true, input } | { ok: false, issues }` result from `sanitizeValuationInput`, skip invalid inputs across analytics/peer-comps/calibration/exports with explicit「估值输入待完善」status, and restrict clamping strictly to flagged UI preview state.
  3. Solve discrete 3-scenario log-utility Kelly `argmax Σ p_i ln(1 + f r_i)` in `packages/core/src/math/sizing/kelly-discrete.ts` with explicit toggleable adjustments; compute ROIC from actual effective tax rate (clamped `0–40%`, explicit `21%` statutory fallback note), operating leases, excess cash (`cash - 2% rev`), and both incl/excl goodwill; parameterize D&A, maintenance/growth CapEx, ΔNWC, SBC cash toggle, and independent multiples in `operating-model.ts`; return `brierScore = null`（「待预测到期」）until the immutable forecast ledger lands in Stage 5.
- **Why / Gate**: Mechanically enforced by `honest-market-consensus-guard` and `no-fabricated-consensus-source` in `scripts/garden-guards.mjs`, plus golden tests in `consensus-and-peers.test.ts`, `valuation-scenarios.test.ts`, `kelly-discrete.test.ts`, `sec-forensics-v2.test.ts`, `sec-v7.test.ts`, and `v7-models.test.ts`.

### [2026-11-26] Never Leave Permanent `clip-path: inset(0 0 0 0)` on Containers Holding Floating Overlays

- **Mistake**: `@keyframes kanon-sparkline-clip` ended at `clip-path: inset(0 0 0 0)` with `animation-fill-mode: both` on `.kanon-sparkline-reveal`, which wrapped both the SVG and `<SparklineHoverBadge className="absolute -top-2 ...">`. After the reveal animation finished, the residual clip-path sliced the top 8px off the hover tooltip (`2M前 $412.25`).
- **Correct Pattern**: Always release `clip-path` to `none` in the final keyframe (`to { clip-path: none; }`), isolate reveal animations to an inner graphic-only wrapper, and place floating tooltips/badges as siblings outside any `overflow-hidden` / `clip-path` ancestor with horizontal edge clamping (`left-0` vs `right-0`).
- **Why / Gate**: Mechanically enforced by `no-permanent-clip-path-forwards` and `no-clipped-floating-overlay` in `scripts/garden-guards.mjs` (`pnpm check`).

### [2026-11-27] Production Closure, Fail-Closed Vault, Transactional Ledger, Point-in-Time Integrity & L2 Mechanical Guards (Waves I–M, G1–G10)

- **Mistake**:
  1. Unset production secrets (`KANON_CREDENTIALS_MASTER_KEY`, `CRON_SECRET`, `KANON_SEC_USER_AGENT`) silently fell back to a hardcoded dev encryption key and returned 503 on cron ticks; 2FA client sent `op` while server expected `action`, and `begin` reset active 2FA without a code.
  2. Ledger mutations parsed `Number()` without Zod finite-positive checks or DB `CHECK` constraints and updated cash outside a transaction (`NaN` poisoned zero-leverage gates); IC approvals trusted client `orgId` without `thesisId` binding, maker-checker, or state machine.
  3. SEC sync wrote `${FY}-12-31` and latest accession across all years, partial security upserts wiped CIK/ADR/currency, historical P/E band had look-ahead bias and mixed split-adjusted prices with unadjusted EPS, Monte Carlo compared undiscounted year-N value to today's price, and valuation UI substituted invented `50B/5B` fallbacks.
  4. Core engines (Beneish/Altman/Piotroski/DuPont, WACC, `getFactsAsOf`, `detectFactRestatements`, `hybridSearchChunks`, `scanFilingRedFlags`, `enqueueJob`, `evaluateAlertRules`, `addOrgMember`) were exported in `index.ts` so `knip` passed despite having zero production callers.
- **Correct Pattern**:
  1. Fail closed in production when `KANON_CREDENTIALS_MASTER_KEY` is absent; use HKDF v2 envelopes with AAD (`purpose:userId:provider`), atomic TOTP replay guards, local `uqr` QR SVG, and one-time recovery codes.
  2. Validate all API mutations with `@kanon/core` Zod schemas, enforce DB `CHECK` constraints + `runInTransaction` + `FOR UPDATE` on ledger/IC mutations, hash-chain `audit_log` with `BEFORE TRUNCATE` protection, and protect immutable forecasts from re-resolution/backdating/deletion.
  3. Store per-fact PIT SEC records with true `periodEnd`/`filedAt`/`accession`, protect security master fields on partial upserts, compute PIT split-adjusted P/E bands (`filedAt <= barDate`), discount Monte Carlo to PV, and wire every core engine into production routes and UI with zero invented fallbacks.
- **Why / Gate**: Mechanically enforced by L2 Guards **G1–G6** in `scripts/wave-guards.mjs` (`pnpm check`), **G7** (`/api/health` `secretsConfigured` check in `scripts/verify-api-contracts.mjs`), **G8** (DB trigger/CHECK negative SQL tests in `workflows.test.ts` & `enterprise.test.ts`), **G9** (seeded PIT look-ahead property test in `warehouse.test.ts`), and **G10** (Playwright DOM truncation matrix in `scripts/verify-ui-truncation.mjs` + `.github/workflows/visual-regression.yml`).

### [2026-11-27] Post-Wave N Security, Queue Resilience, Data Honesty, Real RLS & AST L2 Guards (Waves O / P / Q)

- **Mistake**:
  1. **Misleading RBAC Symbol & Missing Write/Delete Capability Checks**: `assertThesisOwnership` was widened to a read-only check while keeping its ownership name; `discipline`, `reviews`, `steps`, `agent/apply`, and `copilot` routes/repositories let org `viewer`/`compliance` roles mutate thesis positions, cost basis, and hypothesis verdicts. IC approval read `row.orgId` instead of live `theses.orgId`, enabling personal-to-org handover bypasses and self-approval.
  2. **Non-Consensual Org Membership & Cross-Tenant Restricted List**: `POST /api/orgs` added any phone immediately without consent, leaked registration status (`404` vs `201`) with no rate limit, and applied org restricted lists globally to victims' personal accounts.
  3. **Unbatched Job Queue Starvation & Lease Poisoning**: Daily cron lacked `maxDuration`, claimed 12 jobs at once while writing daily bars and SEC facts 1 row per query, starving `evaluate_alerts` at the back of the queue and burning retries on claimed-but-unrun jobs.
  4. **Silent Data Fabrication**: Missing `POLYGON_API_KEY` left split-adjusted prices paired with unadjusted EPS (`pe_band_breach` false alarms); Forensics synthesized missing balance sheet lines (`Assets`, `CurrentLiabilities`, `RetainedEarnings` wrong sign); Step 4 EV/FCF could write `$0` scenarios with 4 uncaught defaults; Step 3 manual SEC sync never returned refreshed `restatements`.
  5. **Paper Guards & No-Op RLS**: Regex L2 guards (`G3`/`G4`/`G6`) counted self-definitions, misspelled `thesesTable`, and never checked roles; RLS migration `0022` lacked `FORCE ROW LEVEL SECURITY` and allowed unset session vars through; SQL-only unique indexes drifted from `schema*.ts`.
- **Correct Pattern**:
  1. **Unified Capability Matrix**: Replace `assertThesisOwnership` (permanently banned by AST Guard **G8**) with explicit `getThesisAccess` / `assertThesisAccess` / `requireThesisAccess(..., "read" | "comment" | "write" | "delete" | "decide")` (enforced on every thesis/AI/export route by AST Guard **G7**), render read-only canvas lock for viewers, validate live `theses.orgId` + research-only snapshot hash (`STALE_SNAPSHOT` 409) + partial unique `in_review` index on IC approvals.
  2. **Invitation Consent & Scoped Compliance**: Require `org_invitations` acceptance (`accepted_at IS NOT NULL`) with uniform `202` anti-enumeration and rate limiting; scope restricted lists strictly to org-linked accounts (`account.orgId`) with canonical ticker (`BRK.B`/`BRK-B`) + CIK matching; protect last org owner (`409`).
  3. **Resilient Queue**: Set `maxDuration = 60`, claim 1 job at a time (`priority ASC`), guarantee a 15s `evaluate_alerts` phase + heartbeat (`health` degrades if stale > 26h), batch bar/fact upserts in 500-row chunks, fetch incremental `1mo` bars when coverage >= 240, and run idempotent `after()` on-demand sync with per-user pending quota (50).
  4. **Honest Financial Data**: Pull Yahoo `events=split|div` + Polygon splits, compute TTM EPS with a `split_unverified` gate and honest `null` current P/E; extract real US-GAAP/IFRS/DEI balance sheet tags with zero synthesis, 1% accounting-identity gate, and SIC 6000–6999 exclusion; return `null` from invalid Valuation Driver inputs with zero fabricated defaults; return refreshed `restatements` & `warehouseSynced` from `POST /api/sec/[ticker]`.
  5. **Real Defense-in-Depth & AST Guards**: Upgrade `scripts/wave-guards.mjs` to TypeScript AST (**G1–G8**) backed by 17 adversarial bypass fixtures (`scripts/wave-guards.test.mjs` wired into `pnpm check`); enforce `FORCE ROW LEVEL SECURITY` + read/write split policies (`0024`/`0025`) verified under `NOBYPASSRLS`; enforce `pg_indexes` + `pg_class` RLS DDL parity in `repository.test.ts`; add edge-triggered alerts, token-hash-only RFC 5545 calendar feeds, envelope key rotation (`packages/core/scripts/rotate-envelopes.mjs`), and 5 Swiss Editorial UX cuts.
- **Why / Gate**: Mechanically enforced by `pnpm check` (`wave-guards.test.mjs` 17 adversarial fixtures + AST G1–G8 + Biome + tsc + depcruise + knip), `rbac-matrix.test.ts`, `wave-p-q-guards.test.ts`, `forensics-wave-p.test.ts`, `repository.test.ts` (column/index/RLS parity), and `pnpm test:api`.

### [2026-11-27] Wave W0 Security, Multi-Basis PIT Integrity, Price-Bar Rebasing & Zero-Fabrication Valuation Guards (Q5-1..Q5-12, G6+ & G13)

- **Mistake**:
  1. **Org Membership Upsert & Stale Inviter Takeover**: `update_role` called an upsert (`addOrgMember`) that inserted arbitrary known `userId`s directly with `accepted_at = now()`, bypassing invitation consent; invitations remained valid even after the inviter was removed or demoted.
  2. **Ungrouped Multi-Basis Financial Facts & Un-Rebased Incremental Price Bars**: `detectFactRestatements` grouped solely by `period_end`, misclassifying stock-split EPS recasts (e.g., NVDA 10:1) and 3M vs 9M Q3 pairs as restatements; incremental `1mo` price bar syncs never re-checked overlap basis or persisted dividends, leaving 10× cliffs on splits and understated total return.
  3. **Alert Starvation & Forced Completion**: `evaluate_alerts` ran at priority 10 before daily data syncs (reading stale previous-day data), scanned full bar history per rule, and marked the job `done` even after timeouts or exceptions.
  4. **Fabricated Valuation Object/Ternary Defaults & Unthrottled SEC Sync**: SOTP & Linked Operating cards still fabricated segment/margin/CAGR/PE defaults inside object literals and ternaries (evading G6), percentile markers rendered at 50% when `null`, thesis creation `after()` syncs lacked rate limits / `AbortSignal` / distributed SEC token bucket, non-SEC tickers (`0700.HK`) degraded `/api/health` for days, SEC snapshots committed ahead of PIT warehouse writes, and `agent/apply` lacked `theses FOR UPDATE` locking + targeted `jsonb_set` + G7 coverage.
- **Correct Pattern**:
  1. Replace `addOrgMember` with strict `updateOrgMemberRole` (`UPDATE ... WHERE accepted_at IS NOT NULL`); add `org_invitations.revoked_at/revoked_by` (`0026`), revoke inviter's pending invites atomically on removal/demotion, re-verify inviter `org.manage_members` on acceptance, and add `revoke_invite` with `org.revoke_invite` audit logging.
  2. Group restatements by `(periodEnd, periodStart, duration)` with split normalization (`kind: "restatement" | "split_recast"`); verify overlap basis (`> 0.1%` drift, source change, or new split/dividend) on incremental bar syncs to trigger full `5y` replacement, persist `dividend` corporate actions, and run Sunday full rebase.
  3. Drain non-alert sync jobs first (`excludeKinds: ["evaluate_alerts"]`), then run cursor-paginated `evaluateAlertRules` in the final 15s phase using `getLatestPriceBar` (`ORDER BY bar_date DESC LIMIT 1`) and real failure backoff.
  4. Eliminate all fabricated defaults in SOTP / Linked Operating / Band cards (`null` + empty state + disabled apply), enforce **G6+** (object/ternary valuation literals) & **G13** (SEC URLs strictly via `fetchSecWithRetry` + distributed 8 req/s token bucket) in `scripts/wave-guards-rs.mjs`, commit PIT facts + filings + SEC snapshot atomically in one transaction, skip `not_sec_registrant` tickers cleanly (`securities.sec_status`), lock `theses FOR UPDATE` + `jsonb_set` + nullable draft catalysts in `agent/apply` (G7 exemption removed), and backfill opening cash as `opening_balance` `deposit` transactions (`0026`).
- **Why / Gate**: Mechanically enforced by `scripts/wave-guards-rs.mjs` + `scripts/wave-guards-rs.test.mjs` (**G6+** & **G13** wired into `pnpm design:check`), `wave-w0-remediation.test.ts`, `edgar-w0.test.ts`, `repository.test.ts`, and `pnpm test:api`.

### [2026-11-27] Wave W1 End-to-End RLS Phase A/B, Split-Command Policies, PgBouncer-Safe Migrations & AST L2 Guards (G7+, G9–G12)

- **Mistake**:
  1. **Unscoped DB Handles & Network Inside DB Transactions**: Routes and SSR pages called `getKanonDb()` directly without `withTenantContext` / `withSystemContext`, leaving tenant RLS dependent on fail-open defaults; LLM/SEC routes held DB transactions across external network streams, and cross-tenant invite/8-K/redflag notifications ran inside a single user's transaction.
  2. **Session-Level Advisory Locks & Fail-Open Local Tests**: Runtime startup migrations used `pg_advisory_lock` (unsafe under Neon PgBouncer transaction pooling) and ran DDL inside app connections; `verify-api-contracts.mjs` ran as Postgres superuser (`BYPASSRLS`), masking RLS violations until production.
  3. **Coarse RLS & Regex/Name-Only Capability Checks**: Migration `0024` used coarse `ALL` policies without command-level RBAC splits (`theses` DELETE vs UPDATE, `research_notes`/`thesis_comments` author-only mutations), `schema*.ts` lacked `.enableRLS()` / `pgPolicy(...)` reflection, and G7 did not verify HTTP-method-to-capability literal matching.
- **Correct Pattern**:
  1. **Single DB Context Gateway & 3-Phase Routes**: Centralize `getKanonDb`/`withTenantContext`/`withSystemContext` strictly inside `apps/web/src/app/api/_lib/db-context.ts` (`withUserDb` / `withSystemDb`, enforced by **G9** & **G12**), migrate all 42 DB routes + 2 SSR pages, split LLM/SSE routes into read-tx → network → write-tx (enforced by **G10**), dispatch cross-tenant 8-K/filing-redflag alerts via queued `withSystemDb("alert_fanout", ...)` jobs (Q5-14), and deliver org invite inbox notices in a separate `withUserDb(invitee)` tx.
  2. **Transactional Migration Lock & Forced Local RLS**: Switch to `pg_advisory_xact_lock`, support `KANON_RUNTIME_MIGRATIONS=off` (`MigrationsPendingError` → `/api/health` 503 with 0 DDL, Q5-9) + direct-URL `pnpm db:migrate` (`DATABASE_URL_MIGRATE`, rejecting `-pooler`), and enable `KANON_RLS_ENFORCE_LOCAL=1` (`kanon_app_local NOBYPASSRLS` + `audit_log` UPDATE/DELETE revoke) in `scripts/verify-api-contracts.mjs` and `rls-fail-closed.test.ts`.
  3. **Migration `0027` + Reflection Parity + G7+**: Deploy 6 SQL helper functions (`kanon_rls_*`, `kanon_thesis_*`) + 48 command-split RLS policies across 21 tenant tables with matching Drizzle `.enableRLS()` / `pgPolicy` definitions verified 1:1 against `pg_class`/`pg_policies`/`pg_proc` (**G11** in `repository.test.ts`), and upgrade **G7+** to verify AST `CallExpression` capability literals per HTTP method.
- **Why / Gate**: Mechanically enforced by **G7+** (`scripts/wave-guards.mjs` + 21 fixtures), **G9 / G10 / G12** (`scripts/wave-guards-rs.mjs` + adversarial tests), **G11** (`packages/core/src/db/repository.test.ts`), `rls-fail-closed.test.ts` (8 fail-closed scenarios + Q5-9), and `pnpm test:api` running under `KANON_RLS_ENFORCE_LOCAL=1`.

### [2026-11-27] Waves W2–W5: Fail-Closed RLS (`0028`), Playwright Golden E2E, Wave R Research Depth & Wave S Real Performance/Risk/Attribution (G14–G19)

- **Mistake**:
  1. **Cascading Deletes Colliding With Immutability Triggers**: Adding `REFERENCES theses(id) ON DELETE CASCADE` on `decision_snapshots` and `hypothesis_status_events` alongside `BEFORE UPDATE OR DELETE` immutability triggers caused `DELETE /api/theses/[id]` to cascade into the trigger and fail with HTTP 500.
  2. **Opening Cash Dated at Today Blocking Historical Backfills**: Assigning `tradeDate = todayIsoUtc()` to `opening_balance` seeds without priority sorting caused chronological full-path replay (`CASH_PATH_NEGATIVE`) to reject legitimate historical buys recorded after account creation, while tail overdrafts and backdated path overdrafts shared a single error code.
  3. **XBRL Linkbase Labels, Adjusted-Close Double-Counting & Flaky E2E Waits**: Parsing only raw XBRL axis member names missed `_lab.xml` `<loc>`→`<labelArc>`→`<label>` human labels; using `.adjClose` in portfolio NAV/risk double-counted splits and cash dividends alongside corporate actions; arbitrary `waitForTimeout`/`networkidle` waits made browser E2E brittle.
- **Correct Pattern**:
  1. **Non-Cascading Immutable Audit/Decision Tables (`0033`)**: Keep `decision_snapshots` and `hypothesis_status_events` free of `ON DELETE CASCADE` (preserving anti-survivorship-bias decision records even if a thesis is deleted), protect both via `BEFORE UPDATE OR DELETE` triggers + `FORCE ROW LEVEL SECURITY` (`kanon_rls_uid()` / `kanon_thesis_readable()`), pair every `hypothesesTable` mutation with `appendHypothesisStatusEvent` (**G14**), and ban `UPDATE/DELETE` on immutable tables (**G15**).
  2. **Deterministic Split-Aware Replay & Unadjusted-Close-Only Analytics**: Sort `opening_balance` seeds before dated transactions in `replayLedgerTransactions`, distinguish `INSUFFICIENT_CASH` (tail overdraft) from `CASH_PATH_NEGATIVE` (mid-path backdated overdraft), compute S1 NAV/TWR/Modified Dietz/SPY-TR, S2 Ledoit-Wolf Constant-Correlation covariance/Jacobi Meucci ENB/Mantegna clusters (`<= 35%`), and S3 PIT Beta (`barDate < openDate`) strictly from unadjusted `.close` + `corporate_actions` (**G16**).
  3. **Grounded Research Intelligence & Deterministic E2E**: Ship 10-K/10-Q section Redline (`0029`), XBRL dimensional segment SOTP (`0030`), HITL guidance credibility ledger (`0031`), Postgres GIN bilingual FTS (`0032`) + strict claim/quote verifier (**G17/G18**) guarded by 28-case `pnpm eval`, and 10-chapter Playwright Golden E2E under `KANON_RLS_ENFORCE_LOCAL=1` with zero `waitForTimeout`/`networkidle` (**G19**).
- **Why / Gate**: Mechanically enforced by **G14–G19** (`scripts/wave-guards-rs.mjs` + `scripts/wave-guards-rs.test.mjs`), 28-case `pnpm eval`, `performance.test.ts` + `risk.test.ts` + `attribution.test.ts` + `decisions-store.test.ts`, 49-route `pnpm test:api`, and 10-chapter `pnpm test:e2e`.

### [2026-11-28] Wave U Data Integrity, Multi-Currency FX, 8-K Press Guidance, Observability & Stage 6a RLS (G20–G31)

- **Mistake**:
  1. **健康检查不可证伪（从未运行即健康）**：`getCronHealth` 在 `lastTickAt === null` 时仍返回 `healthy`，心跳写在最后一步导致任意作业超时 60s 时心跳被跳过；`0 22 * * 1-5` 调度叠加 26 小时阈值造成每个周末误报且周日全量重基永远不触发；生产连接角色是否具备 `BYPASSRLS` 也无在线自检。
  2. **测试夹具比真实上游更干净（只有定期报告、价格无追溯口径）**：`prune_chunks` 将 Form 4 / 8-K 与 10-Q 混在同一组排名只留 4 份，在高频 Form 4 标的（如 NVDA）上直接删除 10-Q 正文分块；Yahoo 与 Polygon 的 `close` 均为按拆股追溯调整价，但净值计算叠加 `shares *= splitRatio` 造成拆股前持仓 −90% 虚假回撤；离线 `pnpm eval` 只打分人工写死答案、夜间评测被硬编码离线。
  3. **首写者锁死主数据**：`upsertFiling` 在 `ON CONFLICT DO NOTHING` 下被不含 `primary_doc_url` 的先到写入锁死，后续完整同步无法补齐文档链接；同样地，错误或未复核的指引兑现一旦写入便永不重算。
  4. **同一事实的口径维度缺失（申报财年 ≠ 事实期间、作业 id 缺 section）**：`resolve_guidance` 用 SEC `companyfacts` 的申报财年 `fy` 匹配指引，同一份 10-K 的比较期也共享该 `fy`，可能把上年实绩误判为今年结果；`build_redline` 作业 id 缺少 `section` 维度导致 `risk_factors` 与 `mda` 互相撞车；SOTP 混入季度分部、入库绕过 EBIT 勾稽闸门，且非美元金额在 UI 硬拼 `$`；S3 归因用 `0033` 倒填当前状态造成前视偏差、删档后 RLS 隐藏假设事件、样本不足直接代换 `β = 1`；S2 风险读取研究卡手填权重而非账本持仓。
- **Correct Pattern**:
  1. **可证伪健康探针与预算感知 Cron**：心跳拆分为 `recordTickStarted` + `recordTickCompleted`，状态显式区分 `ok | pending_first_run | stale | never_ran | overrun`（**G20**），每日 `0 22 * * *` 调度 + 逐作业 `AbortSignal` 剩余时间门控；`/api/health` 暴露真实 `db.bypassRls`、`db.rlsFailClosed`（**G28** + `deploy/rls-verify.sql`）与 `errors24h`。
  2. **真实上游语义对齐与真实检索评测**：`prune_chunks` 仅对定期报告按年报 3 / 季报 6 分桶保留、独立保留最近 8 份 8-K/6-K 并永久保护被 Redline / 指引 / 候选引用的申报（**G24**）；`split-basis.ts` 统一按 `split_adjusted` 价格口径与 `cumSplitFactor` 折算，彻底消除 `shares *=`（**G23**）；新增 PGlite GIN FTS 真实召回单测与在线 `eval:live` 路径；所有 `after()` 收敛至唯一 `scheduleJobOnce` 闸门（**G25**）。
  3. **幂等补齐与受控重算**：`upsertFiling` 在冲突时 `COALESCE` 补齐 `primary_doc_url`；指引兑现增加 `pit/2` 期间边界绑定与冻结窗口，重算受版本与状态机保护。
  4. **显式维度与财务口径严格化**：指引兑现按 `periodEnd` + 精确期间长度匹配（**G22**），Redline 作业 id 纳入 `section`（**G21**），SOTP 仅接受年度分部且强制校验 `profitReconciled` 并通过 `formatMoney` 显式展示币种（**G29**），S2 严格按个人账本持仓加权并修正 Ledoit-Wolf `ρ`，S3 缺失 PIT β 返回 `null`、标记 `historical_backfill` 排除前视偏差并在 `0034` 放行快照持有者读取已删档案的 `hypothesis_status_events`（**G26**）；同步落地 U1 多币种账本与 ECB FX 归因（`0035`）、8-K Ex-99.1 新闻稿指引候选（`0036`）、数据源许可标注与禁止跨商静默回落 Yahoo、U2 免登录 `/sample/[slug]`（**G31**）、U3 `X-Request-Id` 贯穿与 `app_error_events` + Stage 6a 四表 RLS（`0037`）+ `/thesis/[id]/present` 全屏只读演示。
- **Why / Gate**: Mechanically enforced by **G20–G31** (`scripts/wave-guards-u.mjs` + `scripts/wave-guards-u.test.mjs`, upgraded `G14+` in `scripts/wave-guards-rs.mjs`, `public-sample-no-db` in `.dependency-cruiser.cjs`), zero-allowlist **G30** (`entry-export-prod-callers`), 33-table RLS parity in `repository.test.ts` + `rls-fail-closed.test.ts`, 50-route `pnpm test:api`, and 10-chapter `pnpm test:e2e`.

### [2026-11-28] Wave V Production RLS Posture, Currency Root Cause, Real-Upstream 8-K Guidance, Full Stage 6b RLS & Self-Verifying Codebase Map (G32–G42)

- **Mistake**:
  1. **完成定义的线上条件未被执行**：Wave U DoD 要求生产 `db.bypassRls = false`，但部署后 `/api/health` 持续 `degraded` + `bypassRls: true`，无人告警；仓库也没有可执行的 NOBYPASSRLS 角色脚本，RLS 在生产形同虚设。
  2. **夹具比真实上游更干净（第二次，已升级为 L2 守卫）**：ECB 拉取写死 `lastNObservations=15`，历史持仓永远 `fx_stale`；8-K 定位器按文件名猜测（NVDA 为 `q3fy27pr.htm`），排除规则误删 `press`/`fiscal`；要点句里的 “outlook” 覆盖期间上下文；`GAAP and non-GAAP … respectively` 被并成一个更宽的 non-GAAP 区间——真实 NVDA 新闻稿 0 条候选，而单测全绿且把错误区间写成了断言。
  3. **规范化抹掉语义维度**：`normalizeCanonicalTicker` 把 `0700.HK` 改为 `0700-HK`，之后才推断币种 → 港股成交被记为 USD × 1；`0034` 后缀正则与 `0035` 回填同样看不到 `-HK`，错误被静默固化。
  4. **手写排除清单 = 静默丢作业**：内联 fan-out 与告警阶段按 “排除列表” 认领作业，新增的 `sync_fx_rates` / `extract_press_guidance` 不在列表中，会被认领、不执行、直接标记完成；遥测写入与作业失败同事务，遥测出错即回滚失败记录并中断 Tick。
  5. **同一账本三套口径 & 手写目录地图易漂移**：风险路由手写重放输入、丢弃币种与汇率，跨币种组合风险权重静默错误；列表契约丢弃 `baseCurrency` / `ledgerInconsistent`，前端永远按 USD 渲染；记账界面不传 `thesisId`，决策快照从不生成；大型 Monorepo 缺少自动校验的拓扑索引，新会话 AI 需反复扫目录。
- **Correct Pattern**:
  1. **可执行、可巡检的生产姿态**：`deploy/rls-provision-app-role.sql` + 条件授权迁移 `0038`；`health-watch.yml` 每小时断言 `status = healthy`、`db.bypassRls = false`（**G32**）。
  2. **真实上游样本即夹具**：ECB `startPeriod` 区间回填 + 事务外 `ensureFxCoverage` + `fxGaps`（**G35**）；EX-99.1 按 `-index.html` 的 Type 列定位、期间上下文只由 “outlook + 期间” 行设置、实体完整解码、GAAP/non-GAAP 拆分，以真实 NVDA 新闻稿为黄金夹具（**G36**），`0040` 版本化与撤回，采纳强制同证券（**G37**）。
  3. **先推断后规范化**：币种从用户原始代码推断；数字交易所代码接受 `-` 形式；`0039` 重新标记受影响账户，经所有者确认（`confirm_legacy_currency`）后才解除；同币种汇率必须为 1、券商汇率偏离 ECB 超 3% 需确认；捏造回落（`: 1`、`: "USD"`）由 **G34** 禁止。
  4. **白名单认领与观测隔离**：`claimDueJobs({ onlyKinds })` 只认领能执行的作业；失败先落库、遥测另起事务并吞错（**G39**）；health 暴露 `freshness.staleTickers` / `superseded48h`（**G38**），让被 supersede 掩盖的饥饿可证伪；`/api/market/bootstrap` 包裹上游异常确保 `X-Request-Id` 恒存在。
  5. **单一来源、全量 40/40 表 RLS 与自校验代码库地图**：`loadPortfolioAnalyticsContext` + `toReplayTxInput` 供性能 / 风险 / 归因共用（**G33**），风险权重按 ECB 交叉汇率计价并移入 `math/risk`；汇率贡献用 Carino 链接与 TWR 精确可加；Stage 6b 全量收口（`0041` + `0043`）通过 `kanon_org_role` / `kanon_audit_chain_tail` / `kanon_create_organization` / `kanon_accept_invitation` / `kanon_ticker_restricted` 定义者函数实现 40/40 表零待定覆盖（**G40**）；托管 AI 按用户日额度限流（`0042` `key_source`，**G41**）；`pnpm map:update` 自动生成 `docs/CODEBASE_MAP.md` 并由 **G42** 在 `pnpm check` 逐字节防漂移。
- **Why / Gate**: Mechanically enforced by **G32–G34, G39, G41–G42** (`scripts/wave-guards-v.mjs` + `scripts/wave-guards-v.test.mjs`) and Vitest suites **G35** (`ledger-currency.test.ts`), **G36** (`press-guidance.test.ts`, real SEC fixtures), **G37** (`guidance-candidates.test.ts`), **G38** (`queue-freshness.test.ts`), **G40** (`stage6b-rls.test.ts`, enforced RLS), plus 40/40-table RLS parity in `repository.test.ts`.
