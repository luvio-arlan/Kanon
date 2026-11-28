import { roundTo } from "../../../math/valuation-scenarios";
import type { CreateThesisInputSchema } from "../../../schemas/research";

export function buildStarterHypotheses(thesisId: string, companyName: string) {
  const mk = (i: number, title: string, metricLabel: string, threshold: string, note: string) => ({
    id: `${thesisId}-h${i + 1}`,
    thesisId,
    sortOrder: i,
    title,
    metricLabel,
    threshold,
    status: "watching" as const,
    note,
  });
  return [
    mk(
      0,
      `${companyName} 核心产品保持份额扩张与定价权`,
      "核心业务营收增速",
      "> 15% 同比",
      "请在财报电话会与 10-K 分部收入中核对量价拆解。",
    ),
    mk(
      1,
      "毛利率与自由现金流维持护城河水准",
      "毛利率 / FCF",
      "不低于近 3 年中枢",
      "重点观察资本开支转化效率与竞争对手降价压力。",
    ),
    mk(
      2,
      "管理层资本配置纪律清晰且无盲目并购",
      "ROIC / 回购节奏",
      "ROIC > 18%",
      "核查 10-K 现金流量表中的回购、分红与研发投入比例。",
    ),
  ];
}

export function buildStarterValuation(
  thesisId: string,
  price: number,
  latestSecEps?: number,
  priceHistory?: ReadonlyArray<{ label: string; price: number }>,
) {
  const trailingEps = latestSecEps && latestSecEps > 0 ? latestSecEps : roundTo(price / 22, 2);
  const rawPe = Math.min(35, Math.max(12, Math.round(price / trailingEps)));
  const basePe = Math.min(32, Math.max(14, rawPe));
  return {
    thesisId,
    bearEps: roundTo(Math.max(0.05, trailingEps * 0.9), 2),
    bearPe: Math.max(10, basePe - 5),
    bearProb: 0.25,
    baseEps: roundTo(Math.max(0.08, trailingEps * 1.38), 2),
    basePe,
    baseProb: 0.5,
    bullEps: roundTo(Math.max(0.12, trailingEps * 1.8), 2),
    bullPe: Math.min(42, basePe + 5),
    bullProb: 0.25,
    priceHistory:
      priceHistory && priceHistory.length >= 2
        ? [...priceHistory]
        : [
            { label: "6M前", price: roundTo(price * 0.88, 2) },
            { label: "4M前", price: roundTo(price * 0.94, 2) },
            { label: "2M前", price: roundTo(price * 0.97, 2) },
            { label: "现价", price: roundTo(price, 2) },
          ],
  };
}

export function buildNewThesisRow(
  id: string,
  userId: string,
  indexOrder: number,
  parsed: ReturnType<typeof CreateThesisInputSchema.parse>,
) {
  return {
    id,
    userId,
    indexOrder,
    ticker: parsed.ticker,
    companyName: parsed.companyName,
    sectorTag: parsed.sectorTag,
    currentPrice: parsed.currentPrice,
    horizonYears: 3,
    convictionSummary:
      parsed.convictionSummary ??
      `待完善 ${parsed.companyName}（${parsed.ticker}）的核心护城河与 3 年盈利驱动逻辑。`,
    status: "active" as const,
    businessFilter: {
      recurringRevenue: "watch" as const,
      pricingPower: "watch" as const,
      capitalReturn: "watch" as const,
      governance: "watch" as const,
      notes: "",
      vetoReason: "",
      consensusView: "",
      variantPerception: "",
      keyDebate: "",
      preMortem: "",
    },
    lastReviewedLabel: "刚刚创建 · 待初筛",
  };
}
