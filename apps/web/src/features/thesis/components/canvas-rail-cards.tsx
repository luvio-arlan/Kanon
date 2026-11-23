"use client";

import type { ThesisDetail } from "@kanon/core";
import { cn } from "@kanon/ui";

export function ReadinessMeterCard({
  completedCount,
  scorePct,
}: {
  completedCount: number;
  scorePct: number;
}) {
  return (
    <div className="rounded-card border border-hairline bg-surface px-4 py-3.5 shadow-card">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-ink-secondary">研究成熟度</span>
        <span className="font-mono font-semibold text-ink-primary tabular-nums">
          {completedCount}/5 · {scorePct}%
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-pill bg-muted">
        <div
          className={cn(
            "h-full rounded-pill transition-all duration-300",
            scorePct === 100 ? "bg-status-pass" : "bg-accent-coral",
          )}
          style={{ width: `${scorePct}%` }}
        />
      </div>
    </div>
  );
}

export function RailOddsCard({ thesis }: { thesis: ThesisDetail }) {
  const ratio =
    thesis.valuation.riskRewardRatio !== null
      ? `${thesis.valuation.riskRewardRatio.toFixed(2)}×`
      : "∞";

  return (
    <div className="rounded-card border border-hairline bg-titanium-subtle p-4 shadow-card">
      <div className="text-xs text-ink-muted">实时赔率锚点</div>
      <div className="mt-1.5 flex items-baseline justify-between font-mono tabular-nums">
        <span className="text-2xl font-semibold text-ink-primary">
          ${thesis.valuation.base.targetPrice.toFixed(1)}
        </span>
        <span className="text-xs font-medium text-status-pass">赔率 {ratio}</span>
      </div>
      <div className="mt-1 text-xs text-ink-secondary tabular-nums">
        现价 ${thesis.currentPrice.toFixed(2)} · 年化 {thesis.valuation.base.cagrPct.toFixed(1)}%
      </div>
    </div>
  );
}
