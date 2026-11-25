"use client";

import {
  calculateImpliedExpectations,
  calculateResearchReadiness,
  type ThesisDetail,
} from "@kanon/core";
import { ReadinessRing, RollingNumber, SidebarNavItem, SidebarSection } from "@kanon/ui";
import { IconCheck } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { useMemo } from "react";

export type StepId = 1 | 2 | 3 | 4 | 5;

const STEPS: ReadonlyArray<{ id: StepId; code: string; title: string }> = [
  { id: 1, code: "01", title: "商业质量评估" },
  { id: 2, code: "02", title: "核心假设拆解" },
  { id: 3, code: "03", title: "一阶资料印证" },
  { id: 4, code: "04", title: "三情景估值赔率" },
  { id: 5, code: "05", title: "纪律与备忘录" },
];

function AnchorMetricRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-ink-muted">{label}</span>
      {value}
    </div>
  );
}

function AnchorHeadline({
  horizonYears,
  targetPrice,
  ratio,
}: {
  horizonYears: number;
  targetPrice: number;
  ratio: string;
}) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-2 text-xs text-ink-muted">
        <span className="font-medium">中性目标价</span>
        <span className="font-mono tabular-nums">{horizonYears}Y</span>
      </div>
      <div className="mt-1.5 flex items-baseline justify-between gap-2">
        <RollingNumber
          value={targetPrice}
          prefix="$"
          decimals={1}
          className="text-2xl font-light tracking-[-0.035em] text-ink-primary"
        />
        <span className="font-mono text-xs font-semibold text-accent-coral tabular-nums">
          {ratio}
        </span>
      </div>
    </>
  );
}

function ValuationAnchorCard({ thesis }: { thesis: ThesisDetail }) {
  const { valuation } = thesis;
  const exp = useMemo(() => calculateImpliedExpectations({ summary: valuation }), [valuation]);
  const ratio =
    valuation.riskRewardRatio !== null ? `${valuation.riskRewardRatio.toFixed(2)}×` : "∞";
  const hurdleCls = exp.isBelowHurdle15
    ? "font-mono font-semibold text-status-pass tabular-nums"
    : "font-mono text-ink-secondary tabular-nums";

  return (
    <div className="overflow-hidden rounded-control border border-hairline bg-surface p-3 shadow-card">
      <AnchorHeadline
        horizonYears={valuation.horizonYears}
        targetPrice={valuation.base.targetPrice}
        ratio={ratio}
      />
      <div className="mt-2.5 space-y-1.5 border-t border-hairline pt-2 text-xs">
        <AnchorMetricRow
          label="当前参考"
          value={
            <span className="font-mono font-medium text-ink-primary tabular-nums">
              ${thesis.currentPrice.toFixed(1)}
            </span>
          }
        />
        <AnchorMetricRow
          label="安全边际"
          value={
            <span className="font-mono font-medium text-ink-primary tabular-nums">
              {exp.marginOfSafetyPct.toFixed(0)}%
            </span>
          }
        />
        <AnchorMetricRow
          label="15% 安全买点"
          value={
            <span className={hurdleCls}>
              <RollingNumber value={exp.hurdleEntry15} prefix="$" decimals={1} />
            </span>
          }
        />
      </div>
    </div>
  );
}

function StepProgressHeader({
  completedCount,
  scorePct,
}: {
  completedCount: number;
  scorePct: number;
}) {
  return (
    <div className="flex items-center justify-between px-1">
      <span className="font-mono text-xs text-ink-muted tabular-nums">
        进度 {completedCount} / 5
      </span>
      <ReadinessRing scorePct={scorePct} size={22} />
    </div>
  );
}

export function StepRail({
  activeStep,
  thesis,
  collapsed = false,
  onSelect,
}: {
  activeStep: StepId;
  thesis: ThesisDetail;
  collapsed?: boolean;
  onSelect: (step: StepId) => void;
}) {
  const readiness = useMemo(() => calculateResearchReadiness(thesis), [thesis]);

  return (
    <div className="space-y-3">
      {!collapsed ? (
        <StepProgressHeader
          completedCount={readiness.completedCount}
          scorePct={readiness.scorePct}
        />
      ) : null}
      <SidebarSection title="研究步骤" collapsed={collapsed}>
        {STEPS.map((step, idx) => (
          <SidebarNavItem
            key={step.id}
            label={step.title}
            code={step.code}
            active={activeStep === step.id}
            collapsed={collapsed}
            layoutId="research-step-tab"
            trailing={
              readiness.steps[idx]?.complete ? (
                <IconCheck size={14} stroke={1.5} className="text-status-pass" />
              ) : null
            }
            onClick={() => onSelect(step.id)}
          />
        ))}
      </SidebarSection>
      {!collapsed ? <ValuationAnchorCard thesis={thesis} /> : null}
    </div>
  );
}
