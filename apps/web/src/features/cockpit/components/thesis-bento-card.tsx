"use client";

import {
  calculateResearchReadiness,
  type Hypothesis,
  type ResearchReadiness,
  type ThesisDetail,
} from "@kanon/core";
import { Badge, Card, cn, KANON_CARD_HOVER, ReadinessRing } from "@kanon/ui";
import { IconArrowRight, IconArrowUpRight } from "@tabler/icons-react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useMemo } from "react";
import { ValuationAnchorPanel } from "./valuation-anchor-panel";

export interface ThesisBentoCardProps {
  thesis: ThesisDetail;
  onQuickInspect: (thesis: ThesisDetail) => void;
}

const STEP_SHORT_NAMES: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "商业滤镜",
  2: "核心假设",
  3: "财报印证",
  4: "估值赔率",
  5: "交易纪律",
};

const DOT_CLASS: Record<Hypothesis["status"], string> = {
  validated: "bg-status-pass",
  watching: "bg-status-warn",
  warning: "bg-status-fail",
};

function resolveNextStepHref(thesisId: string, readiness: ResearchReadiness) {
  const next = readiness.steps.find((s) => !s.complete);
  if (!next) return { href: `/thesis/${thesisId}`, label: "进入画布", isContinue: false };
  return {
    href: `/thesis/${thesisId}?step=${next.step}`,
    label: `继续 · ${STEP_SHORT_NAMES[next.step]}`,
    isContinue: true,
  };
}

function CardIdentityHeader({
  thesis,
  readiness,
  targetHref,
}: {
  thesis: ThesisDetail;
  readiness: ResearchReadiness;
  targetHref: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={targetHref}
            className="text-xl font-semibold tracking-[-0.02em] text-ink-primary transition-colors hover:text-accent-coral"
          >
            {thesis.companyName}
          </Link>
          <span className="rounded-control bg-titanium px-2 py-0.5 font-mono text-xs font-semibold tracking-wide text-ink-primary tabular-nums">
            {thesis.ticker}
          </span>
          {thesis.currentWeightPct > 0 ? (
            <span className="rounded-pill border border-hairline bg-muted/60 px-2 py-0.5 font-mono text-xs text-ink-secondary tabular-nums">
              {thesis.currentWeightPct}%
            </span>
          ) : null}
          {thesis.status === "archived_veto" ? <Badge variant="fail">已否决</Badge> : null}
        </div>
        <div className="mt-1 truncate text-xs text-ink-muted">{thesis.sectorTag}</div>
      </div>
      <ReadinessRing
        scorePct={readiness.scorePct}
        size={22}
        label={`${readiness.completedCount}/5`}
      />
    </div>
  );
}

function HypothesisSignalButton({
  hypotheses,
  onClick,
}: {
  hypotheses: readonly Hypothesis[];
  onClick: () => void;
}) {
  const warnings = hypotheses.filter((h) => h.status === "warning").length;
  const validated = hypotheses.filter((h) => h.status === "validated").length;
  const label =
    warnings > 0
      ? `${warnings} 条预警`
      : validated === hypotheses.length
        ? `${validated}/${hypotheses.length} 已验证`
        : `假设 ${validated}/${hypotheses.length}`;

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-w-0 cursor-pointer items-center gap-2 rounded-control px-1.5 py-1 text-xs transition-colors hover:bg-muted/70"
      title="查看全部核心假设与速览校准"
    >
      <span className="flex shrink-0 items-center gap-1" aria-hidden="true">
        {hypotheses.map((h) => (
          <span key={h.id} className={cn("h-1.5 w-1.5 rounded-pill", DOT_CLASS[h.status])} />
        ))}
      </span>
      <span
        className={cn(
          "truncate font-medium",
          warnings > 0 ? "text-status-fail" : "text-ink-secondary",
        )}
      >
        {label}
      </span>
    </button>
  );
}

function CardActionFooter({
  thesis,
  readiness,
  onQuickInspect,
}: {
  thesis: ThesisDetail;
  readiness: ResearchReadiness;
  onQuickInspect: (thesis: ThesisDetail) => void;
}) {
  const next = resolveNextStepHref(thesis.id, readiness);
  return (
    <div className="flex items-center justify-between gap-2 border-t border-hairline px-5 py-3 sm:px-6">
      <HypothesisSignalButton
        hypotheses={thesis.hypotheses}
        onClick={() => onQuickInspect(thesis)}
      />
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={() => onQuickInspect(thesis)}
          className="inline-flex h-8 shrink-0 cursor-pointer items-center whitespace-nowrap rounded-control px-2.5 text-xs font-medium text-ink-secondary transition-colors hover:bg-muted hover:text-ink-primary"
        >
          速览
        </button>
        <Link
          href={next.href}
          className="inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-control px-2.5 text-xs font-medium text-ink-primary transition-colors hover:bg-titanium-subtle"
        >
          <span>{next.label}</span>
          {next.isContinue ? (
            <IconArrowRight
              size={14}
              stroke={1.5}
              className="text-accent-coral transition-transform duration-150 group-hover:translate-x-0.5"
            />
          ) : (
            <IconArrowUpRight
              size={14}
              stroke={1.5}
              className="transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
            />
          )}
        </Link>
      </div>
    </div>
  );
}

export function ThesisBentoCard({ thesis, onQuickInspect }: ThesisBentoCardProps) {
  const readiness = useMemo(() => calculateResearchReadiness(thesis), [thesis]);
  const next = resolveNextStepHref(thesis.id, readiness);

  return (
    <motion.article whileHover={KANON_CARD_HOVER}>
      <Card interactive className="group relative flex flex-col overflow-hidden">
        <div
          aria-hidden="true"
          className="h-[2px] w-full origin-left scale-x-0 bg-accent-coral transition-transform duration-200 group-hover:scale-x-100"
        />
        <CardIdentityHeader thesis={thesis} readiness={readiness} targetHref={next.href} />
        <ValuationAnchorPanel valuation={thesis.valuation} priceHistory={thesis.priceHistory} />
        <CardActionFooter thesis={thesis} readiness={readiness} onQuickInspect={onQuickInspect} />
      </Card>
    </motion.article>
  );
}
