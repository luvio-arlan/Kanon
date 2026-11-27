import type { RedlineToken } from "@kanon/core";
import {
  baseNormalize,
  buildTrigramShingles,
  computeNormHash,
  computeNumbersHash,
  jaccardSortedShingles,
} from "./normalize";

export interface IndexedParagraph {
  chunkId: string;
  text: string;
  normHash: string;
  numbersHash: string;
  shingles: number[];
}

export interface AlignedParagraphChange {
  kind: "added" | "removed" | "modified" | "numbers_only";
  current: IndexedParagraph | null;
  previous: IndexedParagraph | null;
  similarity: number | null;
  tokens: RedlineToken[];
}

const MAX_PAIR_PRODUCT = 250_000;
const MAX_DIFF_TOKENS = 600;

export function indexParagraphs(
  accession: string,
  sectionCode: string,
  paragraphs: readonly string[],
): IndexedParagraph[] {
  return paragraphs.map((text, idx) => ({
    chunkId: `${accession}:${sectionCode}:${idx}`,
    text,
    normHash: computeNormHash(text),
    numbersHash: computeNumbersHash(text),
    shingles: buildTrigramShingles(text),
  }));
}

function buildLcsTable(a: readonly string[], b: readonly string[]): Int32Array[] {
  const m = a.length;
  const n = b.length;
  const dp: Int32Array[] = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
  for (let i = m - 1; i >= 0; i -= 1) {
    const row = dp[i];
    const nextRow = dp[i + 1];
    if (!row || !nextRow) continue;
    for (let j = n - 1; j >= 0; j -= 1) {
      row[j] =
        a[i] === b[j] ? (nextRow[j + 1] ?? 0) + 1 : Math.max(nextRow[j] ?? 0, row[j + 1] ?? 0);
    }
  }
  return dp;
}

function appendMergedToken(out: RedlineToken[], op: RedlineToken["op"], word: string) {
  const prev = out[out.length - 1];
  if (prev && prev.op === op && prev.text.length + word.length + 1 <= 3900) {
    prev.text = `${prev.text} ${word}`;
  } else if (out.length < MAX_DIFF_TOKENS) {
    out.push({ op, text: word });
  }
}

function appendRemainingWords(
  out: RedlineToken[],
  words: readonly string[],
  start: number,
  op: "del" | "ins",
) {
  for (let k = start; k < words.length; k += 1) appendMergedToken(out, op, words[k] ?? "");
}

export function computeWordDiffTokens(prevText: string, currText: string): RedlineToken[] {
  const a = baseNormalize(prevText).split(" ").filter(Boolean).slice(0, 260);
  const b = baseNormalize(currText).split(" ").filter(Boolean).slice(0, 260);
  const dp = buildLcsTable(a, b);
  const out: RedlineToken[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      appendMergedToken(out, "eq", b[j] ?? "");
      i += 1;
      j += 1;
    } else if ((dp[i + 1]?.[j] ?? 0) >= (dp[i]?.[j + 1] ?? 0)) {
      appendMergedToken(out, "del", a[i] ?? "");
      i += 1;
    } else {
      appendMergedToken(out, "ins", b[j] ?? "");
      j += 1;
    }
  }
  appendRemainingWords(out, a, i, "del");
  appendRemainingWords(out, b, j, "ins");
  return out;
}

function matchByHash(
  curr: readonly IndexedParagraph[],
  prev: readonly IndexedParagraph[],
  key: "normHash" | "numbersHash",
  usedCurr: Set<number>,
  usedPrev: Set<number>,
): Array<{ ci: number; pi: number }> {
  const prevQueues = new Map<string, number[]>();
  for (let pi = 0; pi < prev.length; pi += 1) {
    if (usedPrev.has(pi)) continue;
    const h = prev[pi]?.[key] ?? "";
    const q = prevQueues.get(h) ?? [];
    q.push(pi);
    prevQueues.set(h, q);
  }
  const pairs: Array<{ ci: number; pi: number }> = [];
  for (let ci = 0; ci < curr.length; ci += 1) {
    if (usedCurr.has(ci)) continue;
    const pi = prevQueues.get(curr[ci]?.[key] ?? "")?.shift();
    if (pi !== undefined) {
      usedCurr.add(ci);
      usedPrev.add(pi);
      pairs.push({ ci, pi });
    }
  }
  return pairs;
}

