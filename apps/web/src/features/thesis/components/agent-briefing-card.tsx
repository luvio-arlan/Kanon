"use client";

import type { AgentBriefing } from "@kanon/core";
import { Badge, ReadinessRing } from "@kanon/ui";

function DebateRoleRow({
  roleLabel,
  tag,
  tone,
  body,
}: {
  roleLabel: string;
  tag: string;
  tone: "pass" | "warn" | "titanium";
  body: string;
}) {
  return (
    <div className="space-y-1 py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-center gap-2">
        <Badge variant={tone}>{roleLabel}</Badge>
        <span className="font-mono text-xs text-ink-muted">{tag}</span>
      </div>
      <p className="text-xs leading-relaxed text-ink-secondary">{body}</p>
    </div>
  );
}

function BriefingHeader({ briefing }: { briefing: AgentBriefing }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-ink-muted">
          <span>投资总监裁决 · IC Debate</span>
          <Badge variant={briefing.engine === "vercel-ai-sdk" ? "pass" : "default"}>
            {briefing.engine === "vercel-ai-sdk" ? "BYOK 模型综合" : "确定性引擎"}
          </Badge>
          <Badge variant="titanium">已持久化留痕</Badge>
        </div>
        <div className="mt-1.5 text-sm font-semibold leading-snug text-ink-primary">
          {briefing.verdict}
        </div>
      </div>
      <ReadinessRing
        scorePct={briefing.convictionScore}
        size={36}
        label={`${briefing.convictionScore}`}
      />
    </div>
  );
}

export function AgentBriefingCard({ briefing }: { briefing: AgentBriefing }) {
  return (
    <div className="space-y-3 rounded-card border border-hairline bg-titanium-subtle p-4 shadow-card">
      <BriefingHeader briefing={briefing} />
      {briefing.fallbackReason ? (
        <div className="rounded-control bg-status-warn-soft px-3 py-1.5 text-xs text-status-warn">
          {briefing.fallbackReason}
        </div>
      ) : null}
      <div className="divide-y divide-hairline border-t border-hairline pt-3">
        <DebateRoleRow
          roleLabel="基本面多头"
          tag="LONG · 预期差与催化剂"
          tone="pass"
          body={briefing.bullSynthesis}
        />
        <DebateRoleRow
          roleLabel="法证空头"
          tag="BEAR · 反演与下行红线"
          tone="warn"
          body={briefing.bearCritique}
        />
        <DebateRoleRow
          roleLabel="财务法证官"
          tag="FORENSICS · 盈利含金量"
          tone="titanium"
          body={briefing.accountingCheck}
        />
      </div>
    </div>
  );
}
