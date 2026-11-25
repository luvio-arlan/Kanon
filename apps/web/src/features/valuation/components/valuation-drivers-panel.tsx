"use client";

import type { SecAnnualFinancial, ValuationDriverInputs } from "@kanon/core";
import { SegmentedTabs } from "@kanon/ui";
import { useState } from "react";
import { LinkedOperatingCard } from "./drivers/linked-operating-card";
import { SotpBuilderCard } from "./drivers/sotp-builder-card";
import { TopDownEpsCard, type TopDownValues } from "./drivers/top-down-eps-card";
import { EvOwnerFcfCard } from "./ev-owner-fcf-card";

type DriverTab = "linked" | "sotp" | "classic";

interface DriversPanelProps {
  currentPrice: number;
  horizonYears: number;
  latestAnnual: SecAnnualFinancial | null;
  driverInputs: ValuationDriverInputs;
  onPatchDrivers: (next: Partial<ValuationDriverInputs>) => void;
  onApplyBaseEps: (eps: number) => void;
  onApplyEvTargets?: (targets: { bear: number; base: number; bull: number }) => void;
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

function ClassicDriversGrid({
  props,
  defaults,
  topDownValues,
}: {
  props: DriversPanelProps;
  defaults: ReturnType<typeof deriveDefaults>;
  topDownValues: TopDownValues;
}) {
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
        driverInputs={props.driverInputs}
        onPatchDrivers={props.onPatchDrivers}
        onApplyEvTargets={props.onApplyEvTargets}
      />
    </div>
  );
}

function DriverTabBody({
  tab,
  props,
  defaults,
  topDownValues,
}: {
  tab: DriverTab;
  props: DriversPanelProps;
  defaults: ReturnType<typeof deriveDefaults>;
  topDownValues: TopDownValues;
}) {
  const dr = props.driverInputs;
  const cashB = dr.cashB ?? defaults.cashB;
  const debtB = dr.totalDebtB ?? defaults.debtB;
  const applyTargets = props.onApplyEvTargets ?? (() => undefined);
  if (tab === "linked") {
    return (
      <LinkedOperatingCard
        currentPrice={props.currentPrice}
        horizonYears={props.horizonYears}
        currentRevenueB={topDownValues.revB}
        currentSharesM={topDownValues.sharesM}
        cashB={cashB}
        totalDebtB={debtB}
        latestAnnual={props.latestAnnual}
        linkedDrivers={dr.linkedDrivers}
        onChangeDrivers={(linkedDrivers) => props.onPatchDrivers({ linkedDrivers })}
        onApplyAllCases={applyTargets}
      />
    );
  }
  if (tab === "sotp") {
    return (
      <SotpBuilderCard
        currentPrice={props.currentPrice}
        horizonYears={props.horizonYears}
        dilutedSharesM={topDownValues.sharesM}
        netCashB={cashB - debtB}
        fallbackRevenueB={topDownValues.revB}
        segments={dr.sotpSegments}
        holdingDiscountPct={dr.sotpHoldingDiscountPct}
        onChange={(p) => props.onPatchDrivers(p)}
        onApplyTargets={applyTargets}
      />
    );
  }
  return <ClassicDriversGrid props={props} defaults={defaults} topDownValues={topDownValues} />;
}

export function ValuationDriversPanel(props: DriversPanelProps) {
  const [tab, setTab] = useState<DriverTab>("linked");
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
    <div className="space-y-4">
      <SegmentedTabs
        layoutId="valuation-driver-subtabs"
        value={tab}
        onChange={setTab}
        items={[
          { id: "linked", label: "三情景经营模型" },
          { id: "sotp", label: "SOTP 分部加总" },
          { id: "classic", label: "EPS / EV-FCF 速算" },
        ]}
      />
      <DriverTabBody tab={tab} props={props} defaults={defaults} topDownValues={topDownValues} />
    </div>
  );
}
