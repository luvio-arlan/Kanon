"use client";

import {
  analyzeSecQuality,
  calculateTrueReverseDcf,
  calculateTsrDecomposition,
  type ReverseDcfResult,
  type SecAnnualFinancial,
  type ValuationScenarioSummary,
} from "@kanon/core";
import { Badge, Card, cn, RollingNumber } from "@kanon/ui";
import { useState } from "react";
import { HurdleLadderCard } from "./hurdle-ladder-card";

const HURDLE_OPTIONS = [12, 15, 20] as const;
const TERMINAL_MULTIPLES = [15, 20, 25, 30] as const;
const VERDICT_META = {
  underpriced: { label: "预期安全垫充足", variant: "pass" as const },
  fair: { label: "市场定价均衡", variant: "titanium" as const },
  demanding: { label: "市场隐含预期苛刻", variant: "warn" as const },
};

function pickNearestMultiple(target: number): number {
  return TERMINAL_MULTIPLES.reduce((prev, cur) =>
    Math.abs(cur - target) < Math.abs(prev - target) ? cur : prev,
  );
}

function PillGroup(props: {
  label: string;
  options: readonly number[];
  value: number;
  suffix: string;
  onSelect: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-ink-muted">{props.label}</span>
      <div className="flex items-center gap-1">
        {props.options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => props.onSelect(opt)}
            className={cn(
              "cursor-pointer rounded-pill border px-2.5 py-0.5 font-mono text-xs tabular-nums transition-colors",
              props.value === opt
                ? "border-strong bg-titanium font-semibold text-ink-primary"
                : "border-hairline bg-surface text-ink-secondary hover:border-strong",
            )}
          >
            {opt}
            {props.suffix}
          </button>
        ))}
      </div>
    </div>
  );
}

function ReverseDcfMetrics({ r }: { r: ReverseDcfResult }) {
  const gapTone = (r.expectationsGapPct ?? 0) >= 0 ? "text-status-pass" : "text-status-warn";
  return (
    <div className="grid grid-cols-3 gap-3 border-t border-hairline pt-3.5 font-mono text-xs tabular-nums">
      <div>
        <div className="font-sans text-ink-muted">现价隐含必须增速</div>
        <div className="mt-1 text-lg font-semibold text-accent-coral">
          <RollingNumber value={r.requiredCagrPct} suffix="%" decimals={1} />
        </div>
      </div>
      <div>
        <div className="font-sans text-ink-muted">历史 SEC 复合增速</div>
        <div className="mt-1 text-lg font-semibold text-ink-primary">
          {r.historicalCagrPct !== null ? `${r.historicalCagrPct.toFixed(1)}%` : "—"}
        </div>
      </div>
      <div>
        <div className="whitespace-nowrap font-sans text-ink-muted">预期差 (历史-隐含)</div>
        <div className={`mt-1 text-lg font-semibold ${gapTone}`}>
          {r.expectationsGapPct !== null
            ? `${r.expectationsGapPct > 0 ? "+" : ""}${r.expectationsGapPct.toFixed(1)}pct`
            : "—"}
        </div>
      </div>
    </div>
  );
}

function ReverseDcfCard(props: {
  currentPrice: number;
  horizonYears: number;
  trailingEps: number | null;
  historicalCagrPct: number | null;
  defaultMultiple: number;
}) {
  const [hurdle, setHurdle] = useState<number>(15);
  const [mult, setMult] = useState<number>(() => pickNearestMultiple(props.defaultMultiple));
  const baseMetric =
    props.trailingEps && props.trailingEps > 0 ? props.trailingEps : props.currentPrice / 22;
  const r = calculateTrueReverseDcf({
    currentPrice: props.currentPrice,
    baseMetricPerShare: baseMetric,
    horizonYears: Math.max(3, props.horizonYears),
    hurdleRatePct: hurdle,
    terminalMultiple: mult,
    historicalCagrPct: props.historicalCagrPct,
  });
  const badge = VERDICT_META[r.verdict];
  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink-primary">反向折现现金流（Reverse DCF）</h3>
        <Badge variant={badge.variant} className="shrink-0 whitespace-nowrap">
          {badge.label}
        </Badge>
      </div>
      <div className="space-y-2.5">
        <PillGroup
          label="目标年化折现率"
          options={HURDLE_OPTIONS}
          value={hurdle}
          suffix="%"
          onSelect={setHurdle}
        />
        <PillGroup
          label="终值合理倍数"
          options={TERMINAL_MULTIPLES}
          value={mult}
          suffix="×"
          onSelect={setMult}
        />
      </div>
      <ReverseDcfMetrics r={r} />
    </Card>
  );
}

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

function TsrBars(props: { fundamental: number; reRate: number; capital: number }) {
  return (
    <div className="space-y-3 border-t border-hairline pt-3.5">
      <TsrBarRow
        label="基本面盈利增长贡献（EPS CAGR）"
        value={props.fundamental}
        tone="bg-status-pass"
      />
      <TsrBarRow
        label="估值倍数重估贡献（PE Re-rating）"
        value={props.reRate}
        tone={props.reRate >= 0 ? "bg-ink-primary" : "bg-status-warn"}
      />
      <TsrBarRow label="资本配置回报（回购与分红）" value={props.capital} tone="bg-accent-coral" />
    </div>
  );
}

function TsrDecompositionCard(props: {
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
      <PillGroup
        label="年化回购 / 股息净收益"
        options={[0, 1, 2, 3]}
        value={capitalYield}
        suffix="%"
        onSelect={setCapitalYield}
      />
      <TsrBars
        fundamental={tsr.fundamentalGrowthPct}
        reRate={tsr.multipleReRatePct}
        capital={tsr.capitalReturnPct}
      />
    </Card>
  );
}

export function ValuationReverseDcfPanel({
  summary,
  annuals,
  trailingEps,
}: {
  summary: ValuationScenarioSummary;
  annuals: readonly SecAnnualFinancial[];
  trailingEps: number | null;
}) {
  const quality = analyzeSecQuality(annuals);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ReverseDcfCard
          currentPrice={summary.currentPrice}
          horizonYears={summary.horizonYears}
          trailingEps={trailingEps}
          historicalCagrPct={quality?.revenueCagrPct ?? null}
          defaultMultiple={summary.base.peMultiple}
        />
        <TsrDecompositionCard summary={summary} trailingEps={trailingEps} />
      </div>
      <HurdleLadderCard summary={summary} />
    </div>
  );
}
