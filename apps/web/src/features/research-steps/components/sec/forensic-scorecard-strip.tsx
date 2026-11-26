"use client";

import {
  calculateAltmanZScore,
  calculateBeneishMScore,
  calculateDuPontDecomposition,
  calculatePiotroskiFScore,
  type SecAnnualFinancial,
} from "@kanon/core";
import { useMemo } from "react";

interface BalanceDerived {
  equity: number;
  debt: number;
  assets: number;
  currentAssets: number;
  currentLiabilities: number;
  ppeNet: number;
}

function deriveBalance(row: SecAnnualFinancial, fallbackEquity = 0): BalanceDerived {
  const equity = row.stockholdersEquity ?? fallbackEquity;
  const debt = row.totalDebt ?? 0;
  const assets = Math.max(1, equity + debt + (row.accountsPayable ?? 0));
  const currentAssets =
    (row.cashAndEquiv ?? 0) + (row.accountsReceivable ?? 0) + (row.inventory ?? 0);
  const currentLiabilities = Math.max(1, row.accountsPayable ?? debt * 0.25);
  const ppeNet = Math.max(0, assets - currentAssets - (row.goodwill ?? 0));
  return { equity, debt, assets, currentAssets, currentLiabilities, ppeNet };
}

function toBeneishPeriod(row: SecAnnualFinancial, b: BalanceDerived) {
  const revenue = row.revenue ?? 0;
  return {
    revenue,
    costOfRevenue: row.costOfRevenue ?? revenue - (row.grossProfit ?? 0),
    sgaExpense: Math.max(0, (row.grossProfit ?? 0) - (row.operatingIncome ?? 0)),
    depreciation: Math.abs(row.capex ?? 0) * 0.6,
    netIncome: row.netIncome ?? 0,
    operatingCashFlow: row.operatingCashFlow ?? 0,
    accountsReceivable: row.accountsReceivable ?? 0,
    currentAssets: b.currentAssets,
    ppeNet: b.ppeNet,
    totalAssets: b.assets,
    currentLiabilities: b.currentLiabilities,
    longTermDebt: b.debt,
  };
}

function toPiotroskiPeriod(row: SecAnnualFinancial, b: BalanceDerived) {
  return {
    netIncome: row.netIncome ?? 0,
    operatingCashFlow: row.operatingCashFlow ?? 0,
    totalAssets: b.assets,
    longTermDebt: b.debt,
    currentAssets: b.currentAssets,
    currentLiabilities: b.currentLiabilities,
    dilutedShares: row.dilutedShares ?? 1,
    grossProfit: row.grossProfit ?? 0,
    revenue: row.revenue ?? 0,
  };
}

function buildForensicSnapshot(annuals: readonly SecAnnualFinancial[]) {
  if (annuals.length < 2) return null;
  const curr = annuals[annuals.length - 1];
  const prev = annuals[annuals.length - 2];
  if (!curr || !prev || curr.revenue == null || prev.revenue == null || curr.revenue <= 0) {
    return null;
  }
  const cb = deriveBalance(curr);
  const pb = deriveBalance(prev, cb.equity);
  const beneish = calculateBeneishMScore(toBeneishPeriod(curr, cb), toBeneishPeriod(prev, pb));
  const altman = calculateAltmanZScore({
    workingCapital: cb.currentAssets - cb.currentLiabilities,
    retainedEarnings: cb.equity * 0.7,
    ebit: curr.operatingIncome ?? curr.netIncome ?? 0,
    marketCap: Math.max(1, cb.equity),
    bookEquity: Math.max(1, cb.equity),
    totalLiabilities: Math.max(1, cb.debt + cb.currentLiabilities),
    revenue: curr.revenue,
    totalAssets: cb.assets,
  });
  const piotroski = calculatePiotroskiFScore(
    toPiotroskiPeriod(curr, cb),
    toPiotroskiPeriod(prev, pb),
  );
  const dupont = calculateDuPontDecomposition({
    netIncome: curr.netIncome ?? 0,
    pretaxIncome: curr.pretaxIncome ?? curr.operatingIncome ?? curr.netIncome ?? 0,
    ebit: curr.operatingIncome ?? curr.netIncome ?? 0,
    revenue: curr.revenue,
    averageAssets: (cb.assets + pb.assets) / 2,
    averageEquity: Math.max(1, (cb.equity + pb.equity) / 2),
  });
  return { beneish, altman, piotroski, dupont, fy: curr.fiscalYear };
}

function resolveAltmanTone(altman: ReturnType<typeof calculateAltmanZScore>) {
  if (!altman.applicable) return "text-ink-secondary";
  if (altman.zone === "safe") return "text-status-pass";
  if (altman.zone === "distress") return "text-status-fail";
  return "text-ink-secondary";
}

function resolvePiotroskiTone(grade: ReturnType<typeof calculatePiotroskiFScore>["grade"]) {
  if (grade === "strong") return "text-status-pass";
  if (grade === "weak") return "text-status-fail";
  return "text-ink-primary";
}

export function ForensicScorecardStrip({ annuals }: { annuals: readonly SecAnnualFinancial[] }) {
  const scores = useMemo(() => buildForensicSnapshot(annuals), [annuals]);
  if (!scores) return null;
  const mTone = scores.beneish.flaggedManipulator ? "text-status-warn" : "text-status-pass";
  const zTone = resolveAltmanTone(scores.altman);
  const fTone = resolvePiotroskiTone(scores.piotroski.grade);

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-hairline bg-canvas/30 px-6 py-2.5 font-mono text-xs tabular-nums">
      <span
        title={`Beneish M-Score (${scores.fy}) · 阈值 > -1.78 提示盈余操纵风险 · DSRI ${scores.beneish.components.dsri}`}
        className="cursor-help text-ink-muted"
      >
        Beneish M <strong className={mTone}>{scores.beneish.mScore.toFixed(2)}</strong>
      </span>
      <span
        title={
          scores.altman.applicable
            ? `Altman ${scores.altman.variant} (${scores.fy}) · 安全区 > 2.60`
            : scores.altman.reason
        }
        className="cursor-help text-ink-muted"
      >
        Altman Z{" "}
        <strong className={zTone}>
          {scores.altman.applicable ? scores.altman.score.toFixed(2) : "N/A"}
        </strong>
      </span>
      <span
        title={`Piotroski F-Score (${scores.fy}) · 0–9 满分，≥ 7 强健，≤ 3 偏弱`}
        className="cursor-help text-ink-muted"
      >
        Piotroski F <strong className={fTone}>{scores.piotroski.score}/9</strong>
      </span>
      <span
        title={`5 因子杜邦拆解 (${scores.fy}) · EBIT率 ${scores.dupont.ebitMarginPct}% × 周转 ${scores.dupont.assetTurnover}× × 权益乘数 ${scores.dupont.equityMultiplier}×`}
        className="cursor-help text-ink-muted"
      >
        DuPont ROE <strong className="text-ink-primary">{scores.dupont.roePct.toFixed(1)}%</strong>
      </span>
    </div>
  );
}
