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
    <div className="rounded-control border border-hairline bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-semibold text-ink-primary">
          0{idx + 1}. {ch.question}
        </div>
        <Badge variant={variant}>{label}</Badge>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
        证伪路径：{ch.falsificationPath}
      </p>
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="font-mono text-xs text-ink-muted">锚点：{ch.sourceAnchor}</div>
        {onPromoteRule ? (
          <button
            type="button"
            onClick={() => onPromoteRule(ch.falsificationPath)}
            className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-accent-coral transition-opacity hover:opacity-80"
          >
            <span>带入 Step 5 离场条件</span>
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
    <Card tone="titanium" className="space-y-4 p-6">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-ink-primary">反向质询 · 空头视角审视</h3>
        <Badge variant="fail">Counter-Thesis</Badge>
      </div>
      <div className="space-y-3">
        {report.challenges.map((ch, idx) => (
          <RedTeamChallengeRow key={ch.id} ch={ch} idx={idx} onPromoteRule={onPromoteRule} />
        ))}
      </div>
    </Card>
  );
}
