"use client";

import {
  calculateTopDownEps,
  type TopDownEpsResult,
  type ValuationDriverInputs,
} from "@kanon/core";
import { Button, Card, RollingNumber } from "@kanon/ui";
import { IconArrowDownRight, IconCalculator } from "@tabler/icons-react";
import { DriverNumInput } from "../ev-owner-fcf-card";

export interface TopDownValues {
  revB: number;
  revCagr: number;
  netMargin: number;
  sharesM: number;
  shareChange: number;
}

function TopDownFooter({
  res,
  onApply,
}: {
  res: TopDownEpsResult;
  onApply: (eps: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-3.5">
      <div className="font-mono text-xs text-ink-secondary tabular-nums">
        <span>
          远期营收 <strong className="text-ink-primary">${res.projectedRevenueB}B</strong> · 净利{" "}
          <strong className="text-ink-primary">${res.projectedNetIncomeB}B</strong> · 推导 EPS{" "}
        </span>
        <RollingNumber
          value={res.impliedEps}
          prefix="$"
          decimals={2}
          className="text-sm font-semibold text-accent-coral"
        />
      </div>
      <Button
        variant="primary"
        size="sm"
        disabled={res.impliedEps <= 0}
        onClick={() => onApply(res.impliedEps)}
      >
        <IconArrowDownRight size={14} stroke={1.5} />
        <span>回填至中性 EPS</span>
      </Button>
    </div>
  );
}

const TOP_DOWN_FIELDS: ReadonlyArray<{
  valKey: keyof TopDownValues;
  patchKey: keyof ValuationDriverInputs;
  label: string;
  step?: number;
}> = [
  { valKey: "revB", patchKey: "currentRevenueB", label: "基准年营收 ($B)" },
  { valKey: "revCagr", patchKey: "revenueCagrPct", label: "年化营收增速 (%)", step: 1 },
  { valKey: "netMargin", patchKey: "targetNetMarginPct", label: "目标净利率 (%)" },
  { valKey: "sharesM", patchKey: "dilutedSharesM", label: "稀释股本 (百万股)", step: 10 },
  { valKey: "shareChange", patchKey: "annualShareChangePct", label: "年化股本变动 (%)" },
];

export function TopDownEpsCard({
  horizonYears,
  values,
  onPatch,
  onApplyBaseEps,
}: {
  horizonYears: number;
  values: TopDownValues;
  onPatch: (next: Partial<ValuationDriverInputs>) => void;
  onApplyBaseEps: (eps: number) => void;
}) {
  const res = calculateTopDownEps({
    currentRevenueB: values.revB,
    revenueCagrPct: values.revCagr,
    targetNetMarginPct: values.netMargin,
    currentSharesM: values.sharesM,
    annualShareChangePct: values.shareChange,
    horizonYears,
  });
  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center gap-2">
        <IconCalculator size={16} stroke={1.5} className="shrink-0 text-ink-muted" />
        <h3 className="truncate text-sm font-semibold text-ink-primary">
          自上而下 EPS 拆解（{horizonYears} 年）
        </h3>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {TOP_DOWN_FIELDS.map((f) => (
          <DriverNumInput
            key={f.patchKey}
            label={f.label}
            value={values[f.valKey]}
            step={f.step}
            onChange={(v) => onPatch({ [f.patchKey]: v })}
          />
        ))}
      </div>
      <TopDownFooter res={res} onApply={onApplyBaseEps} />
    </Card>
  );
}
