import type { GuidanceCommitment, GuidanceCredibility } from "../../contracts/intel";
import { roundTo } from "../valuation-scenarios";

function buildPeriodKey(item: GuidanceCommitment): string {
  return `${item.metric}:${item.customLabel ?? ""}:${item.targetFiscalYear ?? "x"}:${item.targetFiscalPeriod ?? "x"}`;
}

function selectInitialConfirmedPerPeriod(items: readonly GuidanceCommitment[]): {
  initials: GuidanceCommitment[];
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
  let totalChainLen = 0;
  for (const list of chains.values()) {
    list.sort((a, b) => a.issuedOn.localeCompare(b.issuedOn) || a.id.localeCompare(b.id));
    totalChainLen += list.length;
    const first = list.find((x) => x.status === "confirmed") ?? list[0];
    if (first && first.status === "confirmed") initials.push(first);
  }
  const revisionsPerPeriod = chains.size > 0 ? roundTo(totalChainLen / chains.size - 1, 2) : null;
  return { initials, revisionsPerPeriod };
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

/** Computes management guidance credibility summary strictly from confirmed resolved commitments (R3). */
export function computeGuidanceCredibility(
  items: readonly GuidanceCommitment[],
): GuidanceCredibility {
  const { initials, revisionsPerPeriod } = selectInitialConfirmedPerPeriod(items);
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

  return {
    resolved,
    kept,
    beat,
    miss,
    keptRatio: resolved >= 4 ? `${kept}/${resolved}` : null,
    meanSurprisePct,
    style: classifyStyle(resolved, beat, miss, meanSurprisePct),
    revisionsPerPeriod,
  };
}
