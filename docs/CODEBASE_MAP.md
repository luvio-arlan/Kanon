# KANON Codebase Map (Auto-Generated · Enforced by G42)

> **Single source of truth for instant AI & human navigation.** Generated deterministically by `pnpm map:update` (`scripts/generate-codebase-map.mjs`) and checked byte-for-byte in `pnpm check` (G42). Do not hand-edit.

## 1. Workspace Packages & Public Exports

| Package | Entrypoints | Boundary Rule |
| :--- | :--- | :--- |
| `@kanon/ui` | `.` · `./theme` · `./charts` · `./tokens.css` | Pure UI primitives; zero `@kanon/core` / `@kanon/ai` / `apps/web` imports |
| `@kanon/core` | `.` (contracts/math/schemas/export) · `./db` (Drizzle/repos) · `./testing` | Zero React/Next/AI imports; `./db` allowed only in `apps/web/src/app/**` |
| `@kanon/ai` | `.` (SEC EDGAR, market adapters, retrieval, IC agent, copilot) | Server-only runtime; client slices may use `import type` only |
| `@kanon/web` | `apps/web/src/{app,shared,features}` | Acyclic vertical slices; sibling features import only `index.ts` / `public-*.ts` |

## 2. Web Pages (`apps/web/src/app/**/page.tsx`)

| Route | File |
| :--- | :--- |
| `/login` | `apps/web/src/app/(auth)/login/page.tsx` |
| `/register` | `apps/web/src/app/(auth)/register/page.tsx` |
| `/` | `apps/web/src/app/page.tsx` |
| `/sample/[slug]` | `apps/web/src/app/sample/[slug]/page.tsx` |
| `/thesis/[id]` | `apps/web/src/app/thesis/[id]/page.tsx` |
| `/thesis/[id]/present` | `apps/web/src/app/thesis/[id]/present/page.tsx` |

## 3. Frontend Feature Slices (`apps/web/src/features/*`)

| Feature Slice | Public Entrypoints | Subdirectories |
| :--- | :--- | :--- |
| `ai-settings` | `index.ts` | `components/`, `lib/` |
| `auth` | `index.ts`, `public-account-menu.ts` | `components/`, `lib/` |
| `cockpit` | `index.ts` | `components/`, `data/`, `lib/` |
| `glossary` | `index.ts` | `components/`, `data/` |
| `journal` | `index.ts` | `components/`, `lib/` |
| `portfolio` | `index.ts`, `public-sheets.ts` | `components/`, `lib/` |
| `research-steps` | `index.ts`, `public-step2.ts`, `public-step3.ts` | `components/`, `lib/` |
| `thesis` | `index.ts` | `components/`, `data/`, `hooks/` |
| `thesis-present` | `index.ts` | — |
| `valuation` | `index.ts` | `components/`, `lib/` |

## 4. Shared Client Primitives (`apps/web/src/shared/*`)

| Domain / Subdir | Path | Modules |
| :--- | :--- | :--- |
| `components` | `apps/web/src/shared/components/` | `alert-bell-toggle`, `editorial-caustic-field`, `theme-orb-button` |
| `hooks` | `apps/web/src/shared/hooks/` | `use-autosave-scheduler`, `use-dirty-guard`, `use-has-opened`, `use-on-unmount`, `use-thesis-step-draft` |
| `lib` | `apps/web/src/shared/lib/` | `autosave-engine`, `client-provider-storage`, `cockpit-return`, `draft-storage`, `kanon-fetch`, `report-client-error` |

## 5. API Route Surface (`apps/web/src/app/api/**/route.ts`)

Total: **50** API route handlers (`apps/web/src/app/api/**/route.ts`, shared helpers in `apps/web/src/app/api/_lib/`).

