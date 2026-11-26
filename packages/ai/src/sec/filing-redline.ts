export interface FilingRedlineAlert {
  code: string;
  labelZh: string;
  severity: "critical" | "warn";
  excerpt: string;
}

export interface FilingParagraphModification {
  before: string;
  after: string;
  similarity: number;
}

export interface FilingRedlineReport {
  sectionCode: string;
  addedParagraphs: string[];
  removedParagraphs: string[];
  modifiedParagraphs: FilingParagraphModification[];
  redFlagAlerts: FilingRedlineAlert[];
}

const RED_FLAG_PATTERNS: readonly {
  code: string;
  labelZh: string;
  severity: "critical" | "warn";
  re: RegExp;
}[] = [
  {
    code: "material_weakness",
    labelZh: "内控重大缺陷 (Material Weakness)",
    severity: "critical",
    re: /\bmaterial\s+weakness(?:es)?\b/i,
  },
  {
    code: "going_concern",
    labelZh: "持续经营疑虑 (Going Concern / Substantial Doubt)",
    severity: "critical",
    re: /\b(?:substantial\s+doubt|going\s+concern)\b/i,
  },
  {
    code: "restatement",
    labelZh: "财务报表重述 / 不可信赖",
    severity: "critical",
    re: /\b(?:restat(?:e|ed|ement)|non-reliance)\b/i,
  },
  {
    code: "sec_investigation",
    labelZh: "监管调查或传票 (SEC Investigation / Subpoena)",
    severity: "warn",
    re: /\b(?:sec\s+investigation|subpoena|formal\s+order\s+of\s+investigation)\b/i,
  },
  {
    code: "covenant_breach",
    labelZh: "债务契约违约风险 (Covenant Breach / Waiver)",
    severity: "warn",
    re: /\b(?:covenant\s+(?:breach|violation|waiver)|event\s+of\s+default)\b/i,
  },
];

function wordSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3),
  );
}

function jaccardSimilarity(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter += 1;
  return inter / (a.size + b.size - inter);
}

export function scanFilingRedFlags(paragraphs: readonly string[]): FilingRedlineAlert[] {
  const alerts: FilingRedlineAlert[] = [];
  const seen = new Set<string>();
  for (const para of paragraphs) {
    for (const pat of RED_FLAG_PATTERNS) {
      if (seen.has(pat.code) || !pat.re.test(para)) continue;
      seen.add(pat.code);
      alerts.push({
        code: pat.code,
        labelZh: pat.labelZh,
        severity: pat.severity,
        excerpt: para.slice(0, 220),
      });
    }
  }
  return alerts;
}

function findBestParagraphMatch(
  cSet: ReadonlySet<string>,
  prevSets: readonly ReadonlySet<string>[],
  matchedPrev: ReadonlySet<number>,
): { bestIdx: number; bestSim: number } {
  let bestIdx = -1;
  let bestSim = 0;
  for (let pi = 0; pi < prevSets.length; pi += 1) {
    if (matchedPrev.has(pi)) continue;
    const sim = jaccardSimilarity(cSet, prevSets[pi] ?? new Set<string>());
    if (sim > bestSim) {
      bestSim = sim;
      bestIdx = pi;
    }
  }
  return { bestIdx, bestSim };
}

/**
 * Paragraph-level 10-K / 10-Q redline diff (Item 1A Risk Factors & Item 7 MD&A)
 * distinguishing truly added, removed, and edited paragraphs + institutional red-flag keywords.
 */
export function computeFilingParagraphRedline(params: {
  sectionCode: string;
  previousParagraphs: readonly string[];
  currentParagraphs: readonly string[];
}): FilingRedlineReport {
  const prevSets = params.previousParagraphs.map(wordSet);
  const currSets = params.currentParagraphs.map(wordSet);
  const matchedPrev = new Set<number>();
  const addedParagraphs: string[] = [];
  const modifiedParagraphs: FilingParagraphModification[] = [];

  for (let ci = 0; ci < params.currentParagraphs.length; ci += 1) {
    const curr = params.currentParagraphs[ci] ?? "";
    const { bestIdx, bestSim } = findBestParagraphMatch(
      currSets[ci] ?? new Set<string>(),
      prevSets,
      matchedPrev,
    );
    if (bestIdx >= 0 && bestSim >= 0.92) {
      matchedPrev.add(bestIdx);
    } else if (bestIdx >= 0 && bestSim >= 0.45) {
      matchedPrev.add(bestIdx);
      modifiedParagraphs.push({
        before: params.previousParagraphs[bestIdx] ?? "",
        after: curr,
        similarity: Math.round(bestSim * 100) / 100,
      });
    } else {
      addedParagraphs.push(curr);
    }
  }

  const removedParagraphs = params.previousParagraphs.filter((_, idx) => !matchedPrev.has(idx));
  return {
    sectionCode: params.sectionCode,
    addedParagraphs: addedParagraphs.slice(0, 10),
    removedParagraphs: removedParagraphs.slice(0, 10),
    modifiedParagraphs: modifiedParagraphs.slice(0, 10),
    redFlagAlerts: scanFilingRedFlags(params.currentParagraphs),
  };
}
