import type { PortfolioRole, ThesisDetail } from "../schemas/research";
import { classifyEconomicFactor } from "./models/factor-clusters";
import { suggestKellyCappedWeight } from "./portfolio-analytics";
import { roundTo } from "./valuation-scenarios";

export interface PortfolioStressScenario {
  id: "base_case" | "multiple_shock_20" | "synchronized_bear" | "top_sector_shock";
  label: string;
  assumption: string;
  portfolioImpactPct: number;
  investedImpactPct: number;
  driverNote: string;
}

export interface PositionSizingRow {
  id: string;
  ticker: string;
  companyName: string;
  sector: string;
  portfolioRole: PortfolioRole;
  currentWeightPct: number;
  targetMaxWeightPct: number;
  kellyMinPct: number;
  kellyMaxPct: number;
  unrealizedPnlPct: number | null;
  baseCagrPct: number;
  riskRewardRatio: number | null;
  overCap: boolean;
}

export interface PortfolioStressReport {
  allocatedWeightPct: number;
  cashBufferPct: number;
  hhiConcentration: number;
  diversificationLabel: string;
  weightedBearImpactPct: number;
  weightedBaseImpactPct: number;
  weightedBullImpactPct: number;
  portfolioRiskReward: number | null;
  weightedUnrealizedPnlPct: number | null;
  topSectorName: string | null;
  topSectorWeightPct: number;
  scenarios: PortfolioStressScenario[];
  sizingRows: PositionSizingRow[];
}

function primarySector(sectorTag: string, ticker?: string): string {
  return classifyEconomicFactor(sectorTag, ticker);
}

function buildSizingRows(active: readonly ThesisDetail[]): PositionSizingRow[] {
  return active
    .map((t) => {
      const kelly = suggestKellyCappedWeight(t);
      const cost = t.avgCostBasis;
      const unrealizedPnlPct =
        typeof cost === "number" && cost > 0
          ? roundTo(((t.currentPrice - cost) / cost) * 100, 1)
          : null;
      return {
        id: t.id,
        ticker: t.ticker,
        companyName: t.companyName,
        sector: primarySector(t.sectorTag, t.ticker),
        portfolioRole: t.portfolioRole,
        currentWeightPct: roundTo(Math.max(0, t.currentWeightPct), 1),
        targetMaxWeightPct: roundTo(Math.max(1, t.targetMaxWeightPct), 1),
        kellyMinPct: kelly.minPct,
        kellyMaxPct: kelly.maxPct,
        unrealizedPnlPct,
        baseCagrPct: t.valuation.base.cagrPct,
        riskRewardRatio: t.valuation.riskRewardRatio,
        overCap: t.currentWeightPct > t.targetMaxWeightPct,
      };
    })
    .sort((a, b) => {
      if (b.currentWeightPct !== a.currentWeightPct) {
        return b.currentWeightPct - a.currentWeightPct;
      }
      return (b.riskRewardRatio ?? 99) - (a.riskRewardRatio ?? 99);
    });
}

function computeTopSector(rows: readonly PositionSizingRow[]) {
  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.currentWeightPct <= 0) continue;
    map.set(r.sector, roundTo((map.get(r.sector) ?? 0) + r.currentWeightPct, 1));
  }
  let topName: string | null = null;
  let topWeight = 0;
  for (const [sector, weight] of map.entries()) {
    if (weight > topWeight) {
      topName = sector;
      topWeight = weight;
    }
  }
  return { topSectorName: topName, topSectorWeightPct: topWeight };
}

function computeHhi(weighted: readonly ThesisDetail[], totalWeight: number) {
  if (totalWeight <= 0) return { hhi: 0, label: "空仓观察" };
  let sumSq = 0;
  for (const t of weighted) {
    const share = (t.currentWeightPct / totalWeight) * 100;
    sumSq += share * share;
  }
  const hhi = Math.round(sumSq);
  const label = hhi >= 5000 ? "极高集中" : hhi >= 2800 ? "集中持仓" : "均衡分散";
  return { hhi, label };
}

function computeWeightedPnl(weighted: readonly ThesisDetail[]): number | null {
  let currentValueSum = 0;
  let costBasisSum = 0;
  for (const t of weighted) {
    if (typeof t.avgCostBasis === "number" && t.avgCostBasis > 0 && t.currentPrice > 0) {
      currentValueSum += t.currentWeightPct;
      costBasisSum += t.currentWeightPct * (t.avgCostBasis / t.currentPrice);
    }
  }
  return costBasisSum > 0
    ? roundTo(((currentValueSum - costBasisSum) / costBasisSum) * 100, 1)
    : null;
}

function computeSectorShockImpact(
  weighted: readonly ThesisDetail[],
  topSectorName: string | null,
): number {
  let acc = 0;
  for (const t of weighted) {
    if (primarySector(t.sectorTag, t.ticker) === topSectorName) {
      acc += (t.currentWeightPct / 100) * t.valuation.bear.returnPct;
    }
  }
  return roundTo(acc, 1);
}

