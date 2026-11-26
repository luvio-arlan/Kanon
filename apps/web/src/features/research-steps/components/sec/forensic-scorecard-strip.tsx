"use client";

import {
  calculateAltmanZScore,
  calculateBeneishMScore,
  calculateDuPontDecomposition,
  calculatePiotroskiFScore,
  type SecAnnualFinancial,
} from "@kanon/core";
import { useMemo } from "react";

interface VerifiedBalance {
  equity: number;
  debt: number;
  assets: number;
  currentAssets: number;
  currentLiabilities: number;
  ppeNet: number;
  hasReceivables: boolean;
}

function readVerifiedBalance(row: SecAnnualFinancial): VerifiedBalance | null {
  if (row.stockholdersEquity == null || row.totalDebt == null || row.accountsPayable == null) {
    return null;
  }
  const equity = row.stockholdersEquity;
  const debt = row.totalDebt;
  const currentLiabilities = row.accountsPayable;
  const assets = equity + debt + currentLiabilities;
  if (assets <= 0 || currentLiabilities <= 0) return null;
  const currentAssets =
    (row.cashAndEquiv ?? 0) + (row.accountsReceivable ?? 0) + (row.inventory ?? 0);
  const ppeNet = Math.max(0, assets - currentAssets - (row.goodwill ?? 0));
  return {
    equity,
    debt,
    assets,
    currentAssets,
    currentLiabilities,
    ppeNet,
    hasReceivables: row.accountsReceivable != null,
  };
}

