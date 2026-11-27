export interface FilingRedlineAlert {
  code: string;
  labelZh: string;
  severity: "critical" | "warn";
  excerpt: string;
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