function buildStressScenarios(params: {
  weighted: readonly ThesisDetail[];
  totalWeight: number;
  topSectorName: string | null;
  basePortfolio: number;
  bearPortfolio: number;
}): PortfolioStressScenario[] {
  const { weighted, totalWeight, topSectorName, basePortfolio, bearPortfolio } = params;
  const toInvested = (val: number) => (totalWeight > 0 ? roundTo((val / totalWeight) * 100, 1) : 0);
  const sectorPortfolio = computeSectorShockImpact(weighted, topSectorName);
  const cashBuf = roundTo(Math.max(0, 100 - totalWeight), 1);
  return [
    {
      id: "base_case",
      label: "中性基准兑现",
      assumption: "所有持仓按各自中性 EPS × PE 锚点兑现，现金按 0% 保底",
      portfolioImpactPct: basePortfolio,
      investedImpactPct: toInvested(basePortfolio),
      driverNote: "已配仓位驱动总组合长期复利",
    },
    {
      id: "multiple_shock_20",
      label: "全市场估值杀跌 -20%",
      assumption: "宏观无风险利率上行，全组合估值倍数同步下压 20%",
      portfolioImpactPct: roundTo((totalWeight / 100) * -20, 1),
      investedImpactPct: totalWeight > 0 ? -20 : 0,
      driverNote: `现金缓冲 ${cashBuf}% 显著吸收组合净值波动`,
    },
    {
      id: "synchronized_bear",
      label: "共振熊市压力测试",
      assumption: "全部持仓同时跌至各自悲观情景目标价（零杠杆抗压底线）",
      portfolioImpactPct: bearPortfolio,
      investedImpactPct: toInvested(bearPortfolio),
      driverNote: "衡量组合极端最大回撤是否处于个人心理承受范围",
    },
    {
      id: "top_sector_shock",
      label: "重仓赛道单边回撤",
      assumption: topSectorName
        ? `第一大重仓赛道「${topSectorName}」全部跌至悲观价，其余持仓持平`
        : "当前尚未配置重仓赛道",
      portfolioImpactPct: sectorPortfolio,
      investedImpactPct: toInvested(sectorPortfolio),
      driverNote: topSectorName
        ? `测试「${topSectorName}」赛道相关性失灵时的尾部风险`
        : "配置仓位后自动激活赛道冲击测算",
    },
  ];
}

function computeWeightedPayoffs(weighted: readonly ThesisDetail[]) {
  const weightedBearImpactPct = roundTo(
    weighted.reduce((s, t) => s + (t.currentWeightPct / 100) * t.valuation.bear.returnPct, 0),
    1,
  );
  const weightedBaseImpactPct = roundTo(
    weighted.reduce((s, t) => s + (t.currentWeightPct / 100) * t.valuation.base.returnPct, 0),
    1,
  );
  const weightedBullImpactPct = roundTo(
    weighted.reduce((s, t) => s + (t.currentWeightPct / 100) * t.valuation.bull.returnPct, 0),
    1,
  );
  const downAbs = Math.abs(Math.min(0, weightedBearImpactPct));
  const portfolioRiskReward =
    weightedBaseImpactPct <= 0
      ? 0
      : downAbs === 0
        ? null
        : roundTo(weightedBaseImpactPct / downAbs, 2);
  return {
    weightedBearImpactPct,
    weightedBaseImpactPct,
    weightedBullImpactPct,
    portfolioRiskReward,
  };
}

export function calculatePortfolioStress(theses: readonly ThesisDetail[]): PortfolioStressReport {
  const active = theses.filter((t) => t.status === "active");
  const weighted = active.filter((t) => t.currentWeightPct > 0);
  const allocatedWeightPct = roundTo(
    weighted.reduce((sum, t) => sum + t.currentWeightPct, 0),
    1,
  );
  const sizingRows = buildSizingRows(active);
  const { topSectorName, topSectorWeightPct } = computeTopSector(sizingRows);
  const { hhi, label } = computeHhi(weighted, allocatedWeightPct);
  const payoffs = computeWeightedPayoffs(weighted);

  return {
    allocatedWeightPct,
    cashBufferPct: roundTo(Math.max(0, 100 - allocatedWeightPct), 1),
    hhiConcentration: hhi,
    diversificationLabel: label,
    ...payoffs,
    weightedUnrealizedPnlPct: computeWeightedPnl(weighted),
    topSectorName,
    topSectorWeightPct,
    scenarios: buildStressScenarios({
      weighted,
      totalWeight: allocatedWeightPct,
      topSectorName,
      basePortfolio: payoffs.weightedBaseImpactPct,
      bearPortfolio: payoffs.weightedBearImpactPct,
    }),
    sizingRows,
  };
}
