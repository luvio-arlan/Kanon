import { describe, expect, it } from "vitest";
import { verifyGuidanceQuoteAnchor } from "../guidance/quote-anchor";
import { planBilingualQuery } from "../retrieval/query-plan";
import { verifyGroundedClaims } from "./claim-verifier";

describe("R4 Strict Claim Verifier, Bilingual Retrieval Plan & R3 Quote Anchor", () => {
  it("returns groundingRatePct: null for 0 claims (never 100%)", () => {
    const rep = verifyGroundedClaims({ claims: [], chunkMap: new Map() });
    expect(rep.groundingRatePct).toBeNull();
    expect(rep.totalClaims).toBe(0);
  });

  it("rejects cross-period mismatch (FY2023 vs FY2024) and irrelevant citations", () => {
    const chunkMap = new Map([
      ["c1", "In FY2024, NVIDIA total revenue reached $60.9B with gross margin of 72.7%."],
      ["c_irrel", "Our corporate headquarters lease in Santa Clara expires in 2032."],
    ]);
    const periodMismatch = verifyGroundedClaims({
      claims: [{ text: "FY2023 营收达到 $60.9B。", citations: ["c1"] }],
      chunkMap,
    });
    expect(periodMismatch.results[0]?.status).toBe("unverified");
    expect(periodMismatch.results[0]?.issues.some((i) => i.includes("期间"))).toBe(true);

    const irrelevant = verifyGroundedClaims({
      claims: [{ text: "数据中心需求推动出口管制风险上升。", citations: ["c_irrel"] }],
      chunkMap,
    });
    expect(irrelevant.results[0]?.status).toBe("unverified");
    expect(irrelevant.results[0]?.issues.some((i) => i.includes("不相关"))).toBe(true);
  });

  it("parses Chinese 亿/万/bps units and blocks untagged global fact pool bypass", () => {
    const chunkMap = new Map([
      ["c1", "FY2025 revenue was $130.5B and gross margin expanded 50 bps."],
    ]);
    const cnMatch = verifyGroundedClaims({
      claims: [{ text: "FY2025 营收达到 1305 亿美元，毛利率扩大 50 bps。", citations: ["c1"] }],
      chunkMap,
    });
    expect(cnMatch.results[0]?.status).toBe("verified");

    const bypass = verifyGroundedClaims({
      claims: [{ text: "FY2025 营收达到 $999B。", citations: ["c1"] }],
      knownFactValues: [999e9],
      chunkMap,
    });
    expect(bypass.results[0]?.status).toBe("unverified");
  });

  it("builds bilingual FTS query plan and verifies verbatim quote anchors", () => {
    const plan = planBilingualQuery("毛利率和资本开支趋势");
    expect(plan.englishTerms.some((t) => t.includes("gross margin"))).toBe(true);
    expect(plan.englishTerms.some((t) => t.includes("capital expenditure"))).toBe(true);
    expect(plan.tsQuery).toContain("OR");

    const source =
      "Management expects Q3 revenue of $32.5 billion plus or minus 2% and GAAP gross margin of 74.4%.";
    expect(
      verifyGuidanceQuoteAnchor(source, {
        metric: "revenue",
        basis: "gaap",
        quote: "Management expects Q3 revenue of $32.5 billion plus or minus 2%",
      }).ok,
    ).toBe(true);
    expect(
      verifyGuidanceQuoteAnchor(source, {
        metric: "revenue",
        basis: "gaap",
        quote: "Management expects Q3 revenue of $99.9 billion next quarter",
      }).ok,
    ).toBe(false);
  });

  it("P2-3: parses parenthesized accounting losses and percentage points without sign blindness", () => {
    const chunkMap = new Map([
      [
        "c_loss",
        "FY2025 operating income was ($1.2B) and gross margin fell 0.5 percentage points.",
      ],
    ]);
    const falsePositive = verifyGroundedClaims({
      claims: [{ text: "FY2025 营业利润达到 $1.2B。", citations: ["c_loss"] }],
      chunkMap,
    });
    expect(falsePositive.results[0]?.status).toBe("unverified");

    const trueNegative = verifyGroundedClaims({
      claims: [
        { text: "FY2025 营业利润为 -$1.2B，毛利率下降 0.5 个百分点。", citations: ["c_loss"] },
      ],
      chunkMap,
    });
    expect(trueNegative.results[0]?.status).toBe("verified");
  });
});
