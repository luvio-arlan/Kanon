# KANON v3.0–v5.0 Product Critique & Technical Architecture Blueprint

> Companion architectural strategy document to [docs/PRD.md](./PRD.md).
> Captures the 2025–2026 institutional buy-side benchmarks, Swiss Editorial Design Scale v3, sub-50ms performance evolution, and MCP-ready Agent-Native Research OS architecture.

## 1. Benchmark Foundations

- **Institutional Equity Research UX (AlphaSense, Hebbia, Rogo, Koyfin, Fiscal.ai, Quartr)**: Trust & auditability beat raw generation speed. Every AI assertion must carry deterministic tool provenance, XBRL/filing anchors, and Human-in-the-Loop (HITL) approval before mutating the investment thesis.
- **Buy-Side Methodology (Variant Perception, Key Debate, Unit Economics, Pre-Mortem)**: Great research isolates (1) what consensus prices in, (2) our concrete variant perception, (3) the 1–2 binary key debates over 18 months, and (4) an explicit pre-mortem narrative before risking capital.
- **Web Craft & Motion Physics (Linear, Stripe, Emil Kowalski, Rauno Freiberg)**:
  - Sub-300ms transitions; `0ms` zero-friction for high-frequency keyboard shortcuts.
  - Crisp color/border feedback on buttons (zero `active:scale-*` press jitter); overlays enter from `scale(0.96)` origin-aware (never `scale(0)`).
  - Pure opacity/transform transitions on step switches (zero GPU `filter: blur(...)` repaint jank).
- **Agentic & Local-First Systems**:
  - Hybrid separation: deterministic math/XBRL in Postgres + `@kanon/core/math`, narrative synthesis via structured tool-calling (`MCP-ready` tool registry) with strict `maxSteps` caps and SSE live reasoning traces.
  - Evolution path from optimized RSC + lightweight summary projections + optimistic UI (v3.0) toward ElectricSQL/Zero delta sync (v5.0).

## 2. Roadmap Execution Phases

- **v3.0 (Implemented Now)**:
  - Buy-Side Variant Perception / Key Debate / Pre-Mortem scaffolding in Step 1 + DB schema + exports.
  - Formalized Modular Type Scale, 4-tier Elevation Scale, and 4-tier Motion Physics Scale in `@kanon/ui`.
  - `O(N+M)` query indexing, lightweight `listThesisSummaries` projection for canvas switcher, streaming `loading.tsx` skeletons, and `⌘S` / `⌘J` shortcuts.
  - MCP-ready `packages/ai/src/agent/` multi-step research orchestrator + `POST /api/ai/agent` SSE stream + `AgentResearchSheet` (`⌘J`) with live tool traces and 1-click HITL proposal adoption.
- **v4.0–v6.0 (Implemented Now)**:
  - Persistent `sec_filing_documents_cache` (0008), Working Capital Cycle (DSO/DIO/DPO/CCC) & Form 4 insider monitor, and deterministic BM25 full-text search over 10-K/10-Q paragraphs (`search_sec_filing_excerpts`) with numeric grounding verification (`isProposalGrounded`) + multi-turn IC follow-up (`POST /api/ai/agent/ask`).
  - Atomic multi-proposal Agent apply (`applyAgentProposalsAtomic`), `expectedUpdatedAt` OCC (`409 CONFLICT`), `BroadcastChannel` tab sync, lossless Archive v3 export/import, and persistent Postgres `rate_limit_buckets` + `verifySameOrigin` CSRF gate across all mutations.
  - Step 2/3 bidirectional `cross_checks.hypothesis_id` lineage (0009), 3-bar Expectations Contrast chart, custom probability normalization, Portfolio Cognitive Calibration (`calm / hesitant / fomo / fearful` win rates), and Weekly IC Digest (`GET /api/portfolio/calibration`).
  - Scoped Streamable HTTP MCP Server v2 (`6 read + 3 read_write tools` via `/api/mcp`) and print-grade `@media print` A4 IC Memo typography.
- **v7.0 (Implemented Now)**:
  - Linked 3-scenario operating model + SOTP + grid-bracketed RONIC Reverse-DCF + 5Y benchmarks, per-user isolated `user_sec_overrides` (0012), persistent `research_notes` (0011) with full Archive v3 parity, and SSRF-hardened BYOK AI provider fetch with nonce-delimited prompt evidence.
  - Tree-shaken `@kanon/ui/{theme,charts}` subpath exports, lazy `public-*.ts` feature entrypoints, AST per-handler CSRF verification, recursive expand-only migration checks, and WCAG 2.1 AA / Dark-to-Light `@media print` typography.
- **v8.0+ (Institutional Team OS)** — detailed work items, audit findings, and acceptance metrics live in [TOP_TIER_ROADMAP.md](./TOP_TIER_ROADMAP.md):
  - Local-First sub-50ms sync engine (ElectricSQL / Zero) on Postgres WAL.
  - External MCP Server connectors (live market feeds, SEC Form 4/13F, Google Drive/Notion sync).
  - Multi-analyst workspaces with RBAC/RLS and inline IC memo commenting.
