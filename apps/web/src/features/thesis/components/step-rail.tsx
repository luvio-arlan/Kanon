"use client";

import { calculateResearchReadiness, type ThesisDetail } from "@kanon/core";
import { cn, KANON_SPRING } from "@kanon/ui";
import { IconCheck } from "@tabler/icons-react";
import { motion } from "framer-motion";

export type StepId = 1 | 2 | 3 | 4 | 5;

const STEPS: ReadonlyArray<{ id: StepId; code: string; title: string }> = [
  { id: 1, code: "01", title: "商业模式滤镜" },
  { id: 2, code: "02", title: "核心假设拆解" },
  { id: 3, code: "03", title: "一阶资料印证" },
  { id: 4, code: "04", title: "三情景估值赔率" },
  { id: 5, code: "05", title: "纪律与备忘录" },
];

function StepRailItem({
  step,
  active,
  complete,
  onSelect,
}: {
  step: (typeof STEPS)[number];
  active: boolean;
  complete: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "relative flex w-full cursor-pointer items-center justify-between gap-2 rounded-control px-3 py-2.5 text-left transition-colors",
        active ? "text-ink-primary" : "text-ink-secondary hover:bg-muted/50 hover:text-ink-primary",
      )}
    >
      {active ? (
        <motion.span
          layoutId="canvas-step-rail-bg"
          transition={KANON_SPRING}
          className="absolute inset-0 rounded-control bg-muted/75"
        />
      ) : null}
      {active ? (
        <motion.span
          layoutId="canvas-step-rail-bar"
          transition={KANON_SPRING}
          className="absolute bottom-2 left-0 top-2 w-0.5 rounded-pill bg-accent-coral"
        />
      ) : null}
      <span className="relative z-10 flex min-w-0 items-center gap-2.5">
        <span className="font-mono text-xs text-ink-muted tabular-nums">{step.code}</span>
        <span className={cn("truncate text-sm", active ? "font-semibold" : "font-medium")}>
          {step.title}
        </span>
      </span>
      {complete ? (
        <IconCheck size={13} stroke={1.5} className="relative z-10 shrink-0 text-ink-muted" />
      ) : null}
    </button>
  );
}

export function StepRail({
  activeStep,
  thesis,
  onSelect,
}: {
  activeStep: StepId;
  thesis: ThesisDetail;
  onSelect: (step: StepId) => void;
}) {
  const readiness = calculateResearchReadiness(thesis);

  return (
    <aside className="space-y-5 lg:sticky lg:top-22">
      <div className="px-3">
        <div className="flex items-center justify-between text-xs text-ink-muted">
          <span>研究进度</span>
          <span className="font-mono tabular-nums">{readiness.completedCount}/5</span>
        </div>
        <div className="mt-2 h-0.5 overflow-hidden rounded-pill bg-hairline">
          <div
            className="h-full rounded-pill bg-ink-primary transition-all duration-300"
            style={{ width: `${readiness.scorePct}%` }}
          />
        </div>
      </div>
      <nav aria-label="五步研究进度" className="space-y-0.5">
        {STEPS.map((step, idx) => (
          <StepRailItem
            key={step.id}
            step={step}
            active={activeStep === step.id}
            complete={Boolean(readiness.steps[idx]?.complete)}
            onSelect={() => onSelect(step.id)}
          />
        ))}
      </nav>
      <div className="px-3 font-mono text-xs text-ink-muted/80">1–5 切步 · F 专注</div>
    </aside>
  );
}
