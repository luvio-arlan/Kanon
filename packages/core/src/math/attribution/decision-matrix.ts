import type {
  DecisionEpisode,
  DecisionQuadrant,
  EpisodePendingReason,
  OutcomeBasis,
  PortfolioAttributionResponse,
} from "../../contracts/analytics";
import {
  buildTotalReturnIndex,
  type CashDividendEvent,
  type CloseBarPoint,
} from "../performance/benchmark-tr";
import { roundTo } from "../valuation-scenarios";
import { computePitBeta } from "./beta-pit";
import type { RawDecisionEpisode } from "./episodes";
import {
  evaluatePitJudgment,
  type HypothesisStatusEventInput,
  type JudgmentEval,
} from "./pit-judgment";

export type { HypothesisStatusEventInput } from "./pit-judgment";

interface MatrixContext {
  hypothesisEvents: readonly HypothesisStatusEventInput[];
  barsByTicker: ReadonlyMap<string, readonly CloseBarPoint[]>;
  dividendsByTicker: ReadonlyMap<string, readonly CashDividendEvent[]>;
  spyBars: readonly CloseBarPoint[];
  spyDividends: readonly CashDividendEvent[];
  asOfDate: string;
  migration0033AppliedAt?: string | null;
}

function mapQuadrant(
  verdict: "right" | "wrong" | "pending",
  outcomeBasis: OutcomeBasis,
  idioReturnPct: number | null,
): DecisionQuadrant {
  if (verdict === "pending" || outcomeBasis === "unavailable" || idioReturnPct === null) {
    return "pending";
  }
  const outcomePositive = idioReturnPct >= 0;
  if (verdict === "right") return outcomePositive ? "skill" : "good_process_bad_luck";
  return outcomePositive ? "lucky" : "mistake";
}

function lookupSpyReturnPct(
  trIndex: ReadonlyMap<string, number>,
  openDate: string,
  endDate: string,
): number | null {
  let startVal: number | null = null;
  let endVal: number | null = null;
  for (const [d, v] of trIndex) {
    if (d <= openDate) startVal = v;
    if (d <= endDate) endVal = v;
  }
  if (!startVal || !endVal || startVal <= 0) return null;
  return roundTo(((endVal - startVal) / startVal) * 100, 2);
}

function computeOutcomeMetric(
  totalReturnPct: number,
  spyReturnPct: number | null,
  pitBeta: number | null,
): { outcomeBasis: OutcomeBasis; idioReturnPct: number | null } {
  if (spyReturnPct === null) return { outcomeBasis: "unavailable", idioReturnPct: null };
  if (pitBeta !== null) {
    return {
      outcomeBasis: "idiosyncratic",
      idioReturnPct: roundTo(totalReturnPct - pitBeta * spyReturnPct, 2),
    };
  }
  return {
    outcomeBasis: "excess_vs_spy",
    idioReturnPct: roundTo(totalReturnPct - spyReturnPct, 2),
  };
}

function buildEpisodeRow(
  ep: RawDecisionEpisode,
  calc: {
    spyReturnPct: number | null;
    pitBeta: number | null;
    idioReturnPct: number | null;
    outcomeBasis: OutcomeBasis;
    pendingReason: EpisodePendingReason | null;
    quadrant: DecisionQuadrant;
    judgment: JudgmentEval;
  },
): DecisionEpisode {
  return {
    id: ep.id,
    thesisId: ep.thesisId,
    ticker: ep.ticker,
    openDate: ep.openDate,
    closeDate: ep.closeDate,
    status: ep.status,
    entryPrice: ep.entryPrice,
    exitOrMarkPrice: ep.exitOrMarkPrice,
    totalReturnPct: ep.totalReturnPct,
    spyReturnPct: calc.spyReturnPct,
    pitBeta: calc.pitBeta,
    idioReturnPct: calc.idioReturnPct,
    outcomeBasis: calc.outcomeBasis,
    pendingReason: calc.pendingReason,
    judgmentVerdict: calc.judgment.verdict,
    quadrant: calc.quadrant,
    snapshotHash: ep.snapshotHash,
    hypothesesCount: calc.judgment.total,
    validatedCount: calc.judgment.validated,
    invalidatedCount: calc.judgment.invalidated,
  };
}

function classifySingleEpisode(
  ep: RawDecisionEpisode,
  spyTr: ReadonlyMap<string, number>,
  params: MatrixContext,
): DecisionEpisode {
  const endDate = ep.closeDate ?? params.asOfDate;
  const spyReturnPct = lookupSpyReturnPct(spyTr, ep.openDate, endDate);
  const pitBeta = computePitBeta({
    assetBars: params.barsByTicker.get(ep.ticker) ?? [],
    assetDividends: params.dividendsByTicker.get(ep.ticker) ?? [],
    spyBars: params.spyBars,
    spyDividends: params.spyDividends,
    openDate: ep.openDate,
  });
  const { outcomeBasis, idioReturnPct } = computeOutcomeMetric(
    ep.totalReturnPct,
    spyReturnPct,
    pitBeta,
  );
  const judgment = evaluatePitJudgment(
    ep,
    params.hypothesisEvents,
    endDate,
    params.migration0033AppliedAt,
  );
  const quadrant = mapQuadrant(judgment.verdict, outcomeBasis, idioReturnPct);
  const pendingReason: EpisodePendingReason | null =
    quadrant === "pending"
      ? (judgment.pendingReason ?? (outcomeBasis === "unavailable" ? "no_benchmark" : null))
      : null;
  return buildEpisodeRow(ep, {
    spyReturnPct,
    pitBeta,
    idioReturnPct,
    outcomeBasis,
    pendingReason,
    quadrant,
    judgment,
  });
}

/**
 * Classifies investment episodes into the 2x2 Decision x Outcome matrix with honest PIT Beta,
 * explicit outcomeBasis, anti-lookahead import timestamps, and strict snapshot-only hypotheses (U0-8 / G21).
 */
export function classifyDecisionMatrix(
  params: MatrixContext & { episodes: readonly RawDecisionEpisode[] },
): PortfolioAttributionResponse {
  if (params.episodes.length === 0) {
    return {
      status: "empty",
      counts: { skill: 0, good_process_bad_luck: 0, lucky: 0, mistake: 0, pending: 0 },
      outcomeBasisCounts: { idiosyncratic: 0, excess_vs_spy: 0, unavailable: 0 },
      skillRatePct: null,
      episodes: [],
    };
  }
  const spyTr = buildTotalReturnIndex(params.spyBars, params.spyDividends);
  const counts = { skill: 0, good_process_bad_luck: 0, lucky: 0, mistake: 0, pending: 0 };
  const outcomeBasisCounts = { idiosyncratic: 0, excess_vs_spy: 0, unavailable: 0 };
  const classified = params.episodes.map((ep) => {
    const row = classifySingleEpisode(ep, spyTr, params);
    counts[row.quadrant] += 1;
    outcomeBasisCounts[row.outcomeBasis] += 1;
    return row;
  });
  const resolved = counts.skill + counts.good_process_bad_luck + counts.lucky + counts.mistake;
  return {
    status: "ready",
    counts,
    outcomeBasisCounts,
    skillRatePct: resolved > 0 ? roundTo((counts.skill / resolved) * 100, 1) : null,
    episodes: classified,
  };
}
