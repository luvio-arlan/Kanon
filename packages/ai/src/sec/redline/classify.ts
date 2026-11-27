import type { RedlineChange, RedlineChangeKind, RedlineSection } from "@kanon/core";
import type { AlignedParagraphChange } from "./align";
import {
  CRITICAL_RISK_PHRASES,
  DEFINITION_CHANGE_PHRASES,
  HEDGING_AND_NEGATIVE_WORDS,
  OPTIMISM_WORDS,
} from "./lexicon";

function findMatchingLabels(
  text: string,
  rules: readonly { label: string; re: RegExp }[],
): string[] {
  return rules.filter((r) => r.re.test(text)).map((r) => r.label);
}

function countLexiconHits(text: string, words: ReadonlySet<string>): number {
  let count = 0;
  for (const tok of text.toLowerCase().split(/[^a-z-]+/)) {
    if (tok && words.has(tok)) count += 1;
  }
  return count;
}

function classifyAdded(section: RedlineSection, text: string) {
  const crit = findMatchingLabels(text, CRITICAL_RISK_PHRASES);
  const defs = findMatchingLabels(text, DEFINITION_CHANGE_PHRASES);
  let kind: RedlineChangeKind = "rewritten";
  if (section === "risk_factors" || crit.length > 0) kind = "added_risk";
  else if (defs.length > 0) kind = "definition_change";
  const severity: RedlineChange["severity"] =
    crit.length > 0 ? "critical" : section === "risk_factors" || defs.length > 0 ? "warn" : "info";
  return { kind, severity, cues: [...crit, ...defs].slice(0, 12) };
}

function classifyRemoved(section: RedlineSection, prevText: string) {
  const optDrop = countLexiconHits(prevText, OPTIMISM_WORDS);
  const isMdaOpt = section === "mda" && optDrop >= 2;
  return {
    kind: (isMdaOpt ? "optimism_removed" : "removed_risk") as RedlineChangeKind,
    severity: (isMdaOpt ? "warn" : "info") as RedlineChange["severity"],
    cues: isMdaOpt ? [`optimism -${optDrop}`] : [],
  };
}

function classifyModified(section: RedlineSection, currText: string, prevText: string) {
  const prevCrit = new Set(findMatchingLabels(prevText, CRITICAL_RISK_PHRASES));
  const newCrit = findMatchingLabels(currText, CRITICAL_RISK_PHRASES).filter(
    (l) => !prevCrit.has(l),
  );
  const defHits = findMatchingLabels(currText, DEFINITION_CHANGE_PHRASES);
  const hedgeDelta =
    countLexiconHits(currText, HEDGING_AND_NEGATIVE_WORDS) -
    countLexiconHits(prevText, HEDGING_AND_NEGATIVE_WORDS);
  const optDelta =
    countLexiconHits(prevText, OPTIMISM_WORDS) - countLexiconHits(currText, OPTIMISM_WORDS);

  if (newCrit.length > 0)
    return { kind: "hedging_up" as const, severity: "critical" as const, cues: newCrit };
  if (defHits.length > 0)
    return { kind: "definition_change" as const, severity: "warn" as const, cues: defHits };
  if (hedgeDelta >= 2)
    return {
      kind: "hedging_up" as const,
      severity: "warn" as const,
      cues: [`hedging +${hedgeDelta}`],
    };
  if (section === "mda" && optDelta >= 2) {
    return {
      kind: "optimism_removed" as const,
      severity: "warn" as const,
      cues: [`optimism -${optDelta}`],
    };
  }
  return { kind: "rewritten" as const, severity: "info" as const, cues: [] as string[] };
}

function mapSingleChange(
  section: RedlineSection,
  item: AlignedParagraphChange,
  idx: number,
): RedlineChange {
  const id =
    `${section}:${item.current?.chunkId ?? "none"}:${item.previous?.chunkId ?? "none"}:${idx}`.slice(
      0,
      160,
    );
  const base = {
    id,
    section,
    currentChunkId: item.current?.chunkId ?? null,
    previousChunkId: item.previous?.chunkId ?? null,
    similarity: item.similarity,
    tokens: item.tokens,
  };
  if (item.kind === "numbers_only")
    return { ...base, kind: "numbers_only", severity: "info", cues: [] };
  if (item.kind === "added")
    return { ...base, ...classifyAdded(section, item.current?.text ?? "") };
  if (item.kind === "removed")
    return { ...base, ...classifyRemoved(section, item.previous?.text ?? "") };
  const cls = classifyModified(section, item.current?.text ?? "", item.previous?.text ?? "");
  return { ...base, kind: cls.kind, severity: cls.severity, cues: cls.cues.slice(0, 12) };
}

export function classifyAlignedChanges(
  section: RedlineSection,
  aligned: readonly AlignedParagraphChange[],
): RedlineChange[] {
  const severityRank = { critical: 0, warn: 1, info: 2 };
  return aligned
    .map((item, idx) => mapSingleChange(section, item, idx))
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || a.id.localeCompare(b.id))
    .slice(0, 400);
}
