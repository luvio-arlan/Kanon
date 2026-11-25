"use client";

import {
  analyzeSecForensics,
  analyzeSecQuality,
  calculateImpliedExpectations,
  calculateTrueReverseDcf,
  type ReverseDcfResult,
  type SecAnnualFinancial,
  type ValuationScenarioSummary,
} from "@kanon/core";
import { Badge, Card, cn, RollingNumber } from "@kanon/ui";
import { useState } from "react";
import { ExpectationsContrastCard } from "./drivers/expectations-contrast-card";
import { TsrDecompositionCard } from "./drivers/tsr-decomposition-card";
import { HurdleLadderCard } from "./hurdle-ladder-card";

const HURDLE_OPTIONS = [12, 15, 20] as const;
const TERMINAL_MULTIPLES = [15, 20, 25, 30] as const;
const RONIC_OPTIONS = [0, 20, 30, 50] as const;
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
    <div className="space-y-3">
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
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-2.5 font-mono text-xs text-ink-muted tabular-nums">
        <span>
          再投资率 (g/RONIC):{" "}
          <strong className="text-ink-primary">
            {r.impliedReinvestmentRatePct !== null ? `${r.impliedReinvestmentRatePct}%` : "不限"}
          </strong>
        </span>
        <span>
          所需优势期 (CAP): <strong className="text-ink-primary">{r.impliedCapYears} 年</strong>
        </span>
      </div>
    </div>
  );
}

function ReverseDcfCard(props: {
  result: ReverseDcfResult;
  hurdle: number;
  mult: number;
  ronic: number;
  onHurdle: (v: number) => void;
  onMult: (v: number) => void;
  onRonic: (v: number) => void;
}) {
  const badge = VERDICT_META[props.result.verdict];
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
          value={props.hurdle}
          suffix="%"
          onSelect={props.onHurdle}
        />
        <PillGroup
          label="终值合理倍数"
          options={TERMINAL_MULTIPLES}
          value={props.mult}
          suffix="×"
          onSelect={props.onMult}
        />
        <PillGroup
          label="增量资本回报 RONIC"
          options={RONIC_OPTIONS}
          value={props.ronic}
          suffix="%"
          onSelect={props.onRonic}
        />
      </div>
      <ReverseDcfMetrics r={props.result} />
    </Card>
  );
}

function resolveDefaultRonic(annuals: readonly SecAnnualFinancial[]): number {
  const roic = analyzeSecForensics(annuals)?.roicPct;
  return roic && roic >= 40 ? 50 : 30;
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
  const [hurdle, setHurdle] = useState<number>(15);
  const [mult, setMult] = useState<number>(() => pickNearestMultiple(summary.base.peMultiple));
  const [ronic, setRonic] = useState<number>(() => resolveDefaultRonic(annuals));
  const quality = analyzeSecQuality(annuals);
  const exp = calculateImpliedExpectations({ summary, trailingEps });
  const baseEps = trailingEps && trailingEps > 0 ? trailingEps : summary.currentPrice / 22;
  const implied = calculateTrueReverseDcf({
    currentPrice: summary.currentPrice,
    baseMetricPerShare: baseEps,
    horizonYears: Math.max(2, summary.horizonYears),
    hurdleRatePct: hurdle,
    terminalMultiple: mult,
    historicalCagrPct: quality?.revenueCagrPct ?? null,
    ronicPct: ronic > 0 ? ronic : null,
  });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ReverseDcfCard
          result={implied}
          hurdle={hurdle}
          mult={mult}
          ronic={ronic}
          onHurdle={setHurdle}
          onMult={setMult}
          onRonic={setRonic}
        />
        <TsrDecompositionCard summary={summary} trailingEps={trailingEps} />
      </div>
      <ExpectationsContrastCard
        historicalCagrPct={quality?.revenueCagrPct ?? null}
        impliedCagrPct={implied.requiredCagrPct}
        baseCagrPct={exp.baseEpsCagrPct ?? summary.base.cagrPct}
        isEpsBased={exp.baseEpsCagrPct !== null}
      />
      <HurdleLadderCard summary={summary} />
    </div>
  );
}
