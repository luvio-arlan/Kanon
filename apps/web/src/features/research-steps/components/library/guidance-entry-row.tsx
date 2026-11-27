"use client";

import type { GuidanceCommitment, GuidanceMetric } from "@kanon/core";
import { Badge, Button } from "@kanon/ui";
import { IconCheck, IconX } from "@tabler/icons-react";

const METRIC_LABELS: Record<GuidanceMetric, string> = {
  revenue: "营收",
  gross_margin: "毛利率",
  operating_margin: "营业利润率",
  diluted_eps: "摊薄 EPS",
  capex: "资本开支",
  operating_expenses: "经营费用",
  free_cash_flow: "自由现金流",
  custom: "自定义",
};

function formatGuidanceVal(value: number | null, unit: GuidanceCommitment["unit"]): string {
  if (value === null) return "—";
  if (unit === "pct") return `${value.toFixed(1)}%`;
  if (unit === "usd_per_share") return `$${value.toFixed(2)}`;
  if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  return `$${value.toFixed(2)}`;
}

function formatRange(item: GuidanceCommitment): string {
  if (item.low !== null && item.high !== null && item.low !== item.high) {
    return `${formatGuidanceVal(item.low, item.unit)}–${formatGuidanceVal(item.high, item.unit)}`;
  }
  return formatGuidanceVal(item.low ?? item.high, item.unit);
}

function renderOutcomeBadge(item: GuidanceCommitment) {
  if (item.outcome === "beat") return <Badge variant="pass">超预期</Badge>;
  if (item.outcome === "in_line") return <Badge variant="titanium">兑现</Badge>;
  if (item.outcome === "miss") return <Badge variant="fail">失约</Badge>;
  if (item.outcome === "unresolvable") return <Badge variant="default">需人工核验</Badge>;
  return <Badge variant="default">待验证</Badge>;
}

function DraftActionButtons(p: {
  item: GuidanceCommitment;
  busy: boolean;
  onConfirm?: (item: GuidanceCommitment) => void;
  onWithdraw?: (item: GuidanceCommitment) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {p.onConfirm ? (
        <Button variant="primary" size="xs" disabled={p.busy} onClick={() => p.onConfirm?.(p.item)}>
          <IconCheck size={12} stroke={1.5} />
          <span>确认</span>
        </Button>
      ) : null}
      {p.onWithdraw ? (
        <Button variant="ghost" size="xs" disabled={p.busy} onClick={() => p.onWithdraw?.(p.item)}>
          <IconX size={12} stroke={1.5} />
        </Button>
      ) : null}
    </div>
  );
}

export function GuidanceEntryRow({
  item,
  busy,
  onConfirm,
  onWithdraw,
}: {
  item: GuidanceCommitment;
  busy: boolean;
  onConfirm?: (item: GuidanceCommitment) => void;
  onWithdraw?: (item: GuidanceCommitment) => void;
}) {
  const isDraft = item.status === "draft_ai" || item.status === "draft_legacy";
  const periodText =
    item.targetFiscalYear && item.targetFiscalPeriod
      ? `FY${String(item.targetFiscalYear).slice(-2)} ${item.targetFiscalPeriod}`
      : "待补期间";
  const actualText =
    item.actualValue !== null
      ? `→ 实际 ${formatGuidanceVal(item.actualValue, item.unit)}${item.actualRestated ? "（后经重述）" : ""}`
      : null;

  return (
    <div className="flex flex-wrap items-start justify-between gap-2 px-6 py-3 sm:px-7">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-ink-muted">{periodText}</span>
          <span className="text-xs font-medium text-ink-primary">
            {item.customLabel || METRIC_LABELS[item.metric]}
          </span>
          <span className="font-mono text-xs text-ink-primary tabular-nums">
            {formatRange(item)}
          </span>
          {actualText ? (
            <span className="font-mono text-xs text-ink-secondary tabular-nums">{actualText}</span>
          ) : null}
          {isDraft ? <Badge variant="warn">待确认</Badge> : renderOutcomeBadge(item)}
        </div>
        <p className="line-clamp-2 text-xs text-ink-muted">“{item.quote}”</p>
      </div>
      {isDraft ? (
        <DraftActionButtons item={item} busy={busy} onConfirm={onConfirm} onWithdraw={onWithdraw} />
      ) : null}
    </div>
  );
}
