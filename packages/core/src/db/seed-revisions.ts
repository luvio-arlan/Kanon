import type { RevisionStep } from "../schemas/research";

export const SEED_REVISIONS: ReadonlyArray<{
  id: string;
  thesisId: string;
  step: RevisionStep;
  summary: string;
  currentPrice: number;
  baseTargetPrice: number;
  riskRewardRatio: number | null;
  readinessScore: number;
  createdAt: Date;
}> = [
  {
    id: "rev-mu-seed-1",
    thesisId: "thesis-mu",
    step: "valuation",
    summary: "Q4 10-K 后锚定 3 年中性 EPS $12.50 × 14x（赔率 3.72×）",
    currentPrice: 108,
    baseTargetPrice: 175,
    riskRewardRatio: 3.72,
    readinessScore: 100,
    createdAt: new Date("2026-11-18T10:00:00.000Z"),
  },
  {
    id: "rev-mu-seed-2",
    thesisId: "thesis-mu",
    step: "discipline",
    summary: "签署首次建仓零杠杆检查单（参考价 $104.50，离场红线毛利率 < 38%）",
    currentPrice: 104.5,
    baseTargetPrice: 175,
    riskRewardRatio: 4.86,
    readinessScore: 100,
    createdAt: new Date("2026-11-12T14:30:00.000Z"),
  },
  {
    id: "rev-nvda-seed-1",
    thesisId: "thesis-nvda",
    step: "cross_checks",
    summary: "完成北美四大云厂商 CapEx 互证与 TSMC CoWoS 上游产能核验",
    currentPrice: 138,
    baseTargetPrice: 198.4,
    riskRewardRatio: 1.86,
    readinessScore: 100,
    createdAt: new Date("2026-11-16T09:15:00.000Z"),
  },
];
