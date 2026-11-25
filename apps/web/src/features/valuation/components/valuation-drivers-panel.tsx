"use client";

import { calculateTopDownEps, type SecAnnualFinancial, type TopDownEpsResult } from "@kanon/core";
import { Button, Card, RollingNumber } from "@kanon/ui";
import { IconArrowDownRight, IconCalculator } from "@tabler/icons-react";
import { useState } from "react";
import { DriverNumInput, EvOwnerFcfCard } from "./ev-owner-fcf-card";

interface DriversPanelProps {
  currentPrice: number;
  horizonYears: number;
  basePe: number;
  latestAnnual: SecAnnualFinancial | null;
  onApplyBaseEps: (eps: number) => void;
}

function deriveDefaults(latest: SecAnnualFinancial | null, price: number) {
  const revB = latest?.revenue ? Number((latest.revenue / 1e9).toFixed(1)) : 25;
  const marginPct =
    latest?.revenue && latest.netIncome
      ? Math.max(5, Math.min(60, Number(((latest.netIncome / latest.revenue) * 100).toFixed(1))))
      : 22;
  const sharesM = latest?.dilutedShares ? Math.round(latest.dilutedShares / 1e6) : 1000;
  const cashB = latest?.cashAndEquiv ? Number((latest.cashAndEquiv / 1e9).toFixed(1)) : 8;
  const debtB = latest?.totalDebt ? Number((latest.totalDebt / 1e9).toFixed(1)) : 4;
  const rawFcf = latest?.freeCashFlow ? latest.freeCashFlow - Math.abs(latest.sbc ?? 0) : null;
  const fallbackFcf = Number(((price * sharesM) / 22_000).toFixed(1));
  const baseFcfB = rawFcf && rawFcf > 0 ? Number(((rawFcf / 1e9) * 1.4).toFixed(1)) : fallbackFcf;
  return { revB, marginPct, sharesM, cashB, debtB, baseFcfB: Math.max(0.5, baseFcfB) };
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

interface TopDownDraft {
  revB: number;
  revCagr: number;
  netMargin: number;
  sharesM: number;
  shareChange: number;
}

function TopDownInputsGrid({
  d,
  patch,
}: {
  d: TopDownDraft;
  patch: (p: Partial<TopDownDraft>) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <DriverNumInput label="基准年营收 ($B)" value={d.revB} onChange={(revB) => patch({ revB })} />
      <DriverNumInput
        label="年化营收增速 (%)"
        value={d.revCagr}
        step={1}
        onChange={(revCagr) => patch({ revCagr })}
      />
      <DriverNumInput
        label="目标净利率 (%)"
        value={d.netMargin}
        onChange={(netMargin) => patch({ netMargin })}
      />
      <DriverNumInput
        label="稀释股本 (百万股)"
        value={d.sharesM}
        step={10}
        onChange={(sharesM) => patch({ sharesM })}
      />
      <DriverNumInput
        label="年化股本变动 (%)"
        value={d.shareChange}
        onChange={(shareChange) => patch({ shareChange })}
      />
    </div>
  );
}

function TopDownEpsCard({
  horizonYears,
  defaults,
  onApplyBaseEps,
}: {
  horizonYears: number;
  defaults: ReturnType<typeof deriveDefaults>;
  onApplyBaseEps: (eps: number) => void;
}) {
  const [d, setD] = useState<TopDownDraft>({
    revB: defaults.revB,
    revCagr: 18,
    netMargin: defaults.marginPct,
    sharesM: defaults.sharesM,
    shareChange: -1,
  });
  const res = calculateTopDownEps({
    currentRevenueB: d.revB,
    revenueCagrPct: d.revCagr,
    targetNetMarginPct: d.netMargin,
    currentSharesM: d.sharesM,
    annualShareChangePct: d.shareChange,
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
      <TopDownInputsGrid d={d} patch={(p) => setD((prev) => ({ ...prev, ...p }))} />
      <TopDownFooter res={res} onApply={onApplyBaseEps} />
    </Card>
  );
}

export function ValuationDriversPanel(props: DriversPanelProps) {
  const defaults = deriveDefaults(props.latestAnnual, props.currentPrice);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <TopDownEpsCard
        horizonYears={props.horizonYears}
        defaults={defaults}
        onApplyBaseEps={props.onApplyBaseEps}
      />
      <EvOwnerFcfCard
        currentPrice={props.currentPrice}
        horizonYears={props.horizonYears}
        sharesM={defaults.sharesM}
        initialFcfB={defaults.baseFcfB}
        initialCashB={defaults.cashB}
        initialDebtB={defaults.debtB}
      />
    </div>
  );
}
