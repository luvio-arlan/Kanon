import { describe, expect, it } from "vitest";
import { createMemoryKanonDb } from "../db/client";
import { getSecSnapshot } from "../db/repositories/discipline-mutations";
import { listTheses } from "../db/repositories/thesis-queries";
import {
  calculateImpliedExpectations,
  matchProbabilityPreset,
  PROBABILITY_PRESETS,
} from "./implied-expectations";
import { calculatePortfolioAnalytics, suggestKellyCappedWeight } from "./portfolio-analytics";
import { analyzeSecQuality } from "./sec-analytics";
import { calculateValuationScenarios } from "./valuation-scenarios";

describe("Institutional Analytics Engines (Expectations, SEC Quality, Portfolio)", () => {
  it("computes margin of safety, hurdle buy prices, and implied market EPS CAGR", () => {
    const summary = calculateValuationScenarios({
      currentPrice: 108,
      horizonYears: 3,
      bear: { eps: 7.5, peMultiple: 12 },
      base: { eps: 12.5, peMultiple: 14 },
      bull: { eps: 16, peMultiple: 16 },
    });
    const exp = calculateImpliedExpectations({ summary, trailingEps: 7.59 });

    expect(exp.marginOfSafetyPct).toBe(38.3);
    expect(exp.hurdleEntry15).toBe(115.07);
    expect(exp.hurdleEntry20).toBe(101.27);
    expect(exp.isBelowHurdle15).toBe(true);
    expect(exp.impliedEpsAtBasePe).toBe(7.71);
    expect(exp.impliedEpsCagrPct).toBe(0.5);
    expect(exp.baseEpsCagrPct).toBe(18.1);
    expect(exp.expectationsGapPct).toBe(17.6);
    expect(matchProbabilityPreset(0.25, 0.5, 0.25)).toBe("balanced");
    expect(PROBABILITY_PRESETS).toHaveLength(3);
  });

  it("analyzes multi-year SEC quality grades and portfolio telemetry", async () => {
    const { db, close } = await createMemoryKanonDb();
    try {
      const nvdaSec = await getSecSnapshot(db, "NVDA");
      const muSec = await getSecSnapshot(db, "MU");
      const nvdaQ = analyzeSecQuality(nvdaSec?.annuals ?? []);
      const muQ = analyzeSecQuality(muSec?.annuals ?? []);

      expect(nvdaQ?.qualityGrade).toBe("compounder");
      expect(nvdaQ?.revenueCagrPct).toBeGreaterThan(80);
      expect(nvdaQ?.fcfConversionPct).toBeGreaterThan(75);
      expect(muQ?.qualityGrade).toBe("capital_intensive");

      const theses = await listTheses(db);
      const portfolio = calculatePortfolioAnalytics(theses);
      expect(portfolio.activeCount).toBe(2);
      expect(portfolio.averageRiskReward).toBe(2.79);
      expect(portfolio.averageBaseCagrPct).toBeGreaterThan(14);
      expect(portfolio.averageReadinessPct).toBe(100);
      expect(portfolio.totalWeightPct).toBe(20);
      expect(portfolio.cashBufferPct).toBe(80);
      expect(portfolio.weightedBaseCagrPct).toBeGreaterThan(13);
      expect(portfolio.inBuyZoneCount).toBeGreaterThanOrEqual(1);
      expect(portfolio.warningThesisCount).toBe(1);
      expect(portfolio.overCapTickers).toEqual([]);
      const mu = theses[0];
      expect(mu).toBeDefined();
      if (mu) {
        const kelly = suggestKellyCappedWeight(mu);
        expect(kelly.maxPct).toBeGreaterThan(0);
        expect(kelly.maxPct).toBeLessThanOrEqual(mu.targetMaxWeightPct);
      }
    } finally {
      await close();
    }
  });
});