| Domain | Endpoints & Methods |
| :--- | :--- |
| `ai` | `/api/ai/agent/apply` (POST) · `/api/ai/agent/ask` (POST) · `/api/ai/agent` (GET, POST) · `/api/ai/copilot` (POST) |
| `auth` | `/api/auth/ai-credentials` (GET, POST, DELETE) · `/api/auth/login` (POST) · `/api/auth/logout` (POST) · `/api/auth/me` (GET) · `/api/auth/password` (POST) · `/api/auth/profile` (PATCH) · `/api/auth/register` (POST) · `/api/auth/sessions` (GET, DELETE) · `/api/auth/tokens` (GET, POST, DELETE) · `/api/auth/totp` (GET, POST, DELETE) |
| `calendar` | `/api/calendar/[token]` (GET) |
| `export` | `/api/export/portfolio` (GET) · `/api/export/thesis/[id]` (GET) |
| `health` | `/api/health` (GET) |
| `import` | `/api/import/thesis` (POST) |
| `inbox` | `/api/inbox` (GET, POST, PATCH) |
| `internal` | `/api/internal/jobs/tick` (GET, POST) |
| `market` | `/api/market/benchmarks` (GET) · `/api/market/bootstrap` (GET) · `/api/market/provider-test` (POST) · `/api/market/quotes` (GET) · `/api/market/refresh-prices` (POST) |
| `mcp` | `/api/mcp/context` (GET) · `/api/mcp` (GET, POST) |
| `orgs` | `/api/orgs` (GET, POST) |
| `portfolio` | `/api/portfolio/attribution` (GET) · `/api/portfolio/calibration` (GET) · `/api/portfolio/ledger` (GET, POST) · `/api/portfolio/performance` (GET) · `/api/portfolio/risk` (GET) |
| `sec` | `/api/sec/[ticker]/filing` (GET) · `/api/sec/[ticker]/redline` (GET) · `/api/sec/[ticker]` (GET, POST, PUT) · `/api/sec/[ticker]/segments` (GET, POST) |
| `telemetry` | `/api/telemetry/client-errors` (POST) |
| `theses` | `/api/theses/[id]/discipline` (POST) · `/api/theses/[id]/forecasts` (GET, POST, PATCH) · `/api/theses/[id]/guidance` (GET, POST, PATCH) · `/api/theses/[id]/ic` (GET, POST, PATCH) · `/api/theses/[id]/model-versions` (GET, POST) · `/api/theses/[id]/notes` (GET, POST, PATCH, DELETE) · `/api/theses/[id]/peers` (GET, POST, DELETE) · `/api/theses/[id]/reviews` (GET, POST) · `/api/theses/[id]/revisions` (GET) · `/api/theses/[id]` (GET, PATCH, DELETE) · `/api/theses` (GET, POST) |

## 6. Database Schema & RLS Matrix (`packages/core/src/db/`)

Total: **57** Drizzle `pgTable` tables (**40** RLS-protected), **43** expand-only migrations (latest: `0043-stage6b-org-rls`).

| Schema File | Tables (`[RLS]` = `enableRLS()`) |
| :--- | :--- |
| `packages/core/src/db/schema-decisions.ts` | `decision_snapshots` [RLS], `hypothesis_status_events` [RLS] |
| `packages/core/src/db/schema-enterprise.ts` | `organizations`, `memberships` [RLS], `org_invitations` [RLS], `ic_approvals` [RLS], `thesis_comments` [RLS], `audit_log` [RLS], `restricted_list` [RLS] |
| `packages/core/src/db/schema-extensions.ts` | `glossary_terms`, `users`, `sessions` [RLS], `api_tokens` [RLS], `market_quotes_cache`, `rate_limit_buckets`, `sec_filing_documents_cache`, `user_sec_overrides` [RLS], `user_totp_factors` [RLS], `login_lockouts`, `sec_filings_cache` |
| `packages/core/src/db/schema-intel.ts` | `filing_redlines` [RLS], `segment_reports` [RLS], `segment_lines` [RLS], `guidance_candidates` [RLS], `guidance_commitments` [RLS] |
| `packages/core/src/db/schema-platform.ts` | `ai_usage` [RLS], `user_ai_credentials` [RLS], `app_error_events` [RLS] |
| `packages/core/src/db/schema-warehouse.ts` | `securities`, `fx_rates_daily`, `price_bars_daily`, `corporate_actions`, `filings`, `financial_facts`, `jobs`, `filing_chunks`, `thesis_peers` [RLS], `estimates_snapshots`, `model_versions` [RLS] |
| `packages/core/src/db/schema-workflows.ts` | `alert_rules` [RLS], `inbox_items` [RLS], `forecasts` [RLS], `calendar_tokens` [RLS], `portfolio_accounts` [RLS], `transactions` [RLS], `lots` [RLS] |
| `packages/core/src/db/schema.ts` | `theses` [RLS], `hypotheses` [RLS], `cross_checks` [RLS], `valuation_scenarios` [RLS], `discipline_entries` [RLS], `research_notes` [RLS], `copilot_outputs` [RLS], `thesis_revisions` [RLS], `quarterly_reviews` [RLS], `agent_runs` [RLS], `thesis_catalysts` [RLS] |

