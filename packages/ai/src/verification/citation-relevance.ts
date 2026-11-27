import { expandLexiconTerms } from "../retrieval/fin-lexicon";

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "have",
  "will",
  "were",
  "are",
  "our",
  "was",
  "not",
  "its",
  "has",
  "had",
  "into",
  "their",
  "which",
]);

function extractContentWords(text: string): Set<string> {
  const words = new Set<string>();
  const expanded = expandLexiconTerms(text);
  for (const phrase of expanded.englishTerms) {
    for (const w of phrase
      .replaceAll('"', "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)) {
      if (w.length >= 2 && !STOP_WORDS.has(w)) words.add(w);
    }
  }
  for (const w of text.toLowerCase().split(/[^a-z0-9\u4e00-\u9fff]+/)) {
    if (w.length >= 2 && !STOP_WORDS.has(w)) words.add(w);
  }
  return words;
}

/** Verifies claim shares >= 2 content words (after bilingual expansion) with a cited chunk (R4). */
export function countSharedContentWords(claimText: string, chunkText: string): number {
  const claimWords = extractContentWords(claimText);
  const chunkWords = extractContentWords(chunkText);
  let shared = 0;
  for (const w of claimWords) {
    if (chunkWords.has(w)) shared += 1;
  }
  return shared;
}
