import { describe, expect, it } from "vitest";
import { createMemoryKanonDb } from "../db/client";
import { listTheses } from "../db/repositories/thesis-queries";
import {
  calculateResearchReadiness,
  getResearchStepMeta,
  RESEARCH_STEP_META,
} from "./research-readiness";

describe("Research readiness & canonical step naming", () => {
  it("exposes one ordered, complete step vocabulary", () => {
    expect(RESEARCH_STEP_META.map((m) => m.step)).toEqual([1, 2, 3, 4, 5]);
    expect(RESEARCH_STEP_META.map((m) => m.code)).toEqual(["01", "02", "03", "04", "05"]);
    expect(getResearchStepMeta(5).title).toBe("纪律与备忘录");
    expect(new Set(RESEARCH_STEP_META.map((m) => m.short)).size).toBe(5);
  });

  it("never marks Step 2 complete without at least one hypothesis", async () => {
    const { db, close } = await createMemoryKanonDb();
    try {
      const [seed] = await listTheses(db);
      expect(seed).toBeDefined();
      if (!seed) return;
      const withHypotheses = calculateResearchReadiness(seed);
      expect(withHypotheses.steps[1].label).toBe(getResearchStepMeta(2).title);

      const empty = calculateResearchReadiness({ ...seed, hypotheses: [] });
      expect(empty.steps[1].complete).toBe(false);
      expect(empty.steps[1].hint).toBe("待建立核心假设");
      expect(empty.completedCount).toBeLessThan(5);
    } finally {
      await close();
    }
  });
});
