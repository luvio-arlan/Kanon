"use client";

import type { AgentBriefing, AgentPartialSynthesis } from "@kanon/core";
import { AgentThinking, Badge, ProgressBar, ReadinessRing } from "@kanon/ui";

function DebateRoleCard({
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
    <div className="rounded-control border border-hairline bg-surface px-3.5 py-3 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <Badge variant={tone}>{roleLabel}</Badge>
        <span className="font-mono text-xs text-ink-muted">{tag}</span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-ink-secondary">{body}</p>
    </div>
  );
}

function BriefingHeader({ briefing }: { briefing: AgentBriefing }) {
  return (
    <div className="rounded-control border border-hairline bg-surface p-3.5 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-ink-muted">
            <span>投委会裁决</span>
            <Badge variant={briefing.engine === "vercel-ai-sdk" ? "pass" : "default"}>
              {briefing.engine === "vercel-ai-sdk" ? "BYOK 模型" : "确定性引擎"}
            </Badge>
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
      <ProgressBar
        value={briefing.convictionScore}
        max={100}
        tone={briefing.convictionScore >= 75 ? "pass" : "accent"}
        size="sm"
        className="mt-3"
      />
    </div>
  );
}

export function AgentBriefingCard({ briefing }: { briefing: AgentBriefing }) {
  return (
    <div className="space-y-2.5 rounded-card border border-hairline bg-muted/55 p-3 shadow-card">
      <BriefingHeader briefing={briefing} />
      {briefing.fallbackReason ? (
        <div className="rounded-control bg-status-warn-soft px-3 py-1.5 text-xs text-status-warn">
          {briefing.fallbackReason}
        </div>
      ) : null}
      <div className="space-y-2">
        <DebateRoleCard
          roleLabel="基本面多头"
          tag="LONG · 预期差"
          tone="pass"
          body={briefing.bullSynthesis}
        />
        <DebateRoleCard
          roleLabel="法证空头"
          tag="BEAR · 下行风险"
          tone="warn"
          body={briefing.bearCritique}
        />
        {briefing.bearRebuttal ? (
          <DebateRoleCard
            roleLabel="空头二次质询"
            tag="CROSS-EXAM · 证伪反演"
            tone="warn"
            body={briefing.bearRebuttal}
          />
        ) : null}
        <DebateRoleCard
          roleLabel="财务法证官"
          tag="FORENSICS · 现金流"
          tone="titanium"
          body={briefing.accountingCheck}
        />
      </div>
    </div>
  );
}

export function AgentStreamingCard({ partial }: { partial: AgentPartialSynthesis }) {
  return (
    <div className="space-y-2.5 rounded-card border border-hairline bg-muted/55 p-3 shadow-card">
      <div className="flex items-center justify-between gap-2 px-1">
        <AgentThinking variant="wave" label="投委会四角色正在流式辩论..." />
        <Badge variant="titanium">LIVE</Badge>
      </div>
      {partial.verdict ? (
        <div className="rounded-control border border-hairline bg-surface p-3 text-sm font-semibold text-ink-primary">
          {partial.verdict}
        </div>
      ) : null}
      {partial.bullSynthesis ? (
        <DebateRoleCard
          roleLabel="基本面多头"
          tag="LONG"
          tone="pass"
          body={partial.bullSynthesis}
        />
      ) : null}
      {partial.bearCritique ? (
        <DebateRoleCard roleLabel="法证空头" tag="BEAR" tone="warn" body={partial.bearCritique} />
      ) : null}
      {partial.bearRebuttal ? (
        <DebateRoleCard
          roleLabel="空头二次质询"
          tag="CROSS-EXAM"
          tone="warn"
          body={partial.bearRebuttal}
        />
      ) : null}
      {partial.accountingCheck ? (
        <DebateRoleCard
          roleLabel="财务法证官"
          tag="FORENSICS"
          tone="titanium"
          body={partial.accountingCheck}
        />
      ) : null}
    </div>
  );
}
