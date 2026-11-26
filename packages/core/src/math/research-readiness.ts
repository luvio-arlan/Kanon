import type { ThesisDetail } from "../schemas/research";

export interface StepReadinessItem {
  step: ResearchStepId;
  label: string;
  complete: boolean;
  hint: string;
}

export type ResearchStepId = 1 | 2 | 3 | 4 | 5;

export interface ResearchStepMeta {
  step: ResearchStepId;
  code: string;
  title: string;
  short: string;
}

/** Single source of truth for the five-step canvas naming across cockpit, rail, ribbon & commands. */
export const RESEARCH_STEP_META: readonly [
  ResearchStepMeta,
  ResearchStepMeta,
  ResearchStepMeta,
  ResearchStepMeta,
  ResearchStepMeta,
] = [
  { step: 1, code: "01", title: "商业质量评估", short: "商业质量" },
  { step: 2, code: "02", title: "核心假设与催化剂", short: "核心假设" },
  { step: 3, code: "03", title: "一阶资料印证", short: "资料印证" },
  { step: 4, code: "04", title: "三情景估值与赔率", short: "估值赔率" },
  { step: 5, code: "05", title: "纪律与备忘录", short: "交易纪律" },
];

export function getResearchStepMeta(step: ResearchStepId): ResearchStepMeta {
  return RESEARCH_STEP_META[step - 1] ?? RESEARCH_STEP_META[0];
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
  const step2 =
    thesis.hypotheses.length > 0 &&
    thesis.hypotheses.every(
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
  step: ResearchStepId,
  complete: boolean,
  doneHint: string,
  todoHint: string,
): StepReadinessItem {
  return {
    step,
    label: getResearchStepMeta(step).title,
    complete,
    hint: complete ? doneHint : todoHint,
  };
}

export function calculateResearchReadiness(thesis: ThesisDetail): ResearchReadiness {
  const d = evaluateStepFlags(thesis);
  const hypothesisTodo = thesis.hypotheses.length === 0 ? "待建立核心假设" : "待补全阈值与佐证";
  const steps: ResearchReadiness["steps"] = [
    makeStepItem(1, d.step1, "已完成初筛", "待评估 4 维质量"),
    makeStepItem(2, d.step2, `${thesis.hypotheses.length} 条阈值已定`, hypothesisTodo),
    makeStepItem(3, d.step3, `${thesis.crossChecks.length} 条互证`, "待补上下游对照"),
    makeStepItem(4, d.step4, "赔率已锚定", "待校准情景区间"),
    makeStepItem(5, d.step5, `${thesis.disciplineEntries.length} 条复盘`, "待签交易纪律"),
  ];
  const completedCount = steps.filter((s) => s.complete).length;
  return { completedCount, totalSteps: 5, scorePct: Math.round((completedCount / 5) * 100), steps };
}
