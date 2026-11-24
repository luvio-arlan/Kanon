"use client";

import { calculateResearchReadiness, type ThesisDetail } from "@kanon/core";
import { Badge, Card, KANON_CARD_HOVER, KANON_FADE_UP_ITEM, ReadinessRing } from "@kanon/ui";
import { IconArrowUpRight } from "@tabler/icons-react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useMemo } from "react";
import { HypothesisLedger } from "./hypothesis-ledger";
import { ValuationAnchorPanel } from "./valuation-anchor-panel";

export interface ThesisBentoCardProps {
  thesis: ThesisDetail;
  onQuickInspect: (thesis: ThesisDetail) => void;
}

function CardIdentityHeader({ thesis }: { thesis: ThesisDetail }) {
  const readiness = useMemo(() => calculateResearchReadiness(thesis), [thesis]);
  return (
    <div className="flex items-start justify-between gap-4 px-7 pb-5 pt-6">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/thesis/${thesis.id}`}
            className="text-[22px] font-semibold tracking-[-0.02em] text-ink-primary transition-colors hover:text-accent-coral"
          >
            {thesis.companyName}
          </Link>
          <span className="rounded-control bg-titanium px-2.5 py-0.5 font-mono text-xs font-semibold tracking-wide text-ink-primary tabular-nums">
            {thesis.ticker}
          </span>
          {thesis.currentWeightPct > 0 ? (
            <span className="rounded-pill border border-hairline bg-muted/60 px-2 py-0.5 font-mono text-xs text-ink-secondary tabular-nums">
              {thesis.currentWeightPct}% 仓位
            </span>
          ) : null}
          {thesis.status === "archived_veto" ? <Badge variant="fail">已否决归档</Badge> : null}
        </div>
        <div className="mt-1.5 text-sm text-ink-secondary">{thesis.sectorTag}</div>
      </div>

      <div className="flex items-center gap-3">
        <ReadinessRing
          scorePct={readiness.scorePct}
          size={22}
          label={`${readiness.completedCount}/5`}
        />
        <span className="font-mono text-3xl font-light leading-none tracking-tight text-ink-muted/45 tabular-nums select-none">
          {thesis.indexLabel}
        </span>
      </div>
    </div>
  );
}

function CardActionFooter({
  thesis,
  onQuickInspect,
}: {
  thesis: ThesisDetail;
  onQuickInspect: (thesis: ThesisDetail) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5 border-t border-hairline px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-7 sm:py-4">
      <span className="text-xs text-ink-muted tabular-nums">{thesis.lastReviewedAt}</span>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => onQuickInspect(thesis)}
          className="inline-flex h-8 shrink-0 cursor-pointer items-center whitespace-nowrap rounded-control px-2.5 text-xs font-medium text-ink-secondary transition-[transform,background-color,color] duration-150 hover:bg-muted hover:text-ink-primary active:scale-[0.97]"
        >
          速览与校准
        </button>
        <Link
          href={`/thesis/${thesis.id}`}
          className="inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-control px-2.5 text-sm font-medium text-ink-primary transition-[transform,background-color] duration-150 hover:bg-titanium-subtle active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-coral"
        >
          <span>进入研究画布</span>
          <IconArrowUpRight
            size={15}
            stroke={1.5}
            className="transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
          />
        </Link>
      </div>
    </div>
  );
}

export function ThesisBentoCard({ thesis, onQuickInspect }: ThesisBentoCardProps) {
  return (
    <motion.article variants={KANON_FADE_UP_ITEM} whileHover={KANON_CARD_HOVER}>
      <Card interactive className="group relative flex flex-col overflow-hidden">
        <div
          aria-hidden="true"
          className="h-[2px] w-full origin-left scale-x-0 bg-accent-coral transition-transform duration-200 group-hover:scale-x-100"
        />
        <CardIdentityHeader thesis={thesis} />
        <ValuationAnchorPanel valuation={thesis.valuation} priceHistory={thesis.priceHistory} />
        <HypothesisLedger hypotheses={thesis.hypotheses} />
        <CardActionFooter thesis={thesis} onQuickInspect={onQuickInspect} />
      </Card>
    </motion.article>
  );
}
