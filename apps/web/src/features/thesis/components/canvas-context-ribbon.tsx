"use client";

import {
  calculateImpliedExpectations,
  calculateResearchReadiness,
  type MarketQuoteSnapshot,
  type ThesisDetail,
} from "@kanon/core";
import { Badge, Button, cn, MarketSessionBadge } from "@kanon/ui";
import { IconArrowRight, IconCheck, IconSparkles } from "@tabler/icons-react";
import type { StepId } from "./step-rail";

const STEP_SHORT: ReadonlyArray<{ step: StepId; label: string }> = [
  { step: 1, label: "商业滤镜" },
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
  const exp = calculateImpliedExpectations({ summary: thesis.valuation });
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
      <span className="font-medium text-ink-primary">${live.toFixed(2)}</span>
      <span className="text-ink-muted">→ 目标 ${thesis.valuation.base.targetPrice.toFixed(1)}</span>
      <Badge variant={below15 ? "pass" : "titanium"}>
        {below15 ? "买点内" : `赔率 ${ratioText}`}
      </Badge>
    </div>
  );
}

function HorizontalStepPills({
  thesis,
  activeStep,
  onSelectStep,
}: {
  thesis: ThesisDetail;
  activeStep: StepId;
  onSelectStep: (step: StepId) => void;
}) {
  const readiness = calculateResearchReadiness(thesis);
  return (
    <div className="hidden items-center gap-1 xl:flex" role="tablist" aria-label="五步研究流程">
      {STEP_SHORT.map((item, idx) => {
        const done = readiness.steps[idx]?.complete ?? false;
        const active = item.step === activeStep;
        return (
          <button
            key={item.step}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelectStep(item.step)}
            className={cn(
              "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-control px-2.5 text-xs font-medium transition-colors",
              active
                ? "border border-strong bg-surface text-ink-primary shadow-pill-active"
                : "border border-transparent text-ink-secondary hover:bg-muted/70 hover:text-ink-primary",
            )}
          >
            {done ? (
              <IconCheck size={12} stroke={1.5} className="text-status-pass" />
            ) : (
              <span className="font-mono text-ink-muted">0{item.step}</span>
            )}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function CanvasContextRibbon({
  thesis,
  activeStep,
  liveQuote,
  onSelectStep,
  onOpenAgent,
}: {
  thesis: ThesisDetail;
  activeStep: StepId;
  liveQuote: MarketQuoteSnapshot | null;
  onSelectStep: (step: StepId) => void;
  onOpenAgent: () => void;
}) {
  const nextStep = activeStep < 5 ? ((activeStep + 1) as StepId) : null;
  return (
    <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3 rounded-card border border-hairline bg-surface/95 px-4 py-2.5 shadow-card">
      <RibbonPriceTelemetry thesis={thesis} quote={liveQuote} />
      <HorizontalStepPills thesis={thesis} activeStep={activeStep} onSelectStep={onSelectStep} />
      <div className="flex shrink-0 items-center gap-1.5">
        <Button variant="titanium" size="xs" onClick={onOpenAgent}>
          <IconSparkles size={13} stroke={1.5} className="text-accent-coral" />
          <span>IC Agent</span>
        </Button>
        {nextStep ? (
          <Button variant="outline" size="xs" onClick={() => onSelectStep(nextStep)}>
            <span>下一步</span>
            <IconArrowRight size={13} stroke={1.5} />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