## 7. Data Repositories (`packages/core/src/db/repositories/`)

| Domain / Subdir | Path | Modules |
| :--- | :--- | :--- |
| `(root)` | `packages/core/src/db/repositories/` | `archive-importer`, `auth-crypto`, `auth-store`, `copilot-store`, `discipline-mutations`, `review-and-agent-store`, `revision-queries`, `starter-workspace`, `thesis-canvas-bootstrap`, `thesis-mutations`, `thesis-queries`, `thesis-step-writers` |
| `account` | `packages/core/src/db/repositories/account/` | `api-tokens-store`, `profile-and-sessions` |
| `agent` | `packages/core/src/db/repositories/agent/` | `agent-apply-store` |
| `enterprise` | `packages/core/src/db/repositories/enterprise/` | `audit-and-restricted-store`, `ic-and-compliance-store`, `ic-snapshot-hash`, `org-invitations-store`, `organizations-and-rls-store`, `thesis-comments-store` |
| `intel` | `packages/core/src/db/repositories/intel/` | `guidance-candidates-store`, `guidance-drafts-store`, `guidance-resolver`, `guidance-store`, `redline-store`, `segment-store` |
| `library` | `packages/core/src/db/repositories/library/` | `research-notes-store` |
| `market` | `packages/core/src/db/repositories/market/` | `quote-cache-store` |
| `ops` | `packages/core/src/db/repositories/ops/` | `queue-freshness` |
| `portfolio` | `packages/core/src/db/repositories/portfolio/` | `analytics-context-store`, `decision-snapshot-store`, `fx-coverage-store`, `fx-rates-reader`, `hypothesis-events-store`, `ledger-replay-store`, `performance-inputs-store` |
| `sec` | `packages/core/src/db/repositories/sec/` | `filing-docs-cache-store`, `user-sec-overrides-store` |
| `security` | `packages/core/src/db/repositories/security/` | `ai-credentials-and-usage-store`, `app-errors-store`, `db-posture`, `login-lockout-store`, `rate-limit-store`, `rls-policies`, `tenant-context`, `totp-and-lockout-store` |
| `thesis` | `packages/core/src/db/repositories/thesis/` | `archive-extras-restorer`, `inbound-cross-checks`, `price-anchor-writer`, `thesis-access`, `thesis-lookups`, `thesis-starters` |
| `warehouse` | `packages/core/src/db/repositories/warehouse/` | `facts-pit-store`, `facts-pit-types`, `filing-chunks-store`, `filings-store`, `job-queue-helpers`, `jobs-and-peers-store`, `model-versions-store`, `peers-and-estimates-store`, `price-bars-store`, `securities-and-fx-store`, `valuation-bands-store`, `watchlist-enqueue` |
| `workflows` | `packages/core/src/db/repositories/workflows/` | `alert-evaluator-store`, `alert-form8k-eval`, `calendar-feed-store`, `inbox-and-forecasts-store`, `ledger-fifo-helpers`, `ledger-legacy-confirm`, `ledger-reversal-store`, `portfolio-ledger-store` |

## 8. Pure Financial Math (`packages/core/src/math/`)

