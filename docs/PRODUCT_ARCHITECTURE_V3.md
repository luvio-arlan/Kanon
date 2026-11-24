# KANON v3.0–v5.0 Product Critique & Technical Architecture Blueprint

> Companion architectural strategy document to [docs/PRD.md](./PRD.md).
> Captures the 2025–2026 institutional buy-side benchmarks, Swiss Editorial Design Scale v3, sub-50ms performance evolution, and MCP-ready Agent-Native Research OS architecture.

## 1. Benchmark Foundations

- **Institutional Equity Research UX (AlphaSense, Hebbia, Rogo, Koyfin, Fiscal.ai, Quartr)**: Trust & auditability beat raw generation speed. Every AI assertion must carry deterministic tool provenance, XBRL/filing anchors, and Human-in-the-Loop (HITL) approval before mutating the investment thesis.
- **Buy-Side Methodology (Variant Perception, Key Debate, Unit Economics, Pre-Mortem)**: Great research isolates (1) what consensus prices in, (2) our concrete variant perception, (3) the 1–2 binary key debates over 18 months, and (4) an explicit pre-mortem narrative before risking capital.
- **Web Craft & Motion Physics (Linear, Stripe, Emil Kowalski, Rauno Freiberg)**:
  - Sub-300ms transitions; `0ms` zero-friction for high-frequency keyboard shortcuts.
  - Tactile button press `scale(0.97)` at `160ms ease-out`; overlays enter from `scale(0.95)` origin-aware (never `scale(0)`).
  - Subtle `2px` optical blur bridge on step transitions to eliminate harsh content flashes.
- **Agentic & Local-First Systems**:
  - Hybrid separation: deterministic math/XBRL in Postgres + `@kanon/core/math`, narrative synthesis via structured tool-calling (`MCP-ready` tool registry) with strict `maxSteps` caps and SSE live reasoning traces.
  - Evolution path from optimized RSC + lightweight summary projections + optimistic UI (v3.0) toward ElectricSQL/Zero delta sync (v5.0).

## 2. Roadmap Execution Phases

- **v3.0 (Implemented Now)**:
  - Buy-Side Variant Perception / Key Debate / Pre-Mortem scaffolding in Step 1 + DB schema + exports.
  - Formalized Modular Type Scale, 4-tier Elevation Scale, and 4-tier Motion Physics Scale in `@kanon/ui`.
  - `O(N+M)` query indexing, lightweight `listThesisSummaries` projection for canvas switcher, streaming `loading.tsx` skeletons, and `⌘S` / `⌘J` shortcuts.
  - MCP-ready `packages/ai/src/agent/` multi-step research orchestrator + `POST /api/ai/agent` SSE stream + `AgentResearchSheet` (`⌘J`) with live tool traces and 1-click HITL proposal adoption.
- **v4.0 (Next Horizon)**:
  - `pgvector` + BM25 Hybrid RAG over full 10-K/10-Q/Earnings transcripts with click-to-highlight original source viewer.
  - Automated Quarterly Earnings Diff & Hypothesis Drift Detector.
  - Multi-Agent Investment Committee Debate (Fundamental / Forensic Accounting / Short Bear / PM Synthesizer).
- **v5.0 (Institutional Team OS)**:
  - Local-First sub-50ms sync engine (ElectricSQL / Zero) on Postgres WAL.
  - External MCP Server connectors (live market feeds, SEC Form 4/13F, Google Drive/Notion sync).
  - Multi-analyst workspaces with RBAC/RLS and inline IC memo commenting.
