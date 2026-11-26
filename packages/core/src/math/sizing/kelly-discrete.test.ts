import { describe, expect, it } from "vitest";
import { calculateDiscreteKelly } from "./kelly-discrete";

describe("W0.3 Discrete Log-Utility Kelly Engine", () => {
  it("matches exact closed-form binary Kelly f* = p - q/b within 1e-6", () => {
    const cases = [
      { p: 0.6, b: 1.0 },
      { p: 0.55, b: 2.0 },
      { p: 0.7, b: 0.5 },
      { p: 0.52, b: 1.5 },
    ];
    for (const { p, b } of cases) {
      const q = 1 - p;
      const closedForm = p - q / b;
      const res = calculateDiscreteKelly({
        scenarios: [
          { probability: p, returnPct: b * 100 },
          { probability: q, returnPct: -100 },
        ],
        fraction: 1,
        capPct: 100,
      });
      expect(Math.abs(res.fullKellyFraction - closedForm)).toBeLessThan(1e-6);
      expect(res.probabilityOfLoss).toBeCloseTo(q, 4);
      expect(res.expectedLogGrowth).toBeGreaterThan(0);
    }
  });

  it("sets f* = 1 when all scenarios have positive return and truncates at capPct", () => {
    const res = calculateDiscreteKelly({
      scenarios: [
        { probability: 0.25, returnPct: 5 },
        { probability: 0.5, returnPct: 45 },
        { probability: 0.25, returnPct: 95 },
      ],
      fraction: 0.5,
      capPct: 15,
    });
    expect(res.fullKellyFraction).toBe(1);
    expect(res.fullKellyPct).toBe(100);
    expect(res.fractionalKellyPct).toBe(50);
    expect(res.cappedPct).toBe(15);
    expect(res.probabilityOfLoss).toBe(0);
  });

  it("returns 0 when expected arithmetic return is <= 0", () => {
    const zeroEv = calculateDiscreteKelly({
      scenarios: [
        { probability: 0.5, returnPct: 30 },
        { probability: 0.5, returnPct: -30 },
      ],
      fraction: 0.5,
      capPct: 20,
    });
    expect(zeroEv.fullKellyFraction).toBe(0);
    expect(zeroEv.cappedPct).toBe(0);

    const negEv = calculateDiscreteKelly({
      scenarios: [
        { probability: 0.3, returnPct: 20 },
        { probability: 0.7, returnPct: -25 },
      ],
      fraction: 0.5,
      capPct: 20,
    });
    expect(negEv.fullKellyFraction).toBe(0);
    expect(negEv.cappedPct).toBe(0);
  });

  it("tightens upper bound safely when a scenario has return <= -100%", () => {
    const res = calculateDiscreteKelly({
      scenarios: [
        { probability: 0.8, returnPct: 100 },
        { probability: 0.2, returnPct: -120 },
      ],
      fraction: 1,
      capPct: 100,
    });
    expect(Number.isFinite(res.fullKellyFraction)).toBe(true);
    expect(res.fullKellyFraction).toBeGreaterThan(0);
    expect(1 + res.fullKellyFraction * -1.2).toBeGreaterThan(0);
  });

  it("tracks explicit toggleable adjustments transparently", () => {
    const base = {
      scenarios: [
        { probability: 0.25, returnPct: -20 },
        { probability: 0.5, returnPct: 60 },
        { probability: 0.25, returnPct: 120 },
      ],
      fraction: 0.5,
      capPct: 25,
    };
    const withAdjust = calculateDiscreteKelly({
      ...base,
      adjustments: [
        { id: "readiness", label: "研究成熟度折扣", enabled: true, multiplier: 0.8 },
        { id: "warning", label: "预警假设折半", enabled: true, multiplier: 0.5 },
      ],
    });
    const withoutAdjust = calculateDiscreteKelly({
      ...base,
      adjustments: [
        { id: "readiness", label: "研究成熟度折扣", enabled: false, multiplier: 0.8 },
        { id: "warning", label: "预警假设折半", enabled: false, multiplier: 0.5 },
      ],
    });
    expect(withAdjust.adjustments).toHaveLength(2);
    expect(withAdjust.cappedPct).toBeLessThan(withoutAdjust.cappedPct);
    expect(withAdjust.adjustments[1]?.afterPct).toBeCloseTo(
      (withAdjust.adjustments[1]?.beforePct ?? 0) * 0.5,
      1,
    );
  });
});
