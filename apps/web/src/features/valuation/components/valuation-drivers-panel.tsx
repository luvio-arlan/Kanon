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

function toBillions(v: number | null | undefined): number {
  return v != null && Number.isFinite(v) ? Number((v / 1e9).toFixed(1)) : 0;
}

function deriveDefaults(latest: SecAnnualFinancial | null, price: number) {
  if (!latest) return { revB: 0, marginPct: 20, sharesM: 0, cashB: 0, debtB: 0, baseFcfB: 0 };
  const rev = latest.revenue != null && latest.revenue > 0 ? latest.revenue : null;
  const revB = toBillions(rev);
  const marginPct =
    rev !== null && latest.netIncome != null
      ? Math.max(5, Math.min(60, Number(((latest.netIncome / rev) * 100).toFixed(1))))
      : 20;
  const sharesM =
    latest.dilutedShares != null && latest.dilutedShares > 0
      ? Math.round(latest.dilutedShares / 1e6)
      : 0;
  const cashB = toBillions(latest.cashAndEquiv);
  const debtB = toBillions(latest.totalDebt);
  const rawFcf =
    latest.freeCashFlow != null ? latest.freeCashFlow - Math.abs(latest.sbc ?? 0) : null;
  const fallbackFcf = sharesM > 0 ? Number(((price * sharesM) / 22_000).toFixed(1)) : 0;
  const baseFcfB = rawFcf !== null && rawFcf > 0 ? toBillions(rawFcf * 1.4) : fallbackFcf;
  return { revB, marginPct, sharesM, cashB, debtB, baseFcfB: Math.max(0, baseFcfB) };
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
