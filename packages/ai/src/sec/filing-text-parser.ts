import type { SecFilingDiff, SecFilingSection, SecFilingSectionCategory } from "@kanon/core";

const BUY_SIDE_SIGNAL_RE =
  /\b(?:capex|capital expenditure|gross margin|operating margin|guidance|outlook|backlog|inventory|demand|pricing|free cash flow|repurchase|buyback|tariff|export control|ai|data center|utilization|depreciation|capacity)\b/gi;

const HTML_ENTITY_MAP: Record<string, string> = {
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

function decodeEntities(raw: string): string {
  const named = raw.replace(/&[a-z0-9#]+;/gi, (entity) => {
    const mapped = HTML_ENTITY_MAP[entity.toLowerCase()];
    if (mapped) return mapped;
    const numMatch = /^&#(\d+);$/.exec(entity);
    if (numMatch?.[1]) return String.fromCharCode(Number(numMatch[1]));
    const hexMatch = /^&#x([0-9a-f]+);$/i.exec(entity);
    if (hexMatch?.[1]) return String.fromCharCode(Number.parseInt(hexMatch[1], 16));
    return " ";
  });
  return named.replace(/\s+/g, " ").trim();
}

export function countBuySideSignals(text: string): number {
  const matches = text.match(BUY_SIDE_SIGNAL_RE);
  return matches ? matches.length : 0;
}

function isKeepableParagraph(text: string): boolean {
  if (/^item\s+(?:1a|1|2|7)\b/i.test(text) && text.length <= 180) return true;
  if (text.length < 75 || text.length > 1800) return false;
  return (text.match(/[A-Za-z]/g) ?? []).length >= 45;
}

export function stripSecHtmlToParagraphs(rawHtml: string): string[] {
  const cleaned = rawHtml
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<ix:header\b[\s\S]*?<\/ix:header>/gi, " ")
    .replace(/<(?:\/p|\/div|\/li|\/tr|\/h[1-6]|br\s*\/?)>/gi, "\n");

  const withoutTags = cleaned.replace(/<[^>]+>/g, " ");
  const paragraphs: string[] = [];
  const seen = new Set<string>();

  for (const line of withoutTags.split("\n")) {
    const text = decodeEntities(line);
    if (!isKeepableParagraph(text)) continue;
    const dedupeKey = text.slice(0, 96).toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    paragraphs.push(text);
    if (paragraphs.length >= 260) break;
  }
  return paragraphs;
}

function classifyHeading(text: string): SecFilingSectionCategory | null {
  const compact = text.toLowerCase();
  if (/^item\s+(?:7|2)\b/.test(compact) && /management|discussion|analysis|results/.test(compact)) {
    return "mda";
  }
  if (/^item\s+1a\b/.test(compact) && /risk\s+factors?/.test(compact)) {
    return "risk_factors";
  }
  if (
    /^item\s+1\b/.test(compact) &&
    !/^item\s+1a\b/.test(compact) &&
    /business|overview/.test(compact)
  ) {
    return "business";
  }
  return null;
}

function buildSection(
  id: string,
  heading: string,
  category: SecFilingSectionCategory,
  paragraphs: string[],
): SecFilingSection {
  const capped = paragraphs.slice(0, 14);
  const signalHits = capped.reduce((sum, p) => sum + countBuySideSignals(p), 0);
  return { id, heading, category, paragraphs: capped, signalHits };
}

export function extractSecKeySections(paragraphs: readonly string[]): SecFilingSection[] {
  const buckets: Record<SecFilingSectionCategory, string[]> = {
    mda: [],
    risk_factors: [],
    business: [],
    general: [],
  };
  let active: SecFilingSectionCategory = "general";

  for (const para of paragraphs) {
    const switched = classifyHeading(para);
    if (switched) {
      active = switched;
      continue;
    }
    if (buckets[active].length < 24) {
      buckets[active].push(para);
    }
  }

  const sections: SecFilingSection[] = [];
  if (buckets.mda.length > 0) {
    sections.push(buildSection("mda", "Item 7 / 2 · 管理层讨论与分析 (MD&A)", "mda", buckets.mda));
  }
  if (buckets.risk_factors.length > 0) {
    sections.push(
      buildSection(
        "risk",
        "Item 1A · 核心风险因素 (Risk Factors)",
        "risk_factors",
        buckets.risk_factors,
      ),
    );
  }
  if (buckets.business.length > 0) {
    sections.push(buildSection("biz", "Item 1 · 商业与业务披露", "business", buckets.business));
  }

  const highSignal = [...paragraphs]
    .filter((p) => countBuySideSignals(p) > 0)
    .sort((a, b) => countBuySideSignals(b) - countBuySideSignals(a))
    .slice(0, 14);
  if (highSignal.length > 0) {
    sections.push(
      buildSection("signals", "高买方信号原段（CapEx / 毛利 / 指引）", "general", highSignal),
    );
  }
  return sections;
}

function splitMeaningfulSentences(paragraphs: readonly string[]): string[] {
  const out: string[] = [];
  for (const para of paragraphs) {
    for (const part of para.split(/(?<=[.!?])\s+/)) {
      const trimmed = part.trim();
      if (trimmed.length >= 60 && trimmed.length <= 360) {
        out.push(trimmed);
      }
    }
  }
  return out;
}

function normalizeSentenceKey(sentence: string): string {
  return sentence
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 110);
}

export function computeFilingSectionDiff(params: {
  sectionHeading: string;
  previousForm: string;
  previousFilingDate: string;
  currentParagraphs: readonly string[];
  previousParagraphs: readonly string[];
}): SecFilingDiff | null {
  const curSentences = splitMeaningfulSentences(params.currentParagraphs);
  const prevSentences = splitMeaningfulSentences(params.previousParagraphs);
  if (curSentences.length === 0 || prevSentences.length === 0) return null;

  const prevSet = new Set(prevSentences.map(normalizeSentenceKey));
  const curSet = new Set(curSentences.map(normalizeSentenceKey));

  const added = curSentences
    .filter((s) => !prevSet.has(normalizeSentenceKey(s)))
    .sort((a, b) => countBuySideSignals(b) - countBuySideSignals(a))
    .slice(0, 5);
  const removed = prevSentences
    .filter((s) => !curSet.has(normalizeSentenceKey(s)))
    .sort((a, b) => countBuySideSignals(b) - countBuySideSignals(a))
    .slice(0, 5);

  const changeSummary =
    added.length === 0 && removed.length === 0
      ? `与上期 ${params.previousForm} (${params.previousFilingDate}) 相比核心措辞高度一致`
      : `对比上期 ${params.previousForm} (${params.previousFilingDate})：识别出 ${added.length} 条新增措辞、${removed.length} 条删减表述`;

  return {
    sectionHeading: params.sectionHeading,
    previousForm: params.previousForm,
    previousFilingDate: params.previousFilingDate,
    addedSnippets: added,
    removedSnippets: removed,
    changeSummary,
  };
}
