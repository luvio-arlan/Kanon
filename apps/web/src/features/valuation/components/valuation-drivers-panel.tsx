"use client";

import type { SecAnnualFinancial, ValuationDriverInputs, ValuationModelMode } from "@kanon/core";
import { Button, Card } from "@kanon/ui";
import { LinkedOperatingCard } from "./drivers/linked-operating-card";
import { SotpBuilderCard } from "./drivers/sotp-builder-card";
import { EvOwnerFcfCard } from "./ev-owner-fcf-card";

interface DriversPanelProps {
  currentPrice: number;
  horizonYears: number;
  modelMode: ValuationModelMode;
  secAnnuals: readonly SecAnnualFinancial[];
  driverInputs: ValuationDriverInputs;
  onPatchDrivers: (next: Partial<ValuationDriverInputs>) => void;
  onApplyEvTargets?: (targets: { bear: number; base: number; bull: number }) => void;
  onGoToSec?: () => void;
}

interface DerivedDriverDefaults {
  revB: number | null;
  sharesM: number | null;
  cashB: number | null;
  debtB: number | null;
  baseFcfB: number | null;
}

function toBillionsOrNull(v: number | null | undefined): number | null {
  return v != null && Number.isFinite(v) ? Number((v / 1e9).toFixed(2)) : null;
}

function deriveDefaults(latest: SecAnnualFinancial | null): DerivedDriverDefaults {
  if (!latest) return { revB: null, sharesM: null, cashB: null, debtB: null, baseFcfB: null };
  const revB =
    latest.revenue != null && latest.revenue > 0 ? toBillionsOrNull(latest.revenue) : null;
  const rawShares = latest.dilutedShares ?? latest.sharesOutstanding ?? null;
  const sharesM = rawShares != null && rawShares > 0 ? Math.round(rawShares / 1e6) : null;
  const cashB = toBillionsOrNull(latest.cashAndEquiv);
  const debtB = toBillionsOrNull(latest.totalDebt);
  const rawFcf =
    latest.freeCashFlow != null ? latest.freeCashFlow - Math.abs(latest.sbc ?? 0) : null;
  const baseFcfB = rawFcf != null && rawFcf > 0 ? toBillionsOrNull(rawFcf) : null;
  return { revB, sharesM, cashB, debtB, baseFcfB };
}

function MissingBaseCard({ onGoToSec }: { onGoToSec?: () => void }) {
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm text-ink-secondary">
      <span>缺少营收 / 股本 · 在 Step 3 同步 SEC 或手动填写</span>
      {onGoToSec ? (
        <Button variant="outline" size="sm" onClick={onGoToSec}>
          前往 Step 3
        </Button>
      ) : null}
    </Card>
  );
}

function resolveBaseMetrics(props: DriversPanelProps) {
  const latestAnnual = props.secAnnuals[props.secAnnuals.length - 1] ?? null;
  const defaults = deriveDefaults(latestAnnual);
  const dr = props.driverInputs;
  return {
    latestAnnual,
    defaults,
    revB: dr.currentRevenueB ?? defaults.revB,
    sharesM: dr.dilutedSharesM ?? defaults.sharesM,
    cashB: dr.cashB ?? defaults.cashB,
    debtB: dr.totalDebtB ?? defaults.debtB,
  };
}

export function ValuationDriversPanel(props: DriversPanelProps) {
  const { latestAnnual, defaults, revB, sharesM, cashB, debtB } = resolveBaseMetrics(props);
  const dr = props.driverInputs;
  const applyTargets = props.onApplyEvTargets ?? (() => undefined);
  if (!revB || revB <= 0 || !sharesM || sharesM <= 0) {
    return <MissingBaseCard onGoToSec={props.onGoToSec} />;
  }
  const common = { currentPrice: props.currentPrice, horizonYears: props.horizonYears };
  if (props.modelMode === "sotp") {
    return (
      <SotpBuilderCard
        {...common}
        dilutedSharesM={sharesM}
        netCashB={(cashB ?? 0) - (debtB ?? 0)}
        fallbackRevenueB={revB}
        segments={dr.sotpSegments}
        holdingDiscountPct={dr.sotpHoldingDiscountPct}
        onChange={props.onPatchDrivers}
        onApplyTargets={applyTargets}
      />
    );
  }
  if (props.modelMode === "ev_fcf") {
    return (
      <EvOwnerFcfCard
        {...common}
        sharesM={sharesM}
        initialFcfB={defaults.baseFcfB}
        initialCashB={cashB}
        initialDebtB={debtB}
        driverInputs={dr}
        onPatchDrivers={props.onPatchDrivers}
        onApplyEvTargets={props.onApplyEvTargets}
      />
    );
  }
  return (
    <LinkedOperatingCard
      {...common}
      currentRevenueB={revB}
      currentSharesM={sharesM}
      cashB={cashB ?? 0}
      totalDebtB={debtB ?? 0}
      latestAnnual={latestAnnual}
      linkedDrivers={dr.linkedDrivers}
      onChangeDrivers={(linkedDrivers) => props.onPatchDrivers({ linkedDrivers })}
      onApplyAllCases={applyTargets}
    />
  );
}
