import { roundTo } from "../valuation-scenarios";

export interface AltmanZInput {
  sector?: string;
  isManufacturing?: boolean;
  workingCapital: number;
  retainedEarnings: number;
  ebit: number;
  marketCap: number;
  bookEquity?: number;
  totalLiabilities: number;
  revenue: number;
  totalAssets: number;
}

export type AltmanZResult =
  | {
      applicable: false;
      reason: string;
    }
  | {
      applicable: true;
      variant: "Z" | "Z-double-prime";
      score: number;
      zone: "safe" | "grey" | "distress";
    };

const EXCLUDED_SECTOR_RE =
  /\b(bank|insurance|financial|reit|real estate)\b|银行|保险|金融|地产信托/i;

/**
 * Altman Z-Score (manufacturing) and Z''-Score (non-manufacturing/service).
 * Explicitly skips financial institutions and REITs where balance-sheet ratios are structurally invalid.
 */
function classifyZone(
  score: number,
  safeMin: number,
  greyMin: number,
): "safe" | "grey" | "distress" {
  if (score > safeMin) return "safe";
  return score >= greyMin ? "grey" : "distress";
}

export function calculateAltmanZScore(input: AltmanZInput): AltmanZResult {
  if (input.sector && EXCLUDED_SECTOR_RE.test(input.sector)) {
    return {
      applicable: false,
      reason: "金融/保险/REITs 资产负债表结构不适用 Altman Z-Score，请改用资本充足率与覆盖倍数。",
    };
  }
  if (input.totalAssets <= 0 || input.totalLiabilities <= 0) {
    return { applicable: false, reason: "缺少有效总资产或总负债数据。" };
  }
  const x1 = input.workingCapital / input.totalAssets;
  const x2 = input.retainedEarnings / input.totalAssets;
  const x3 = input.ebit / input.totalAssets;
  if (input.isManufacturing) {
    const score =
      1.2 * x1 +
      1.4 * x2 +
      3.3 * x3 +
      0.6 * (input.marketCap / input.totalLiabilities) +
      input.revenue / input.totalAssets;
    return {
      applicable: true,
      variant: "Z",
      score: roundTo(score, 2),
      zone: classifyZone(score, 2.99, 1.81),
    };
  }
  const x4 = (input.bookEquity ?? input.marketCap) / input.totalLiabilities;
  const score = 6.56 * x1 + 3.26 * x2 + 6.72 * x3 + 1.05 * x4;
  return {
    applicable: true,
    variant: "Z-double-prime",
    score: roundTo(score, 2),
    zone: classifyZone(score, 2.6, 1.1),
  };
}
