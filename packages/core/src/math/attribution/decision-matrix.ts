import type {
  DecisionEpisode,
  DecisionQuadrant,
  PortfolioAttributionResponse,
} from "../../contracts/analytics";
import type { HypothesisStatus } from "../../schemas/thesis";
import {
  buildTotalReturnIndex,
  type CashDividendEvent,
  type CloseBarPoint,
} from "../performance/benchmark-tr";
import { roundTo } from "../valuation-scenarios";
import { computePitBeta } from "./beta-pit";
import type { RawDecisionEpisode } from "./episodes";

export interface HypothesisStatusEventInput {
  thesisId: string;
  hypothesisId: string;
  toStatus: HypothesisStatus;
  recordedAt: string;
}

function evaluatePitJudgment(
  ep: RawDecisionEpisode,
  events: readonly HypothesisStatusEventInput[],
  cutoffIso: string,
): {
  verdict: "right" | "wrong" | "pending";
  total: number;
  validated: number;
  invalidated: number;
} {
  if (!ep.thesisId) return { verdict: "pending", total: 0, validated: 0, invalidated: 0 };
  const latestByHyp = new Map<string, HypothesisStatus>();
  const relevant = events
    .filter((e) => e.thesisId === ep.thesisId && e.recordedAt.slice(0, 10) <= cutoffIso)
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  for (const ev of relevant) latestByHyp.set(ev.hypothesisId, ev.toStatus);
  const ids =
    ep.snapshotHypothesisIds.length > 0 ? ep.snapshotHypothesisIds : [...latestByHyp.keys()];
  if (ids.length === 0) return { verdict: "pending", total: 0, validated: 0, invalidated: 0 };
  let validated = 0;
  let invalidated = 0;
  for (const id of ids) {
    const st = latestByHyp.get(id);
    if (st === "validated") validated += 1;
    else if (st === "invalidated") invalidated += 1;
  }
  if (invalidated > 0) return { verdict: "wrong", total: ids.length, validated, invalidated };
  if (validated / ids.length >= 0.6)
    return { verdict: "right", total: ids.length, validated, invalidated };
  return { verdict: "pending", total: ids.length, validated, invalidated };
}

function mapQuadrant(
  verdict: "right" | "wrong" | "pending",
  outcomePositive: boolean,
): DecisionQuadrant {
  if (verdict === "pending") return "pending";
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

function classifySingleEpisode(
  ep: RawDecisionEpisode,
  spyTr: ReadonlyMap<string, number>,
  params: {
    hypothesisEvents: readonly HypothesisStatusEventInput[];
    barsByTicker: ReadonlyMap<string, readonly CloseBarPoint[]>;
    dividendsByTicker: ReadonlyMap<string, readonly CashDividendEvent[]>;
    spyBars: readonly CloseBarPoint[];
    spyDividends: readonly CashDividendEvent[];
    asOfDate: string;
  },
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
  const idioReturnPct =
    spyReturnPct !== null ? roundTo(ep.totalReturnPct - (pitBeta ?? 1) * spyReturnPct, 2) : null;
  const judgment = evaluatePitJudgment(ep, params.hypothesisEvents, endDate);
  const quadrant = mapQuadrant(judgment.verdict, (idioReturnPct ?? ep.totalReturnPct) >= 0);
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
    spyReturnPct,
    pitBeta,
    idioReturnPct,
    judgmentVerdict: judgment.verdict,
    quadrant,
    snapshotHash: ep.snapshotHash,
    hypothesesCount: judgment.total,
    validatedCount: judgment.validated,
    invalidatedCount: judgment.invalidated,
  };
}

/** Classifies investment episodes into the 2x2 Decision x Outcome matrix with PIT Beta & PIT hypothesis verdicts (S3). */
export function classifyDecisionMatrix(params: {
  episodes: readonly RawDecisionEpisode[];
  hypothesisEvents: readonly HypothesisStatusEventInput[];
  barsByTicker: ReadonlyMap<string, readonly CloseBarPoint[]>;
  dividendsByTicker: ReadonlyMap<string, readonly CashDividendEvent[]>;
  spyBars: readonly CloseBarPoint[];
  spyDividends: readonly CashDividendEvent[];
  asOfDate: string;
}): PortfolioAttributionResponse {
  if (params.episodes.length === 0) {
    return {
      status: "empty",
      counts: { skill: 0, good_process_bad_luck: 0, lucky: 0, mistake: 0, pending: 0 },
      skillRatePct: null,
      episodes: [],
    };
  }
  const spyTr = buildTotalReturnIndex(params.spyBars, params.spyDividends);
  const counts = { skill: 0, good_process_bad_luck: 0, lucky: 0, mistake: 0, pending: 0 };
  const classified = params.episodes.map((ep) => {
    const row = classifySingleEpisode(ep, spyTr, params);
    counts[row.quadrant] += 1;
    return row;
  });
  const resolved = counts.skill + counts.good_process_bad_luck + counts.lucky + counts.mistake;
  return {
    status: "ready",
    counts,
    skillRatePct: resolved > 0 ? roundTo((counts.skill / resolved) * 100, 1) : null,
    episodes: classified,
  };
}
