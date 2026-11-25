"use client";

import {
  calculateTopDownEps,
  type SecAnnualFinancial,
  type TopDownEpsResult,
  type ValuationDriverInputs,
} from "@kanon/core";
import { Button, Card, RollingNumber } from "@kanon/ui";
import { IconArrowDownRight, IconCalculator } from "@tabler/icons-react";
import { DriverNumInput, EvOwnerFcfCard } from "./ev-owner-fcf-card";

interface DriversPanelProps {
  currentPrice: number;
  horizonYears: number;
  latestAnnual: SecAnnualFinancial | null;
  driverInputs: ValuationDriverInputs;
  onPatchDrivers: (next: Partial<ValuationDriverInputs>) => void;
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

interface TopDownValues {
  revB: number;
  revCagr: number;
  netMargin: number;
  sharesM: number;
  shareChange: number;
}

function TopDownInputsGrid({
  d,
  onPatch,
}: {
  d: TopDownValues;
  onPatch: (p: Partial<ValuationDriverInputs>) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <DriverNumInput
        label="基准年营收 ($B)"
        value={d.revB}
        onChange={(currentRevenueB) => onPatch({ currentRevenueB })}
      />
      <DriverNumInput
        label="年化营收增速 (%)"
        value={d.revCagr}
        step={1}
        onChange={(revenueCagrPct) => onPatch({ revenueCagrPct })}
      />
      <DriverNumInput
        label="目标净利率 (%)"
        value={d.netMargin}
        onChange={(targetNetMarginPct) => onPatch({ targetNetMarginPct })}
      />
      <DriverNumInput
        label="稀释股本 (百万股)"
        value={d.sharesM}
        step={10}
        onChange={(dilutedSharesM) => onPatch({ dilutedSharesM })}
      />
      <DriverNumInput
        label="年化股本变动 (%)"
        value={d.shareChange}
        onChange={(annualShareChangePct) => onPatch({ annualShareChangePct })}
      />
    </div>
  );
}

function TopDownEpsCard({
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
      <TopDownInputsGrid d={values} onPatch={onPatch} />
      <TopDownFooter res={res} onApply={onApplyBaseEps} />
    </Card>
  );
}

export function ValuationDriversPanel(props: DriversPanelProps) {
  const defaults = deriveDefaults(props.latestAnnual, props.currentPrice);
  const dr = props.driverInputs;
  const topDownValues: TopDownValues = {
    revB: dr.currentRevenueB ?? defaults.revB,
    revCagr: dr.revenueCagrPct ?? 18,
    netMargin: dr.targetNetMarginPct ?? defaults.marginPct,
    sharesM: dr.dilutedSharesM ?? defaults.sharesM,
    shareChange: dr.annualShareChangePct ?? -1,
  };
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <TopDownEpsCard
        horizonYears={props.horizonYears}
        values={topDownValues}
        onPatch={props.onPatchDrivers}
        onApplyBaseEps={props.onApplyBaseEps}
      />
      <EvOwnerFcfCard
        currentPrice={props.currentPrice}
        horizonYears={props.horizonYears}
        sharesM={topDownValues.sharesM}
        initialFcfB={defaults.baseFcfB}
        initialCashB={defaults.cashB}
        initialDebtB={defaults.debtB}
        driverInputs={dr}
        onPatchDrivers={props.onPatchDrivers}
      />
    </div>
  );
}
