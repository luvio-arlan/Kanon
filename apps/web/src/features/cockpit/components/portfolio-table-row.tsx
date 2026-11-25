"use client";

import {
  calculateImpliedExpectations,
  calculateResearchReadiness,
  type ThesisDetail,
} from "@kanon/core";
import { Badge, Button, buttonVariants, cn, ReadinessRing } from "@kanon/ui";
import { IconArrowUpRight, IconCheck } from "@tabler/icons-react";
import Link from "next/link";

function zoneBadgeVariant(zone: ThesisDetail["valuation"]["convictionZone"]) {
  if (zone === "attractive") return "pass" as const;
  if (zone === "balanced") return "titanium" as const;
  return "warn" as const;
}

function IdentityCell({
  thesis,
  checked,
  disableCheck,
  onToggle,
}: {
  thesis: ThesisDetail;
  checked: boolean;
  disableCheck: boolean;
  onToggle: () => void;
}) {
  return (
    <td className="min-w-[176px] px-4 py-3.5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggle}
          disabled={!checked && disableCheck}
          aria-label={`选择对比 ${thesis.ticker}`}
          className={cn(
            "flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded border transition-colors disabled:cursor-not-allowed disabled:opacity-35",
            checked
              ? "border-ink-primary bg-ink-primary text-ink-inverse"
              : "border-strong bg-surface hover:border-ink-primary",
          )}
        >
          {checked ? <IconCheck size={11} stroke={1.5} /> : null}
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2 whitespace-nowrap">
            <Link
              href={`/thesis/${thesis.id}`}
              className="text-base font-semibold text-ink-primary hover:text-accent-coral"
            >
              {thesis.companyName}
            </Link>
            {thesis.currentWeightPct > 0 ? (
              <span className="font-mono text-xs text-ink-muted tabular-nums">
                {thesis.currentWeightPct}%
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 whitespace-nowrap font-mono text-xs text-ink-muted">
            {thesis.ticker} · {thesis.sectorTag}
          </div>
        </div>
      </div>
    </td>
  );
}

function ValuationMetricCells({ thesis }: { thesis: ThesisDetail }) {
  const { valuation } = thesis;
  const exp = calculateImpliedExpectations({ summary: valuation });
  return (
    <>
      <td className="whitespace-nowrap px-3 py-3.5 text-right font-mono text-sm text-ink-primary tabular-nums">
        <div>${thesis.currentPrice.toFixed(2)}</div>
        <div className="text-xs text-ink-muted">买点 ${exp.hurdleEntry15.toFixed(1)}</div>
      </td>
      <td className="whitespace-nowrap px-3 py-3.5 text-right font-mono text-sm tabular-nums">
        <div className="font-semibold text-ink-primary">
          ${valuation.base.targetPrice.toFixed(1)}
        </div>
        <div
          className={
            valuation.upsidePct >= 0 ? "text-xs text-status-pass" : "text-xs text-status-fail"
          }
        >
          {valuation.upsidePct > 0 ? "+" : ""}
          {valuation.upsidePct.toFixed(1)}%
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-3.5 text-right font-mono text-sm text-ink-primary tabular-nums">
        {valuation.base.cagrPct.toFixed(1)}%
      </td>
      <td className="whitespace-nowrap px-3 py-3.5 text-right font-mono text-sm tabular-nums">
        <span className={exp.marginOfSafetyPct >= 25 ? "text-status-pass" : "text-ink-primary"}>
          {exp.marginOfSafetyPct.toFixed(1)}%
        </span>
      </td>
      <td className="whitespace-nowrap px-3 py-3.5 text-right font-mono text-sm text-ink-secondary tabular-nums">
        {valuation.bear.returnPct > 0 ? "+" : ""}
        {valuation.bear.returnPct.toFixed(1)}%
      </td>
    </>
  );
}

function RowActionsCell({
  thesis,
  onQuickInspect,
}: {
  thesis: ThesisDetail;
  onQuickInspect: (t: ThesisDetail) => void;
}) {
  return (
    <td className="whitespace-nowrap px-4 py-3.5 text-right">
      <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <Button variant="outline" size="xs" onClick={() => onQuickInspect(thesis)}>
          速览
        </Button>
        <Link
          href={`/thesis/${thesis.id}`}
          className={buttonVariants({ variant: "titanium", size: "xs" })}
        >
          <span>进入</span>
          <IconArrowUpRight size={13} stroke={1.5} />
        </Link>
      </div>
    </td>
  );
}

export function PortfolioComparisonRow({
  thesis,
  checked,
  disableCheck,
  onToggle,
  onQuickInspect,
}: {
  thesis: ThesisDetail;
  checked: boolean;
  disableCheck: boolean;
  onToggle: () => void;
  onQuickInspect: (t: ThesisDetail) => void;
}) {
  const { valuation } = thesis;
  const readiness = calculateResearchReadiness(thesis);
  const ratioText =
    valuation.riskRewardRatio !== null ? `${valuation.riskRewardRatio.toFixed(2)}×` : "∞";

  return (
    <tr className="border-t border-hairline transition-colors hover:bg-muted/45">
      <IdentityCell
        thesis={thesis}
        checked={checked}
        disableCheck={disableCheck}
        onToggle={onToggle}
      />
      <ValuationMetricCells thesis={thesis} />
      <td className="whitespace-nowrap px-3 py-3.5 text-right">
        <Badge
          variant={zoneBadgeVariant(valuation.convictionZone)}
          className="font-mono tabular-nums"
        >
          {ratioText}
        </Badge>
      </td>
      <td className="whitespace-nowrap px-3 py-3.5 text-right">
        <div className="flex justify-end">
          <ReadinessRing
            scorePct={readiness.scorePct}
            size={20}
            label={`${readiness.completedCount}/5`}
          />
        </div>
      </td>
      <RowActionsCell thesis={thesis} onQuickInspect={onQuickInspect} />
    </tr>
  );
}
