import {
  calculateMultiStageFcffDcf,
  calculateWacc,
  runValuationMonteCarlo,
  type SecAnnualFinancial,
  solveMauboussinImpliedCap,
} from "@kanon/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { ImplicitAssumptions } from "../components/drivers/valuation-band-strip";
import {
  apiListModelVersions,
  apiSaveModelVersion,
  type SavedModelVersion,
} from "./model-versions-api";

export interface CoreModelInputs {
  wacc: number;
  growth: number;
  margin: number;
  stc: number;
}

export interface SecModelBase {
  fiscalYear: string;
  periodEndDate: string | null;
  revB: number;
  sharesM: number;
  cashB: number;
  debtB: number;
}

export function extractHonestSecBase(
  secAnnuals: readonly SecAnnualFinancial[],
): SecModelBase | null {
  const latest = secAnnuals[secAnnuals.length - 1];
  if (
    !latest ||
    latest.revenue == null ||
    latest.revenue <= 0 ||
    latest.dilutedShares == null ||
    latest.dilutedShares <= 0
  ) {
    return null;
  }
  return {
    fiscalYear: latest.fiscalYear,
    periodEndDate: latest.periodEndDate ?? null,
    revB: latest.revenue / 1e9,
    sharesM: latest.dilutedShares / 1e6,
    cashB: latest.cashAndEquiv != null ? latest.cashAndEquiv / 1e9 : 0,
    debtB: latest.totalDebt != null ? latest.totalDebt / 1e9 : 0,
  };
}

function runDcfForBase(
  vals: CoreModelInputs,
  implicit: ImplicitAssumptions,
  base: SecModelBase,
  price: number,
  safeWacc: number,
) {
  return calculateMultiStageFcffDcf({
    baseRevenueB: base.revB,
    highGrowthYears: 5,
    fadeYears: 5,
    initialRevenueGrowthPct: vals.growth,
    terminalGrowthPct: implicit.terminalGrowthPct,
    initialEbitMarginPct: vals.margin,
    terminalEbitMarginPct: vals.margin,
    effectiveTaxRatePct: implicit.taxRatePct,
    salesToCapitalRatio: Math.max(0.4, vals.stc),
    terminalRonicPct: implicit.terminalRonicPct,
    waccPct: safeWacc,
    cashAndStInvestmentsB: base.cashB,
    totalDebtB: base.debtB,
    basicSharesM: base.sharesM,
    assumedSharePrice: price,
  });
}

function computeModels(
  vals: CoreModelInputs,
  implicit: ImplicitAssumptions,
  base: SecModelBase,
  price: number,
  years: number,
) {
  const safeWacc = Math.max(implicit.terminalGrowthPct + 0.6, Math.min(25, vals.wacc));
  const dcf = runDcfForBase(vals, implicit, base, price, safeWacc);
  const baseNopat = Math.max(
    0.05,
    (base.revB * (vals.margin / 100) * (1 - implicit.taxRatePct / 100) * 1000) / base.sharesM,
  );
  const cap = solveMauboussinImpliedCap({
    currentValue: price,
    baseNopat,
    growthRatePct: Math.max(0.5, vals.growth),
    ronicPct: implicit.capRonicPct,
    waccPct: safeWacc,
  });
  const mc = runValuationMonteCarlo({
    seed: 20261126,
    iterations: 2000,
    currentPrice: price,
    baseRevenueB: base.revB,
    dilutedSharesM: base.sharesM,
    netCashB: base.cashB - base.debtB,
    horizonYears: Math.max(3, years),
    taxRatePct: implicit.taxRatePct,
    discountRatePct: safeWacc,
    revenueCagrPct: { mean: vals.growth, stdDev: 4.5, min: -10, max: 45 },
    operatingMarginPct: { mean: vals.margin, stdDev: 3.5, min: 5, max: 60 },
    exitMultiple: { mean: implicit.exitMultiple, stdDev: 4, min: 8, max: 35 },
  });
  return { dcf, cap, mc };
}

function resolveDefaultWacc(base: SecModelBase | null, currentPrice: number): number {
  if (!base) return 9;
  return calculateWacc({
    riskFreeRatePct: 4.25,
    equityRiskPremiumPct: 5.0,
    beta: 1.05,
    preTaxCostOfDebtPct: 5.5,
    marginalTaxRatePct: 21,
    marketCapB: Math.max(1, (base.sharesM * currentPrice) / 1000),
    totalDebtB: base.debtB,
  }).waccPct;
}

const DEFAULT_IMPLICIT: ImplicitAssumptions = {
  terminalGrowthPct: 3.0,
  taxRatePct: 21,
  terminalRonicPct: 16,
  capRonicPct: 22,
  exitMultiple: 18,
};

interface HookParams {
  thesisId: string;
  ticker: string;
  currentPrice: number;
  horizonYears: number;
  secAnnuals: readonly SecAnnualFinancial[];
}

export function useInstitutionalModels(p: HookParams) {
  const base = useMemo(() => extractHonestSecBase(p.secAnnuals), [p.secAnnuals]);
  const [vals, setVals] = useState<CoreModelInputs>(() => ({
    wacc: resolveDefaultWacc(base, p.currentPrice),
    growth: 12,
    margin: 25,
    stc: 2,
  }));
  const [implicit, setImplicit] = useState<ImplicitAssumptions>(DEFAULT_IMPLICIT);
  const [saving, setSaving] = useState(false);
  const [versions, setVersions] = useState<SavedModelVersion[]>([]);
  const reload = useCallback(
    () => void apiListModelVersions(p.thesisId).then(setVersions),
    [p.thesisId],
  );
  useEffect(() => reload(), [reload]);

  const out = useMemo(
    () => (base ? computeModels(vals, implicit, base, p.currentPrice, p.horizonYears) : null),
    [vals, implicit, base, p.currentPrice, p.horizonYears],
  );

  async function snapshot() {
    if (!base || !out) return;
    setSaving(true);
    const lineage = {
      ...base,
      price: p.currentPrice,
      priceDate: new Date().toISOString().slice(0, 10),
      horizonYears: p.horizonYears,
    };
    const ok = await apiSaveModelVersion(p.thesisId, {
      label: `${p.ticker} DCF ${vals.wacc}% WACC`,
      modelKind: "fcff_dcf",
      inputs: { ...vals, ...implicit, lineage },
      outputs: { fairValuePerShare: out.dcf.fairValuePerShare, mcP50: out.mc.p50 },
    });
    setSaving(false);
    if (!ok) return void toast.error("模型快照保存失败");
    toast.success(`已归档快照（公允价 $${out.dcf.fairValuePerShare.toFixed(1)}）`);
    reload();
  }
  return { base, vals, setVals, implicit, setImplicit, saving, versions, out, snapshot };
}
