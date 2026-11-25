"use client";

import {
  calculateImpliedExpectations,
  calculateResearchReadiness,
  type MarketQuoteSnapshot,
  type ThesisDetail,
} from "@kanon/core";
import {
  Badge,
  Button,
  cn,
  KANON_TAB_TRANSITION,
  KANON_TRANSITION_FAST,
  MarketSessionBadge,
  RollingNumber,
  Spinner,
} from "@kanon/ui";
import { IconArrowRight, IconCheck, IconSparkles } from "@tabler/icons-react";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo } from "react";
import type { AutoSaveStatus } from "@/shared/hooks/use-thesis-step-draft";
import type { StepId } from "./step-rail";

const STEP_SHORT: ReadonlyArray<{ step: StepId; label: string }> = [
  { step: 1, label: "商业质量" },
  { step: 2, label: "假设催化" },
  { step: 3, label: "一阶印证" },
  { step: 4, label: "估值赔率" },
  { step: 5, label: "交易纪律" },
];

function RibbonPriceTelemetry({
  thesis,
  quote,
}: {
  thesis: ThesisDetail;
  quote: MarketQuoteSnapshot | null;
}) {
  const exp = useMemo(
    () => calculateImpliedExpectations({ summary: thesis.valuation }),
    [thesis.valuation],
  );
  const live = quote?.effectivePrice ?? thesis.currentPrice;
  const below15 = live <= exp.hurdleEntry15;
  const ratioText =
    thesis.valuation.riskRewardRatio !== null
      ? `${thesis.valuation.riskRewardRatio.toFixed(2)}×`
      : "∞";

  return (
    <div className="flex flex-wrap items-center gap-2 font-mono text-xs tabular-nums">
      <span className="font-semibold text-ink-primary">{thesis.ticker}</span>
      {quote ? <MarketSessionBadge session={quote.sessionState} compact /> : null}
      <RollingNumber
        value={live}
        prefix="$"
        decimals={2}
        className="font-medium text-ink-primary"
      />
      <span className="inline-flex items-center gap-1 text-ink-muted">
        <span>→</span>
        <RollingNumber value={thesis.valuation.base.targetPrice} prefix="$" decimals={1} />
      </span>
      <Badge variant={below15 ? "pass" : "titanium"}>
        {below15 ? "买点内" : `赔率 ${ratioText}`}
      </Badge>
    </div>
  );
}

function HorizontalStepPills({
  completedSteps,
  activeStep,
  onSelectStep,
}: {
  completedSteps: ReadonlyArray<boolean>;
  activeStep: StepId;
  onSelectStep: (step: StepId) => void;
}) {
  return (
    <div className="hidden items-center gap-0.5 2xl:flex" role="tablist" aria-label="五步研究流程">
      {STEP_SHORT.map((item, idx) => {
        const done = completedSteps[idx] ?? false;
        const active = item.step === activeStep;
        return (
          <button
            key={item.step}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelectStep(item.step)}
            className={cn(
              "relative inline-flex h-8 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-control px-2.5 text-xs font-medium transition-colors duration-150 ease-[var(--ease-kanon)]",
              active
                ? "text-ink-primary"
                : "text-ink-secondary hover:bg-muted/70 hover:text-ink-primary",
            )}
          >
            {active ? (
              <motion.span
                layoutId="canvas-ribbon-step-pill"
                transition={KANON_TAB_TRANSITION}
                className="pointer-events-none absolute inset-0 rounded-control border border-strong bg-surface shadow-pill-active"
              />
            ) : null}
            <span className="relative z-10 inline-flex items-center gap-1.5">
              {done ? (
                <IconCheck size={12} stroke={1.5} className="text-status-pass" />
              ) : (
                <span className="font-mono text-ink-muted">0{item.step}</span>
              )}
              <span>{item.label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function QuietSyncIndicator({ status, onRetry }: { status: AutoSaveStatus; onRetry: () => void }) {
  return (
    <AnimatePresence initial={false}>
      {status !== "idle" ? (
        <motion.span
          key={status}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={KANON_TRANSITION_FAST}
          className="inline-flex items-center gap-1 pr-1 text-xs"
        >
          {status === "saving" ? (
            <Spinner size="xs" decorative className="text-ink-muted" />
          ) : status === "saved" ? (
            <span className="inline-flex items-center gap-1 text-ink-muted">
              <IconCheck size={12} stroke={1.5} className="text-status-pass" />
              <span>已保存</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={onRetry}
              className="cursor-pointer font-medium text-accent-coral hover:underline"
            >
              重试保存
            </button>
          )}
        </motion.span>
      ) : null}
    </AnimatePresence>
  );
}

function RibbonActions({
  nextStep,
  syncStatus,
  onRetrySave,
  onSelectStep,
  onOpenAgent,
}: {
  nextStep: StepId | null;
  syncStatus: AutoSaveStatus;
  onRetrySave: () => void;
  onSelectStep: (step: StepId) => void;
  onOpenAgent: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <QuietSyncIndicator status={syncStatus} onRetry={onRetrySave} />
      <Button variant="titanium" size="xs" onClick={onOpenAgent}>
        <IconSparkles size={13} stroke={1.5} className="text-accent-coral" />
        <span>IC Agent</span>
      </Button>
      {nextStep ? (
        <Button
          variant="outline"
          size="xs"
          onClick={() => onSelectStep(nextStep)}
          className="group/next"
        >
          <span>下一步</span>
          <IconArrowRight
            size={13}
            stroke={1.5}
            className="transition-transform duration-150 group-hover/next:translate-x-0.5"
          />
        </Button>
      ) : null}
    </div>
  );
}

export function CanvasContextRibbon({
  thesis,
  activeStep,
  liveQuote,
  syncStatus = "idle",
  onRetrySave,
  onSelectStep,
  onOpenAgent,
}: {
  thesis: ThesisDetail;
  activeStep: StepId;
  liveQuote: MarketQuoteSnapshot | null;
  syncStatus?: AutoSaveStatus;
  onRetrySave?: () => void;
  onSelectStep: (step: StepId) => void;
  onOpenAgent: () => void;
}) {
  const readiness = useMemo(() => calculateResearchReadiness(thesis), [thesis]);
  const nextStep = activeStep < 5 ? ((activeStep + 1) as StepId) : null;
  return (
    <div className="no-print kanon-glass-ribbon sticky top-3 z-20 mb-6 rounded-card border border-hairline">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        <RibbonPriceTelemetry thesis={thesis} quote={liveQuote} />
        <HorizontalStepPills
          completedSteps={readiness.steps.map((s) => s.complete)}
          activeStep={activeStep}
          onSelectStep={onSelectStep}
        />
        <RibbonActions
          nextStep={nextStep}
          syncStatus={syncStatus}
          onRetrySave={onRetrySave ?? (() => undefined)}
          onSelectStep={onSelectStep}
          onOpenAgent={onOpenAgent}
        />
      </div>
    </div>
  );
}
