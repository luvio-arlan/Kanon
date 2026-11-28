import type {
  FilingRedlineResponse,
  RedlineChange,
  RedlineSection,
  RedlineStats,
} from "@kanon/core";
import { alignSectionParagraphs, indexParagraphs } from "./align";
import { classifyAlignedChanges } from "./classify";
import { computeNormHash } from "./normalize";
import { type ComparableFilingCandidate, findComparablePriorFiling } from "./pairing";
import { readBoundedTextStream, resolvePrimaryDocUrl } from "./primary-doc";
import { extractFilingSectionParagraphs, MAX_REDLINE_HTML_BYTES } from "./section-extractor";

export const REDLINE_ALGO_VERSION = "redline/2";

export {
  type ComparableFilingCandidate,
  computeNormHash,
  extractFilingSectionParagraphs,
  findComparablePriorFiling,
  MAX_REDLINE_HTML_BYTES,
  readBoundedTextStream,
  resolvePrimaryDocUrl,
};

export interface BuildFilingRedlineInput {
  ticker: string;
  section: RedlineSection;
  current: ComparableFilingCandidate;
  previous: ComparableFilingCandidate;
  currentHtml: string;
  previousHtml: string;
}

export interface BuildFilingRedlineOutput {
  response: FilingRedlineResponse;
  currentChunks: Array<{ id: string; paraIndex: number; text: string; normHash: string }>;
  previousChunks: Array<{ id: string; paraIndex: number; text: string; normHash: string }>;
}

function toFilingRef(f: ComparableFilingCandidate) {
  return { accession: f.accession, form: f.form, filedAt: f.filedAt, periodEnd: f.periodEnd };
}

function recordChangeStat(stats: RedlineStats, c: RedlineChange) {
  if (c.severity === "critical") stats.critical += 1;
  if (c.kind === "numbers_only") {
    stats.numbersOnly += 1;
    return;
  }
  if (c.previousChunkId === null && c.currentChunkId !== null) {
    stats.added += 1;
    return;
  }
  if (c.currentChunkId === null && c.previousChunkId !== null) {
    stats.removed += 1;
    return;
  }
  stats.modified += 1;
}

function summarizeStats(changes: readonly RedlineChange[]): RedlineStats {
  const stats: RedlineStats = { added: 0, removed: 0, modified: 0, numbersOnly: 0, critical: 0 };
  for (const c of changes) recordChangeStat(stats, c);
  return stats;
}

function buildEmptyOutput(
  input: BuildFilingRedlineInput,
  status: "too_large" | "section_missing",
): BuildFilingRedlineOutput {
  return {
    response: {
      ticker: input.ticker.toUpperCase(),
      status,
      algoVersion: REDLINE_ALGO_VERSION,
      current: toFilingRef(input.current),
      previous: toFilingRef(input.previous),
      stats: null,
      changes: [],
    },
    currentChunks: [],
    previousChunks: [],
  };
}

function buildNoMaterialChangesOutput(
  input: BuildFilingRedlineInput,
  firstParagraph: string | undefined,
): BuildFilingRedlineOutput {
  const infoChange: RedlineChange = {
    id: `${input.section}:${input.current.accession}:no_material_changes`,
    section: input.section,
    kind: "rewritten",
    severity: "info",
    currentChunkId: `${input.current.accession}:${input.section}:0`,
    previousChunkId: null,
    similarity: 1,
    tokens: [{ op: "eq", text: firstParagraph ?? "No material changes." }],
    cues: ["no material changes"],
  };
  return {
    response: {
      ticker: input.ticker.toUpperCase(),
      status: "ready",
      algoVersion: REDLINE_ALGO_VERSION,
      current: toFilingRef(input.current),
      previous: toFilingRef(input.previous),
      stats: { added: 0, removed: 0, modified: 0, numbersOnly: 0, critical: 0 },
      changes: [infoChange],
    },
    currentChunks: [],
    previousChunks: [],
  };
}

function toChunkPayload(indexed: ReturnType<typeof indexParagraphs>) {
  return indexed.map((p, idx) => ({
    id: p.chunkId,
    paraIndex: idx,
    text: p.text,
    normHash: p.normHash,
  }));
}

/** Deterministic end-to-end SEC filing cross-period Redline builder (`redline/1`) (R1). */
export function buildFilingRedline(input: BuildFilingRedlineInput): BuildFilingRedlineOutput {
  const curExt = extractFilingSectionParagraphs({
    rawHtml: input.currentHtml,
    form: input.current.form,
    section: input.section,
  });
  const prevExt = extractFilingSectionParagraphs({
    rawHtml: input.previousHtml,
    form: input.previous.form,
    section: input.section,
  });
  if (curExt.status === "too_large" || prevExt.status === "too_large") {
    return buildEmptyOutput(input, "too_large");
  }
  if (curExt.status === "no_material_changes") {
    return buildNoMaterialChangesOutput(input, curExt.paragraphs[0]);
  }
  if (curExt.status === "section_missing" || prevExt.status === "section_missing") {
    return buildEmptyOutput(input, "section_missing");
  }
  const currIdx = indexParagraphs(input.current.accession, input.section, curExt.paragraphs);
  const prevIdx = indexParagraphs(input.previous.accession, input.section, prevExt.paragraphs);
  const changes = classifyAlignedChanges(input.section, alignSectionParagraphs(currIdx, prevIdx));
  return {
    response: {
      ticker: input.ticker.toUpperCase(),
      status: "ready",
      algoVersion: REDLINE_ALGO_VERSION,
      current: toFilingRef(input.current),
      previous: toFilingRef(input.previous),
      stats: summarizeStats(changes),
      changes,
    },
    currentChunks: toChunkPayload(currIdx),
    previousChunks: toChunkPayload(prevIdx),
  };
}
