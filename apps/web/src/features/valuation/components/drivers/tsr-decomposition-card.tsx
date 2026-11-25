"use client";

import { calculateTsrDecomposition, type ValuationScenarioSummary } from "@kanon/core";
import { Badge, Card, cn } from "@kanon/ui";
import { useState } from "react";

const RETURN_OPTIONS = [0, 1, 2, 3] as const;

function TsrBarRow({ label, value, tone }: { label: string; value: number; tone: string }) {
  const width = Math.min(100, Math.max(4, Math.abs(value) * 2.5));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-ink-secondary">{label}</span>
        <span className="font-mono font-semibold text-ink-primary tabular-nums">
          {value > 0 ? "+" : ""}
          {value.toFixed(1)}%
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-pill bg-muted">
        <div
          className={cn("h-full rounded-pill transition-all duration-200", tone)}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

function CapitalReturnPills({ value, onSelect }: { value: number; onSelect: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-ink-muted">年化回购 / 股息净收益</span>
      <div className="flex items-center gap-1">
        {RETURN_OPTIONS.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onSelect(opt)}
            className={cn(
              "cursor-pointer rounded-pill border px-2.5 py-0.5 font-mono text-xs tabular-nums transition-colors",
              value === opt
                ? "border-strong bg-titanium font-semibold text-ink-primary"
                : "border-hairline bg-surface text-ink-secondary hover:border-strong",
            )}
          >
            {opt}%
          </button>
        ))}
      </div>
    </div>
  );
}

export function TsrDecompositionCard(props: {
  summary: ValuationScenarioSummary;
  trailingEps: number | null;
}) {
  const [capitalYield, setCapitalYield] = useState(1);
  const tsr = calculateTsrDecomposition({
    currentPrice: props.summary.currentPrice,
    trailingEps: props.trailingEps,
    forwardEps: props.summary.base.eps,
    forwardPe: props.summary.base.peMultiple,
    horizonYears: props.summary.horizonYears,
    annualCapitalReturnPct: capitalYield,
  });
  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink-primary">TSR 股东回报三因子归因（中性）</h3>
        <Badge variant="titanium" className="shrink-0 whitespace-nowrap font-mono tabular-nums">
          合计 {tsr.totalAnnualizedTsrPct.toFixed(1)}%/yr
        </Badge>
      </div>
      <CapitalReturnPills value={capitalYield} onSelect={setCapitalYield} />
      <div className="space-y-3 border-t border-hairline pt-3.5">
        <TsrBarRow
          label="基本面盈利增长贡献（EPS CAGR）"
          value={tsr.fundamentalGrowthPct}
          tone="bg-status-pass"
        />
        <TsrBarRow
          label="估值倍数重估贡献（PE Re-rating）"
          value={tsr.multipleReRatePct}
          tone={tsr.multipleReRatePct >= 0 ? "bg-ink-primary" : "bg-status-warn"}
        />
        <TsrBarRow
          label="资本配置回报（回购与分红）"
          value={tsr.capitalReturnPct}
          tone="bg-accent-coral"
        />
      </div>
    </Card>
  );
}
