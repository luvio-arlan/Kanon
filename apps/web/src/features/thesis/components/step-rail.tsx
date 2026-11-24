"use client";

import {
  calculateImpliedExpectations,
  calculateResearchReadiness,
  type ThesisDetail,
} from "@kanon/core";
import { cn, KANON_SPRING, ReadinessRing, RollingNumber } from "@kanon/ui";
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
        <IconCheck size={13} stroke={1.5} className="relative z-10 shrink-0 text-status-pass" />
      ) : null}
    </button>
  );
}

function PeripheralAnchorSummary({ thesis }: { thesis: ThesisDetail }) {
  const { valuation } = thesis;
  const exp = calculateImpliedExpectations({ summary: valuation });
  return (
    <div className="rounded-control border border-hairline bg-surface/80 p-3.5 font-mono text-xs tabular-nums">
      <div className="flex items-center justify-between text-ink-muted">
        <span className="font-sans">实时估值锚点</span>
        <span>{valuation.horizonYears}Y</span>
      </div>
      <div className="mt-2.5 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="font-sans text-ink-secondary">现价 / 目标</span>
          <span className="font-semibold text-ink-primary">
            ${thesis.currentPrice.toFixed(1)} →{" "}
            <RollingNumber value={valuation.base.targetPrice} prefix="$" decimals={1} />
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="font-sans text-ink-secondary">赔率 / 边际</span>
          <span className="text-ink-primary">
            {valuation.riskRewardRatio !== null ? `${valuation.riskRewardRatio.toFixed(2)}×` : "∞"}{" "}
            · {exp.marginOfSafetyPct.toFixed(1)}%
          </span>
        </div>
        <div className="flex items-center justify-between border-t border-hairline pt-1.5">
          <span className="font-sans text-ink-secondary">15% 买点</span>
          <span
            className={exp.isBelowHurdle15 ? "font-semibold text-status-pass" : "text-ink-muted"}
          >
            <RollingNumber value={exp.hurdleEntry15} prefix="$" decimals={1} />
          </span>
        </div>
      </div>
    </div>
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
    <aside className="no-print space-y-5 lg:sticky lg:top-20 lg:self-start">
      <div className="flex items-center justify-between px-3">
        <div>
          <div className="text-xs font-medium text-ink-secondary">研究成熟度</div>
          <div className="mt-0.5 font-mono text-xs text-ink-muted tabular-nums">
            已完成 {readiness.completedCount}/5 步
          </div>
        </div>
        <ReadinessRing scorePct={readiness.scorePct} size={28} />
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
      <PeripheralAnchorSummary thesis={thesis} />
      <div className="px-3 font-mono text-xs text-ink-muted/80">1–5 切步 · F 专注 · ⌘K</div>
    </aside>
  );
}
