import type { EpisodePendingReason } from "../../contracts/analytics";
import type { HypothesisEventSource } from "../../db/schema-decisions";
import type { HypothesisStatus } from "../../schemas/thesis";
import type { RawDecisionEpisode } from "./episodes";

export interface HypothesisStatusEventInput {
  thesisId: string;
  hypothesisId: string;
  toStatus: HypothesisStatus;
  recordedAt: string;
  source?: HypothesisEventSource;
}

export interface JudgmentEval {
  verdict: "right" | "wrong" | "pending";
  pendingReason: EpisodePendingReason | null;
  total: number;
  validated: number;
  invalidated: number;
}

function effectiveEventTimestamp(
  ev: HypothesisStatusEventInput,
  migration0033AppliedAt?: string | null,
): string {
  if (ev.source === "import" && migration0033AppliedAt) {
    return ev.recordedAt > migration0033AppliedAt ? ev.recordedAt : migration0033AppliedAt;
  }
  return ev.recordedAt;
}

function tallySnapshotVerdict(
  snapshotIds: readonly string[],
  latestByHyp: ReadonlyMap<string, HypothesisStatus>,
): JudgmentEval {
  let validated = 0;
  let invalidated = 0;
  for (const id of snapshotIds) {
    const st = latestByHyp.get(id);
    if (st === "validated") validated += 1;
    else if (st === "invalidated") invalidated += 1;
  }
  const total = snapshotIds.length;
  if (invalidated > 0)
    return { verdict: "wrong", pendingReason: null, total, validated, invalidated };
  if (validated / total >= 0.6) {
    return { verdict: "right", pendingReason: null, total, validated, invalidated };
  }
  return { verdict: "pending", pendingReason: "hypotheses_open", total, validated, invalidated };
}

/**
 * Evaluates PIT hypothesis judgment strictly on snapshot-locked hypotheses while clamping
 * migration `0033` backfill events to `max(recordedAt, appliedAt_0033)` (U0-8 / P1-7).
 */
export function evaluatePitJudgment(
  ep: RawDecisionEpisode,
  events: readonly HypothesisStatusEventInput[],
  cutoffIso: string,
  migration0033AppliedAt?: string | null,
): JudgmentEval {
  if (!ep.thesisId || ep.snapshotHypothesisIds.length === 0) {
    return {
      verdict: "pending",
      pendingReason: "no_snapshot",
      total: 0,
      validated: 0,
      invalidated: 0,
    };
  }
  const thesisEvents = events.filter((e) => e.thesisId === ep.thesisId);
  const cutoffDate = cutoffIso.slice(0, 10);
  const effectiveEvents = thesisEvents
    .map((e) => ({ ...e, effAt: effectiveEventTimestamp(e, migration0033AppliedAt) }))
    .filter((e) => e.effAt.slice(0, 10) <= cutoffDate)
    .sort((a, b) => a.effAt.localeCompare(b.effAt));
  if (
    effectiveEvents.length === 0 &&
    migration0033AppliedAt &&
    cutoffDate < migration0033AppliedAt.slice(0, 10) &&
    thesisEvents.some((e) => e.source === "import")
  ) {
    return {
      verdict: "pending",
      pendingReason: "pre_history",
      total: ep.snapshotHypothesisIds.length,
      validated: 0,
      invalidated: 0,
    };
  }
  const latestByHyp = new Map<string, HypothesisStatus>();
  for (const ev of effectiveEvents) latestByHyp.set(ev.hypothesisId, ev.toStatus);
  return tallySnapshotVerdict(ep.snapshotHypothesisIds, latestByHyp);
}