function collectShingleCandidates(
  curr: readonly IndexedParagraph[],
  prev: readonly IndexedParagraph[],
  remCurr: readonly number[],
  remPrev: readonly number[],
): Array<{ ci: number; pi: number; sim: number }> {
  const cap =
    remCurr.length * remPrev.length > MAX_PAIR_PRODUCT
      ? Math.floor(Math.sqrt(MAX_PAIR_PRODUCT))
      : Number.POSITIVE_INFINITY;
  const cands: Array<{ ci: number; pi: number; sim: number }> = [];
  for (const ci of remCurr.slice(0, cap)) {
    const cShingles = curr[ci]?.shingles ?? [];
    for (const pi of remPrev.slice(0, cap)) {
      const sim = jaccardSortedShingles(cShingles, prev[pi]?.shingles ?? []);
      if (sim >= 0.5) cands.push({ ci, pi, sim });
    }
  }
  return cands.sort((x, y) => y.sim - x.sim || x.ci - y.ci || x.pi - y.pi);
}

function greedyShinglePairs(
  curr: readonly IndexedParagraph[],
  prev: readonly IndexedParagraph[],
  usedCurr: Set<number>,
  usedPrev: Set<number>,
): Array<{ ci: number; pi: number; sim: number }> {
  const remCurr = curr.map((_, i) => i).filter((i) => !usedCurr.has(i));
  const remPrev = prev.map((_, i) => i).filter((i) => !usedPrev.has(i));
  const picked: Array<{ ci: number; pi: number; sim: number }> = [];
  for (const c of collectShingleCandidates(curr, prev, remCurr, remPrev)) {
    if (usedCurr.has(c.ci) || usedPrev.has(c.pi)) continue;
    usedCurr.add(c.ci);
    usedPrev.add(c.pi);
    picked.push(c);
  }
  return picked;
}

function toPairedChanges(
  curr: readonly IndexedParagraph[],
  prev: readonly IndexedParagraph[],
  pairs: ReadonlyArray<{ ci: number; pi: number; sim?: number }>,
  kind: "numbers_only" | "modified",
): AlignedParagraphChange[] {
  const out: AlignedParagraphChange[] = [];
  for (const { ci, pi, sim } of pairs) {
    if (kind === "modified" && (sim ?? 0) >= 0.85) continue;
    const c = curr[ci];
    const p = prev[pi];
    if (!c || !p) continue;
    out.push({
      kind,
      current: c,
      previous: p,
      similarity: sim !== undefined ? Math.round(sim * 1000) / 1000 : 1,
      tokens: computeWordDiffTokens(p.text, c.text),
    });
  }
  return out;
}

function toUnmatchedChanges(
  items: readonly IndexedParagraph[],
  used: ReadonlySet<number>,
  kind: "added" | "removed",
): AlignedParagraphChange[] {
  const out: AlignedParagraphChange[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (used.has(i) || !item) continue;
    out.push({
      kind,
      current: kind === "added" ? item : null,
      previous: kind === "removed" ? item : null,
      similarity: null,
      tokens: [{ op: kind === "added" ? "ins" : "del", text: item.text.slice(0, 3900) }],
    });
  }
  return out;
}

/** Deterministic two-stage paragraph alignment (norm_hash multiset -> numbers_only -> Jaccard shingles + word diff). */
export function alignSectionParagraphs(
  curr: readonly IndexedParagraph[],
  prev: readonly IndexedParagraph[],
): AlignedParagraphChange[] {
  const usedCurr = new Set<number>();
  const usedPrev = new Set<number>();
  matchByHash(curr, prev, "normHash", usedCurr, usedPrev);
  const numOnlyPairs = matchByHash(curr, prev, "numbersHash", usedCurr, usedPrev);
  const fuzzyPairs = greedyShinglePairs(curr, prev, usedCurr, usedPrev);
  return [
    ...toPairedChanges(curr, prev, numOnlyPairs, "numbers_only"),
    ...toPairedChanges(curr, prev, fuzzyPairs, "modified"),
    ...toUnmatchedChanges(curr, usedCurr, "added"),
    ...toUnmatchedChanges(prev, usedPrev, "removed"),
  ];
}
