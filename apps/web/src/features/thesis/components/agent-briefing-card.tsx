"use client";

import type { AgentBriefing, AgentPartialSynthesis } from "@kanon/core";
import { AgentThinking, cn, ReadinessRing } from "@kanon/ui";

type DebateTone = "pass" | "warn" | "coral" | "muted";

const DOT_TONE: Record<DebateTone, string> = {
  pass: "bg-status-pass",
  warn: "bg-status-warn",
  coral: "bg-accent-coral",
  muted: "bg-ink-muted",
};

function DebateDossierRow({
  roleLabel,
  tone,
  body,
}: {
  roleLabel: string;
  tone: DebateTone;
  body: string;
}) {
  return (
    <div className="px-5 py-4 sm:px-6">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-pill", DOT_TONE[tone])} />
        <span className="text-xs font-semibold tracking-[0.02em] text-ink-primary">
          {roleLabel}
        </span>
      </div>
      <p className="mt-2 text-sm leading-[1.75] text-ink-secondary">{body}</p>
    </div>
  );
}

function VerdictMonolith({ briefing }: { briefing: AgentBriefing }) {
  return (
    <section className="kanon-surface-specular rounded-panel border border-hairline bg-surface p-5 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <span className="text-xs font-medium text-ink-muted">投委会裁决</span>
        <div className="inline-flex items-center gap-2.5">
          <span className="font-mono text-2xl font-light tracking-[-0.04em] text-ink-primary tabular-nums">
            {briefing.convictionScore}
            <span className="ml-0.5 text-xs font-normal text-ink-muted">/100</span>
          </span>
          <ReadinessRing scorePct={briefing.convictionScore} size={28} strokeWidth={2.2} />
        </div>
      </div>
      <p className="mt-3 text-[16px] font-semibold leading-[1.55] tracking-[-0.015em] text-ink-primary">
        {briefing.verdict}
      </p>
      {briefing.fallbackReason ? (
        <div className="mt-3 border-t border-hairline pt-3 text-xs text-status-warn">
          {briefing.fallbackReason}
        </div>
      ) : null}
    </section>
  );
}

export function AgentBriefingCard({ briefing }: { briefing: AgentBriefing }) {
  return (
    <div className="space-y-4">
      <VerdictMonolith briefing={briefing} />
      <section className="divide-y divide-hairline overflow-hidden rounded-panel border border-hairline bg-surface">
        <DebateDossierRow roleLabel="基本面多头" tone="pass" body={briefing.bullSynthesis} />
        <DebateDossierRow roleLabel="法证空头" tone="warn" body={briefing.bearCritique} />
        {briefing.bearRebuttal ? (
          <DebateDossierRow roleLabel="反向质询" tone="coral" body={briefing.bearRebuttal} />
        ) : null}
        <DebateDossierRow roleLabel="财务法证" tone="muted" body={briefing.accountingCheck} />
      </section>
    </div>
  );
}

export function AgentStreamingCard({ partial }: { partial: AgentPartialSynthesis }) {
  return (
    <div className="divide-y divide-hairline overflow-hidden rounded-panel border border-hairline bg-surface">
      <div className="px-5 py-3.5 sm:px-6">
        <AgentThinking variant="wave" label="投委会辩论推演中" />
      </div>
      {partial.verdict ? (
        <div className="px-5 py-4 text-[15px] font-semibold leading-snug text-ink-primary sm:px-6">
          {partial.verdict}
        </div>
      ) : null}
      {partial.bullSynthesis ? (
        <DebateDossierRow roleLabel="基本面多头" tone="pass" body={partial.bullSynthesis} />
      ) : null}
      {partial.bearCritique ? (
        <DebateDossierRow roleLabel="法证空头" tone="warn" body={partial.bearCritique} />
      ) : null}
      {partial.bearRebuttal ? (
        <DebateDossierRow roleLabel="反向质询" tone="coral" body={partial.bearRebuttal} />
      ) : null}
      {partial.accountingCheck ? (
        <DebateDossierRow roleLabel="财务法证" tone="muted" body={partial.accountingCheck} />
      ) : null}
    </div>
  );
}
