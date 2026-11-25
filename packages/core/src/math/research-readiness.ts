import type { ThesisDetail } from "../schemas/research";

export interface StepReadinessItem {
  step: 1 | 2 | 3 | 4 | 5;
  label: string;
  complete: boolean;
  hint: string;
}

export interface ResearchReadiness {
  completedCount: number;
  totalSteps: 5;
  scorePct: number;
  steps: readonly [
    StepReadinessItem,
    StepReadinessItem,
    StepReadinessItem,
    StepReadinessItem,
    StepReadinessItem,
  ];
}

function evaluateStepFlags(thesis: ThesisDetail) {
  const f = thesis.businessFilter;
  const step1 =
    thesis.convictionSummary.trim().length >= 12 &&
    [f.recurringRevenue, f.pricingPower, f.capitalReturn, f.governance].includes("pass");
  const step2 = thesis.hypotheses.every(
    (h) =>
      h.title.trim().length >= 6 && h.threshold.trim().length >= 2 && h.note.trim().length >= 6,
  );
  const step3 = thesis.crossChecks.length >= 1;
  const step4 =
    thesis.valuation.bear.targetPrice < thesis.valuation.base.targetPrice &&
    thesis.valuation.base.targetPrice < thesis.valuation.bull.targetPrice;
  const step5 = thesis.disciplineEntries.some(
    (entry) => entry.noLeverageConfirmed && entry.exitRule.trim().length >= 4,
  );
  return { step1, step2, step3, step4, step5 };
}

function makeStepItem(
  step: 1 | 2 | 3 | 4 | 5,
  label: string,
  complete: boolean,
  doneHint: string,
  todoHint: string,
): StepReadinessItem {
  return { step, label, complete, hint: complete ? doneHint : todoHint };
}

export function calculateResearchReadiness(thesis: ThesisDetail): ResearchReadiness {
  const d = evaluateStepFlags(thesis);
  const steps: ResearchReadiness["steps"] = [
    makeStepItem(1, "商业质量评估", d.step1, "已完成初筛", "待评估 4 维质量"),
    makeStepItem(2, "核心假设拆解", d.step2, "3 条阈值已定", "待补全阈值与佐证"),
    makeStepItem(
      3,
      "一阶资料印证",
      d.step3,
      `${thesis.crossChecks.length} 条互证`,
      "待补上下游对照",
    ),
    makeStepItem(4, "三情景估值赔率", d.step4, "赔率已锚定", "待校准情景区间"),
    makeStepItem(
      5,
      "零杠杆纪律复盘",
      d.step5,
      `${thesis.disciplineEntries.length} 条复盘`,
      "待签交易纪律",
    ),
  ];
  const completedCount = steps.filter((s) => s.complete).length;
  return { completedCount, totalSteps: 5, scorePct: Math.round((completedCount / 5) * 100), steps };
}