| Domain / Subdir | Path | Modules |
| :--- | :--- | :--- |
| `(root)` | `packages/core/src/math/` | `hurdle-ladder`, `implied-expectations`, `portfolio-analytics`, `portfolio-stress`, `research-readiness`, `sec-analytics`, `sec-forensics`, `sec-forensics-metrics`, `sensitivity-matrix`, `valuation-advanced`, `valuation-scenarios` |
| `attribution` | `packages/core/src/math/attribution/` | `beta-pit`, `decision-matrix`, `episodes`, `index`, `pit-judgment` |
| `calibration` | `packages/core/src/math/calibration/` | `forecast-scoring`, `index`, `performance-attribution` |
| `dcf` | `packages/core/src/math/dcf/` | `equity-bridge`, `fcff-dcf`, `index`, `reverse-dcf-cap`, `wacc` |
| `forensics` | `packages/core/src/math/forensics/` | `altman`, `beneish`, `dupont`, `index`, `piotroski` |
| `guidance` | `packages/core/src/math/guidance/` | `credibility`, `guidance-outcome`, `index`, `period-binding` |
| `institutional` | `packages/core/src/math/institutional/` | `catalyst-radar`, `cognitive-calibration`, `index`, `peer-comps`, `portfolio-calibration`, `weekly-digest` |
| `models` | `packages/core/src/math/models/` | `ev-owner-fcf`, `factor-clusters`, `hypothesis-evaluator`, `index`, `kpi-expression-parser`, `kpi-templates`, `operating-model`, `roic-helpers`, `sotp-model`, `tsr-decomposition`, `valuation-validation` |
| `performance` | `packages/core/src/math/performance/` | `benchmark-tr`, `dividend-audit`, `drawdown`, `fx-attribution`, `fx-contribution`, `index`, `ledger-cash`, `ledger-replay`, `nav-helpers`, `nav-series`, `split-basis`, `twr` |
| `risk` | `packages/core/src/math/risk/` | `aligned-returns`, `constrained-kelly`, `correlation-clusters`, `covariance`, `index`, `jacobi-eigen`, `ledger-weights`, `risk-contrib`, `risk-decomposition` |
| `segments` | `packages/core/src/math/segments/` | `index`, `reconcile-segments`, `sotp-import` |
| `simulation` | `packages/core/src/math/simulation/` | `index`, `monte-carlo`, `prng` |
| `sizing` | `packages/core/src/math/sizing/` | `kelly-discrete` |

## 9. Shared Zod Contracts & Schemas (`packages/core/src/{contracts,schemas,export,security}/`)

| Domain / Subdir | Path | Modules |
| :--- | :--- | :--- |
| `(root)` | `packages/core/src/contracts/` | `account-contracts`, `ai-contracts`, `api-contracts`, `auth-contracts`, `financial-concepts`, `i18n`, `market-contracts`, `portfolio-contracts`, `provenance`, `sec-filing-contracts`, `workflow-contracts`, `workflow-response-contracts` |
| `analytics` | `packages/core/src/contracts/analytics/` | `attribution-contracts`, `index`, `ledger-contracts`, `performance-contracts`, `risk-contracts` |
| `intel` | `packages/core/src/contracts/intel/` | `guidance-contracts`, `index`, `primitives`, `redline-contracts`, `segment-contracts` |
| `ops` | `packages/core/src/contracts/ops/` | `health-contracts`, `index` |

| Sibling Domain | Path | Modules |
| :--- | :--- | :--- |
| `schemas` | `packages/core/src/schemas/` | `research`, `thesis`, `v4-extensions`, `v5-institutional`, `v7-research-os` |
| `export` | `packages/core/src/export/` | `formatters-html`, `formatters-sections`, `formatters` |
| `security` | `packages/core/src/security/` | `secret-envelope`, `totp` |

## 10. AI, SEC EDGAR, Retrieval & Market Engines (`packages/ai/src/`)

| Domain / Subdir | Path | Modules |
| :--- | :--- | :--- |
| `(root)` | `packages/ai/src/` | `index`, `parse-structured` |
| `agent` | `packages/ai/src/agent/` | `ask-ic`, `autonomous-ic`, `deterministic-tools`, `drift-audit-tool`, `filing-search-tool`, `ic-context-packets`, `market-catalyst-tools`, `proposal-grounding`, `run-research-agent`, `tool-registry`, `types` |
| `copilot` | `packages/ai/src/copilot/` | `grounded-fallback`, `run-copilot`, `safe-provider-fetch` |
| `guidance` | `packages/ai/src/guidance/` | `draft-extractor`, `quote-anchor` |
| `market` | `packages/ai/src/market/` | `bars/providers`, `consensus-and-peers`, `daily-bars`, `finnhub-adapter`, `fmp-adapter`, `fx-ecb`, `peer-catalog`, `polygon-adapter`, `provider-registry`, `quote-client`, `types`, `yahoo-adapter` |
| `models` | `packages/ai/src/models/` | `registry` |
| `retrieval` | `packages/ai/src/retrieval/` | `fin-lexicon`, `hybrid-search`, `query-plan` |
| `schemas` | `packages/ai/src/schemas/` | `copilot`, `red-team` |
| `sec` | `packages/ai/src/sec/` | `annuals/extract-maps`, `edgar-annuals`, `edgar-client`, `edgar-quarterlies`, `filing-reader`, `filing-redline`, `filing-text-parser`, `form4-parser`, `form8k-parser`, `pit/pit-facts-extractor`, `press/exhibit-locator`, `press/index`, `press/press-basis-split`, `press/press-guidance-rules`, `press/press-period-context`, `redline/align`, `redline/classify`, `redline/index`, `redline/lexicon`, `redline/normalize`, `redline/pairing`, `redline/primary-doc`, `redline/section-extractor`, `sec-http`, `segments/filing-index`, `segments/index`, `segments/member-labels`, `segments/segment-extract`, `segments/segment-rules`, `segments/xbrl-instance-scan`, `xbrl-balance-helpers`, `xbrl-helpers`, `xbrl-period-utils` |
| `verification` | `packages/ai/src/verification/` | `citation-relevance`, `claim-verifier`, `cn-number-units`, `index`, `period-binding` |

