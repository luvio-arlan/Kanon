import type { MarketQuoteSnapshot, MarketSessionState } from "../../contracts/market-contracts";
import type { ThesisDetail } from "../../schemas/research";
import { calculateImpliedExpectations } from "../implied-expectations";
import { suggestKellyCappedWeight } from "../portfolio-analytics";
import { calculateResearchReadiness } from "../research-readiness";
import { calculateValuationScenarios, roundTo } from "../valuation-scenarios";

export interface PeerCompRow {
  thesisId: string;
  ticker: string;
  companyName: string;
  sectorTag: string;
  anchorPrice: number;
  livePrice: number;
  sessionState: MarketSessionState | null;
  dayChangePct: number | null;
  drawdownFrom52wHighPct: number | null;
  baseTargetPrice: number;
  upsidePct: number;
  baseCagrPct: number;
  marginOfSafetyPct: number;
  riskRewardRatio: number | null;
  basePeMultiple: number;
  hurdleEntry15: number;
  belowHurdle15: boolean;
  readinessScore: number;
  currentWeightPct: number;
  kellyMaxPct: number;
  weightGapPct: number;
  upcomingCatalysts: number;
  warningCount: number;
}

export interface PeerCompsMedians {
  upsidePct: number | null;
  baseCagrPct: number | null;
  marginOfSafetyPct: number | null;
  riskRewardRatio: number | null;
  readinessScore: number | null;
}

export interface PeerCompsTable {
  rows: PeerCompRow[];
  medians: PeerCompsMedians;
}

function medianOf(values: readonly number[]): number | null {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  const a = sorted[mid] ?? 0;
  if (sorted.length % 2 === 1) return roundTo(a, 1);
  const b = sorted[mid - 1] ?? a;
  return roundTo((a + b) / 2, 1);
}

function buildPeerRow(thesis: ThesisDetail, quote: MarketQuoteSnapshot | undefined): PeerCompRow {
  const livePrice =
    quote?.effectivePrice && quote.effectivePrice > 0 ? quote.effectivePrice : thesis.currentPrice;
  const activeVal =
    Math.abs(livePrice - thesis.currentPrice) > 0.001
      ? calculateValuationScenarios({ ...thesis.valuationInput, currentPrice: livePrice })
      : thesis.valuation;
  const exp = calculateImpliedExpectations({ summary: activeVal });
  const readiness = calculateResearchReadiness(thesis);
  const kelly = suggestKellyCappedWeight({
    ...thesis,
    currentPrice: livePrice,
    valuation: activeVal,
  });
  const drawdownFrom52wHighPct =
    quote?.fiftyTwoWeekHigh && quote.fiftyTwoWeekHigh > 0
      ? roundTo(((livePrice - quote.fiftyTwoWeekHigh) / quote.fiftyTwoWeekHigh) * 100, 1)
      : null;

  return {
    thesisId: thesis.id,
    ticker: thesis.ticker,
    companyName: thesis.companyName,
    sectorTag: thesis.sectorTag,
    anchorPrice: thesis.currentPrice,
    livePrice,
    sessionState: quote?.sessionState ?? null,
    dayChangePct: quote?.regularChangePct ?? null,
    drawdownFrom52wHighPct,
    baseTargetPrice: activeVal.base.targetPrice,
    upsidePct: activeVal.upsidePct,
    baseCagrPct: activeVal.base.cagrPct,
    marginOfSafetyPct: exp.marginOfSafetyPct,
    riskRewardRatio: activeVal.riskRewardRatio,
    basePeMultiple: activeVal.base.peMultiple,
    hurdleEntry15: exp.hurdleEntry15,
    belowHurdle15: livePrice <= exp.hurdleEntry15,
    readinessScore: readiness.scorePct,
    currentWeightPct: thesis.currentWeightPct,
    kellyMaxPct: kelly.maxPct,
    weightGapPct: roundTo(kelly.maxPct - thesis.currentWeightPct, 1),
    upcomingCatalysts: thesis.catalysts.filter((c) => c.status === "upcoming").length,
    warningCount: thesis.hypotheses.filter((h) => h.status === "warning").length,
  };
}

export function calculatePeerCompsTable(
  theses: readonly ThesisDetail[],
  liveQuotes?: Readonly<Record<string, MarketQuoteSnapshot>>,
): PeerCompsTable {
  const active = theses.filter((t) => t.status === "active");
  const rows = active.map((thesis) => buildPeerRow(thesis, liveQuotes?.[thesis.ticker]));
  const rrFinite = rows
    .map((r) => r.riskRewardRatio)
    .filter((v): v is number => v !== null && Number.isFinite(v));

  return {
    rows,
    medians: {
      upsidePct: medianOf(rows.map((r) => r.upsidePct)),
      baseCagrPct: medianOf(rows.map((r) => r.baseCagrPct)),
      marginOfSafetyPct: medianOf(rows.map((r) => r.marginOfSafetyPct)),
      riskRewardRatio: medianOf(rrFinite),
      readinessScore: medianOf(rows.map((r) => r.readinessScore)),
    },
  };
}
