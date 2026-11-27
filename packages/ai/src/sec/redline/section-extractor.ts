import type { RedlineSection } from "@kanon/core";

export const MAX_REDLINE_HTML_BYTES = 12 * 1024 * 1024;

export interface ExtractedSectionResult {
  status: "ok" | "section_missing" | "too_large" | "no_material_changes";
  paragraphs: string[];
}

const ENTITY_MAP: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&rsquo;": "'",
  "&lsquo;": "'",
  "&rdquo;": '"',
  "&ldquo;": '"',
  "&mdash;": "—",
  "&ndash;": "-",
};

function decodeHtmlText(raw: string): string {
  return raw
    .replace(/&[a-z0-9#]+;/gi, (ent) => {
      const mapped = ENTITY_MAP[ent.toLowerCase()];
      if (mapped) return mapped;
      const dec = /^&#(\d+);$/.exec(ent);
      if (dec?.[1]) return String.fromCodePoint(Math.min(0x10ffff, Math.max(32, Number(dec[1]))));
      return " ";
    })
    .replace(/\s+/g, " ")
    .trim();
}

function splitLongBlock(block: string): string[] {
  if (block.length <= 2400) return [block];
  const sentences = block.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if (cur.length > 0 && cur.length + s.length + 1 > 1200) {
      chunks.push(cur.trim());
      cur = s;
    } else {
      cur = cur ? `${cur} ${s}` : s;
    }
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks;
}

function isPageOrTocNoise(line: string): boolean {
  if (/^\d{1,3}$/.test(line) || /^page\s+\d+(?:\s+of\s+\d+)?$/i.test(line)) return true;
  if (/\.{3,}\s*\d{1,3}$/.test(line)) return true;
  if (/^item\s+\d+[a-z]?\b.*\s+\d{1,3}$/i.test(line)) return true;
  return false;
}

function stripRepeatedHeaders(lines: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const l of lines) {
    if (l.length < 120) {
      const key = l.toLowerCase().replace(/\d+/g, "#");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return lines.filter((l) => {
    if (l.length < 120 && (counts.get(l.toLowerCase().replace(/\d+/g, "#")) ?? 0) >= 3) {
      return false;
    }
    return !isPageOrTocNoise(l);
  });
}

function htmlToCleanBlocks(rawHtml: string): string[] {
  const stripped = rawHtml
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<ix:header\b[\s\S]*?<\/ix:header>/gi, " ")
    .replace(/<ix:hidden\b[\s\S]*?<\/ix:hidden>/gi, " ")
    .replace(/<(?:\/p|\/div|\/li|\/tr|\/h[1-6]|br\s*\/?)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const rawLines = stripped
    .split("\n")
    .map(decodeHtmlText)
    .filter((l) => l.length > 0);
  const denoised = stripRepeatedHeaders(rawLines);
  const out: string[] = [];
  for (const block of denoised) {
    for (const part of splitLongBlock(block)) out.push(part);
  }
  return out;
}

function sectionStartRegex(form: string, section: RedlineSection): RegExp {
  const upper = form.toUpperCase();
  if (upper.startsWith("20-F")) {
    return section === "risk_factors"
      ? /^(?:item\s*3\b.*risk\s+factors|d\.\s*risk\s+factors)/i
      : /^item\s*5\b.*operating\s+and\s+financial\s+review/i;
  }
  if (upper.startsWith("10-Q")) {
    return section === "mda" ? /^item\s*2\b.*management/i : /^item\s*1a\b.*risk\s+factors/i;
  }
  return section === "risk_factors" ? /^item\s*1a\b.*risk\s+factors/i : /^item\s*7\b.*management/i;
}

const NEXT_ITEM_RE = /^item\s*\d+[a-z]?\b/i;

function collectSectionRange(blocks: readonly string[], startIdx: number): string[] {
  const body: string[] = [];
  for (let i = startIdx + 1; i < blocks.length; i += 1) {
    const line = blocks[i] ?? "";
    if (NEXT_ITEM_RE.test(line) && line.length <= 180) break;
    if (line.length >= 25) body.push(line);
  }
  return body;
}

/** Extracts full MD&A or Risk Factors section paragraphs (`sections/1`) skipping TOC and headers (R1). */
export function extractFilingSectionParagraphs(params: {
  rawHtml: string;
  form: string;
  section: RedlineSection;
}): ExtractedSectionResult {
  if (Buffer.byteLength(params.rawHtml, "utf8") > MAX_REDLINE_HTML_BYTES) {
    return { status: "too_large", paragraphs: [] };
  }
  const blocks = htmlToCleanBlocks(params.rawHtml);
  const startRe = sectionStartRegex(params.form, params.section);
  let bestBody: string[] = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const line = blocks[i] ?? "";
    if (!startRe.test(line) || line.length > 220) continue;
    const candidate = collectSectionRange(blocks, i);
    const isNoChange10q =
      params.form.toUpperCase().startsWith("10-Q") &&
      params.section === "risk_factors" &&
      candidate.some((p) => /no\s+material\s+changes/i.test(p));
    if (isNoChange10q) {
      return { status: "no_material_changes", paragraphs: candidate.slice(0, 2) };
    }
    if (candidate.length >= 3) bestBody = candidate;
  }
  if (bestBody.length < 3) return { status: "section_missing", paragraphs: [] };
  return { status: "ok", paragraphs: bestBody };
}