## 11. Design System & UI Components (`packages/ui/src/`)

| Domain / Subdir | Path | Modules |
| :--- | :--- | :--- |
| `(root)` | `packages/ui/src/` | `index`, `theme` |
| `charts` | `packages/ui/src/charts/` | `sec-financial-chart`, `valuation-sparkline` |
| `components` | `packages/ui/src/components/` | `agent/agent-log`, `agent/agent-thinking-indicators`, `agent/agent-thinking`, `agent/composer-loader`, `data-display/market-session-badge`, `data-display/progress-bar`, `data-display/range-position-bar`, `data-display/readiness-ring`, `data-display/rolling-number`, `data-display/stat-card`, `forms/discipline-switch`, `forms/input`, `forms/precision-slider`, `forms/search-field`, `forms/segmented-tabs`, `forms/textarea`, `layout/sidebar-theme-switch`, `layout/workbench-nav`, `layout/workbench-shell`, `overlays/action-menu`, `overlays/command-menu`, `overlays/dialog-modal`, `overlays/glossary-popover-card`, `overlays/provenance-popover`, `overlays/scroll-fade`, `overlays/settings-shell`, `overlays/sheet`, `overlays/toaster`, `overlays/tooltip`, `primitives/badge`, `primitives/button-group`, `primitives/button`, `primitives/card`, `primitives/kanon-mark`, `primitives/kbd`, `primitives/spinner`, `primitives/theme-provider` |
| `lib` | `packages/ui/src/lib/` | `cn`, `format-money`, `motion` |

## 12. Mechanical Quality Gates & Scripts (`scripts/*.mjs`)

| Script | Role / Enforced Guards |
| :--- | :--- |
| `scripts/api-security-guards.mjs` | AST per-handler CSRF (`verifySameOrigin`) gate on all API mutations |
| `scripts/ast-guard-rules.mjs` | Extended AST UI/React guards (box-in-box, popover-in-p, raw fetch, effect limits) |
| `scripts/check-design-and-limits.mjs` | Master `pnpm design:check` runner (file/fn/nesting limits, tokens, copy, all wave guards) |
| `scripts/garden-guards.mjs` | Directory density (<=12), expand-only migrations, AGENTS parity, optical/editorial CSS hygiene |
| `scripts/generate-codebase-map.mjs` | G42 — Deterministic generator for `docs/CODEBASE_MAP.md` (`pnpm map:update`) |
| `scripts/verify-api-contracts-hardened.mjs` | Hardened API contract assertions (G20 health, auth, MCP scopes, ledger, telemetry) |
| `scripts/verify-api-contracts.mjs` | 50-route isolated API + SSR + Fail-Closed RLS (`KANON_RLS_ENFORCE_LOCAL=1`) verifier |
| `scripts/verify-ui-truncation.mjs` | Playwright DOM truncation & overflow verifier across desktop viewports and themes |
| `scripts/wave-guards-rs.mjs` | G6+, G9–G19 — Single DB gateway, 3-phase LLM routes, immutable events, unadjusted close, E2E waits |
| `scripts/wave-guards-u.mjs` | G21–G30 — Zero fabricated fallbacks, split basis, chunk retention, entry-export prod callers |
| `scripts/wave-guards-v.mjs` | G32–G34, G39, G41–G42 — Prod health watch, single-source replay, telemetry isolation, hosted-AI quota, map parity |
| `scripts/wave-guards.mjs` | G1–G8 — Client fetch/fallback bans, AST capability-to-method RBAC (G7+) |
