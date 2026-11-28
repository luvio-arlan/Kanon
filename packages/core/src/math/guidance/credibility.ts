import type { GuidanceCommitment, GuidanceCredibility } from "../../contracts/intel";
import { roundTo } from "../valuation-scenarios";

function buildPeriodKey(item: GuidanceCommitment): string {
  return `${item.metric}:${item.customLabel ?? ""}:${item.targetFiscalYear ?? "x"}:${item.targetFiscalPeriod ?? "x"}`;
}

function selectChainEndpoints(items: readonly GuidanceCommitment[]): {
  initials: GuidanceCommitment[];
  latests: GuidanceCommitment[];
  revisionsPerPeriod: number | null;
} {
  const chains = new Map<string, GuidanceCommitment[]>();
  for (const item of items) {
    if (item.status !== "confirmed" && item.status !== "superseded") continue;
    const key = buildPeriodKey(item);
    const list = chains.get(key) ?? [];
    list.push(item);
    chains.set(key, list);
  }
  const initials: GuidanceCommitment[] = [];
  const latests: GuidanceCommitment[] = [];
  let totalChainLen = 0;
  for (const list of chains.values()) {
    list.sort((a, b) => a.issuedOn.localeCompare(b.issuedOn) || a.id.localeCompare(b.id));
    totalChainLen += list.length;
    const earliest = list[0];
    const latest = list[list.length - 1];
    if (earliest) initials.push(earliest);
    if (latest) latests.push(latest);
  }
  const revisionsPerPeriod = chains.size > 0 ? roundTo(totalChainLen / chains.size - 1, 2) : null;
  return { initials, latests, revisionsPerPeriod };
}

function summarizeRatio(items: readonly GuidanceCommitment[]): string | null {
  const scored = items.filter((x) => x.outcome !== null && x.outcome !== "unresolvable");
  if (scored.length < 4) return null;
  const kept = scored.filter((x) => x.outcome === "beat" || x.outcome === "in_line").length;
  return `${kept}/${scored.length}`;
}

function classifyStyle(
  resolved: number,
  beat: number,
  miss: number,
  meanSurprisePct: number | null,
): GuidanceCredibility["style"] {
  if (resolved < 6) return null;
  if (meanSurprisePct !== null && meanSurprisePct >= 1 && beat / resolved >= 0.6) {
    return "conservative";
  }
  if (miss / resolved >= 0.4) return "aggressive";
  return "balanced";
}

/**
 * Computes management guidance credibility anchored on the EARLIEST issued commitment per period
 * (`confirmed ∪ superseded`) so management cannot game credibility by revising late (U0-6 / P0-4).
 */
export function computeGuidanceCredibility(
  items: readonly GuidanceCommitment[],
): GuidanceCredibility {
  const { initials, latests, revisionsPerPeriod } = selectChainEndpoints(items);
  const scored = initials.filter(
    (item) => item.outcome !== null && item.outcome !== "unresolvable",
  );
  const resolved = scored.length;
  const beat = scored.filter((x) => x.outcome === "beat").length;
  const inLine = scored.filter((x) => x.outcome === "in_line").length;
  const miss = scored.filter((x) => x.outcome === "miss").length;
  const kept = beat + inLine;
  const usdSurprises = scored
    .filter((x) => (x.unit === "usd" || x.unit === "usd_per_share") && x.surprise !== null)
    .map((x) => x.surprise as number);
  const meanSurprisePct =
    usdSurprises.length > 0
      ? roundTo(usdSurprises.reduce((a, b) => a + b, 0) / usdSurprises.length, 2)
      : null;
  const initialKeptRatio = resolved >= 4 ? `${kept}/${resolved}` : null;
  const latestKeptRatio = summarizeRatio(latests);

  return {
    resolved,
    kept,
    beat,
    miss,
    initialKeptRatio,
    latestKeptRatio,
    keptRatio: initialKeptRatio,
    meanSurprisePct,
    style: classifyStyle(resolved, beat, miss, meanSurprisePct),
    revisionsPerPeriod,
  };
}
