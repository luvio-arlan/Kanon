"use client";

import type { RedTeamReport } from "@kanon/core";
import { Badge, Card } from "@kanon/ui";
import { IconArrowRight } from "@tabler/icons-react";

function RedTeamChallengeRow({
  ch,
  idx,
  onPromoteRule,
}: {
  ch: RedTeamReport["challenges"][number];
  idx: number;
  onPromoteRule?: (rule: string) => void;
}) {
  const variant = ch.severity === "critical" ? "fail" : ch.severity === "high" ? "warn" : "default";
  const label =
    ch.severity === "critical" ? "核心风险" : ch.severity === "high" ? "高关注" : "常规关注";
  return (
    <div className="px-6 py-5 sm:px-7">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-semibold text-ink-primary">
          <span className="mr-2 font-mono text-xs font-normal text-ink-muted tabular-nums">
            0{idx + 1}
          </span>
          {ch.question}
        </div>
        <Badge variant={variant} className="shrink-0">
          {label}
        </Badge>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{ch.falsificationPath}</p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="font-mono text-xs text-ink-muted">{ch.sourceAnchor}</div>
        {onPromoteRule ? (
          <button
            type="button"
            onClick={() => onPromoteRule(ch.falsificationPath)}
            className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-accent-coral transition-opacity hover:opacity-80"
          >
            <span>转为离场条件</span>
            <IconArrowRight size={13} stroke={1.5} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function RedTeamResultCard({
  report,
  onPromoteRule,
}: {
  report: RedTeamReport;
  onPromoteRule?: (rule: string) => void;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-hairline px-6 py-4 sm:px-7">
        <h3 className="text-[15px] font-semibold tracking-[-0.015em] text-ink-primary">反向质询</h3>
      </div>
      <div className="divide-y divide-hairline">
        {report.challenges.map((ch, idx) => (
          <RedTeamChallengeRow key={ch.id} ch={ch} idx={idx} onPromoteRule={onPromoteRule} />
        ))}
      </div>
    </Card>
  );
}