function toBeneishPeriod(row: SecAnnualFinancial, b: VerifiedBalance) {
  const revenue = row.revenue ?? 0;
  return {
    revenue,
    costOfRevenue: row.costOfRevenue ?? revenue - (row.grossProfit ?? 0),
    sgaExpense: Math.max(0, (row.grossProfit ?? 0) - (row.operatingIncome ?? 0)),
    depreciation: 0,
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

function toPiotroskiPeriod(row: SecAnnualFinancial, b: VerifiedBalance) {
  return {
    netIncome: row.netIncome ?? 0,
    operatingCashFlow: row.operatingCashFlow ?? 0,
    totalAssets: b.assets,
    longTermDebt: b.debt,
    currentAssets: b.currentAssets,
    currentLiabilities: b.currentLiabilities,
    dilutedShares: row.dilutedShares ?? 0,
    grossProfit: row.grossProfit ?? 0,
    revenue: row.revenue ?? 0,
  };
}

function computeAltmanIfAvailable(
  curr: SecAnnualFinancial,
  cb: VerifiedBalance | null,
  currentPrice?: number,
) {
  if (!cb || curr.operatingIncome == null || curr.revenue == null) return null;
  if (!currentPrice || currentPrice <= 0 || !curr.dilutedShares || curr.dilutedShares <= 0) {
    return null;
  }
  return calculateAltmanZScore({
    workingCapital: cb.currentAssets - cb.currentLiabilities,
    retainedEarnings: cb.equity,
    ebit: curr.operatingIncome,
    marketCap: currentPrice * curr.dilutedShares,
    bookEquity: Math.max(1, cb.equity),
    totalLiabilities: Math.max(1, cb.debt + cb.currentLiabilities),
    revenue: curr.revenue,
    totalAssets: cb.assets,
  });
}

function computeDupontIfAvailable(
  curr: SecAnnualFinancial,
  cb: VerifiedBalance | null,
  pb: VerifiedBalance | null,
) {
  if (!cb || !pb || cb.equity + pb.equity <= 0 || curr.netIncome == null || curr.revenue == null) {
    return null;
  }
  return calculateDuPontDecomposition({
    netIncome: curr.netIncome,
    pretaxIncome: curr.pretaxIncome ?? curr.operatingIncome ?? curr.netIncome,
    ebit: curr.operatingIncome ?? curr.netIncome,
    revenue: curr.revenue,
    averageAssets: (cb.assets + pb.assets) / 2,
    averageEquity: (cb.equity + pb.equity) / 2,
  });
}

function computeHonestForensics(annuals: readonly SecAnnualFinancial[], currentPrice?: number) {
  if (annuals.length < 2) return null;
  const curr = annuals[annuals.length - 1];
  const prev = annuals[annuals.length - 2];
  if (!curr || !prev || curr.revenue == null || prev.revenue == null || curr.revenue <= 0) {
    return null;
  }
  const cb = readVerifiedBalance(curr);
  const pb = readVerifiedBalance(prev);
  const hasBeneish =
    cb?.hasReceivables &&
    pb?.hasReceivables &&
    curr.grossProfit != null &&
    prev.grossProfit != null;
  const beneish =
    hasBeneish && cb && pb
      ? calculateBeneishMScore(toBeneishPeriod(curr, cb), toBeneishPeriod(prev, pb))
      : null;
  const altman = computeAltmanIfAvailable(curr, cb, currentPrice);
  const piotroski =
    cb && pb && curr.dilutedShares && prev.dilutedShares
      ? calculatePiotroskiFScore(toPiotroskiPeriod(curr, cb), toPiotroskiPeriod(prev, pb))
      : null;
  const dupont = computeDupontIfAvailable(curr, cb, pb);
  if (!beneish && !altman && !piotroski && !dupont) return null;
  return { beneish, altman, piotroski, dupont, fy: curr.fiscalYear };
}

function resolveAltmanTone(altman: ReturnType<typeof calculateAltmanZScore> | null) {
  if (!altman?.applicable) return "text-ink-muted";
  if (altman.zone === "safe") return "text-status-pass";
  if (altman.zone === "distress") return "text-status-fail";
  return "text-ink-secondary";
}

function resolvePiotroskiTone(grade?: ReturnType<typeof calculatePiotroskiFScore>["grade"]) {
  if (grade === "strong") return "text-status-pass";
  if (grade === "weak") return "text-status-fail";
  return "text-ink-primary";
}

function ForensicMetricItem({
  label,
  value,
  tone,
  title,
}: {
  label: string;
  value: string;
  tone: string;
  title: string;
}) {
  return (
    <span title={title} className="cursor-help text-ink-muted">
      {label} <strong className={tone}>{value}</strong>
    </span>
  );
}

function buildScorecardItems(s: NonNullable<ReturnType<typeof computeHonestForensics>>) {
  const mTone = !s.beneish
    ? "text-ink-muted"
    : s.beneish.flaggedManipulator
      ? "text-status-warn"
      : "text-status-pass";
  return [
    {
      label: "Beneish M",
      value: s.beneish ? s.beneish.mScore.toFixed(2) : "N/A",
      tone: mTone,
      title: s.beneish
        ? `Beneish M-Score (${s.fy}) · 阈值 > -1.78 提示盈余操纵风险 · DSRI ${s.beneish.components.dsri}`
        : "缺应收账款/应付账款等完整资产负债表字段，不作估算",
    },
    {
      label: "Altman Z",
      value: s.altman?.applicable ? s.altman.score.toFixed(2) : "N/A",
      tone: resolveAltmanTone(s.altman),
      title: s.altman?.applicable
        ? `Altman ${s.altman.variant} (${s.fy}) · 基于实时市值与资产负债表 · 安全区 > 2.60`
        : "缺市值或完整资产负债表字段，不作估算",
    },
    {
      label: "Piotroski F",
      value: s.piotroski ? `${s.piotroski.score}/9` : "N/A",
      tone: resolvePiotroskiTone(s.piotroski?.grade),
      title: s.piotroski
        ? `Piotroski F-Score (${s.fy}) · 0–9 满分，≥ 7 强健，≤ 3 偏弱`
        : "缺稀释股本或资产负债表字段",
    },
    {
      label: "DuPont ROE",
      value: s.dupont ? `${s.dupont.roePct.toFixed(1)}%` : "N/A",
      tone: "text-ink-primary",
      title: s.dupont
        ? `5 因子杜邦拆解 (${s.fy}) · EBIT率 ${s.dupont.ebitMarginPct}% × 周转 ${s.dupont.assetTurnover}× × 权益乘数 ${s.dupont.equityMultiplier}×`
        : "缺股东权益或净利润字段",
    },
  ];
}

export function ForensicScorecardStrip({
  annuals,
  currentPrice,
}: {
  annuals: readonly SecAnnualFinancial[];
  currentPrice?: number;
}) {
  const s = useMemo(() => computeHonestForensics(annuals, currentPrice), [annuals, currentPrice]);
  if (!s) return null;
  const items = buildScorecardItems(s);
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-hairline bg-canvas/30 px-6 py-2.5 font-mono text-xs tabular-nums">
      {items.map((item) => (
        <ForensicMetricItem key={item.label} {...item} />
      ))}
    </div>
  );
}
