import crypto from "node:crypto";
import { REDLINE_STOP_WORDS } from "./lexicon";

const MONTH_RE =
  /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+(?:19|20)\d{2}\b/gi;

export function baseNormalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function normBoilerplate(text: string): string {
  return baseNormalize(text)
    .replace(MONTH_RE, "<d>")
    .replace(/\b(?:fiscal\s+year|fiscal|fy)\s*(?:19|20)?\d{2,4}\b/gi, "<fy>")
    .replace(/\b(?:19|20)\d{2}\b/g, "<y>");
}

export function normNumbers(text: string): string {
  const masked = normBoilerplate(text)
    .replace(
      /[$€£¥]\s*\d[\d,.]*(?:\s*(?:billion|million|thousand|trillion|bn|mn|b|m|k))?\b/gi,
      "<amt>",
    )
    .replace(/\b\d[\d,.]*\s*(?:%|percent|percentage\s+points?|bps)\b/gi, "<pct>")
    .replace(/\b\d[\d,.]*\b/g, "<n>");
  return masked
    .split(/[^a-z0-9<>]+/)
    .filter((tok) => tok.length > 0 && !REDLINE_STOP_WORDS.has(tok))
    .join(" ");
}

export function sha256Hex(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export function computeNormHash(text: string): string {
  return sha256Hex(normBoilerplate(text));
}

export function computeNumbersHash(text: string): string {
  return sha256Hex(normNumbers(text));
}

function fnv1a32(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function buildTrigramShingles(text: string): number[] {
  const words = normNumbers(text).split(" ").filter(Boolean);
  if (words.length === 0) return [];
  const set = new Set<number>();
  if (words.length < 3) {
    set.add(fnv1a32(words.join(" ")));
  } else {
    for (let i = 0; i <= words.length - 3; i += 1) {
      set.add(fnv1a32(`${words[i]} ${words[i + 1]} ${words[i + 2]}`));
    }
  }
  return [...set].sort((a, b) => a - b);
}

export function jaccardSortedShingles(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  let i = 0;
  let j = 0;
  let inter = 0;
  while (i < a.length && j < b.length) {
    const va = a[i] ?? 0;
    const vb = b[j] ?? 0;
    if (va === vb) {
      inter += 1;
      i += 1;
      j += 1;
    } else if (va < vb) {
      i += 1;
    } else {
      j += 1;
    }
  }
  const union = a.length + b.length - inter;
  return union > 0 ? inter / union : 0;
}
