"use client";

import { calculateResearchReadiness, type ThesisDetail } from "@kanon/core";
import { Badge, Card } from "@kanon/ui";
import { IconArrowUpRight } from "@tabler/icons-react";
import Link from "next/link";

function IdentityCell({ thesis }: { thesis: ThesisDetail }) {
  return (
    <td className="px-5 py-4">
      <div className="flex items-center gap-3">
        <span className="font-mono text-xs text-ink-muted tabular-nums">{thesis.indexLabel}</span>
        <div>
          <Link
            href={`/thesis/${thesis.id}`}
            className="text-sm font-semibold text-ink-primary hover:text-accent-coral"
          >
            {thesis.companyName}
          </Link>
          <div className="mt-0.5 font-mono text-xs text-ink-muted">
            {thesis.ticker} · {thesis.sectorTag}
          </div>
        </div>
      </div>
    </td>
  );
}

function zoneBadgeVariant(zone: ThesisDetail["valuation"]["convictionZone"]) {
  if (zone === "attractive") return "pass" as const;
  if (zone === "balanced") return "titanium" as const;
  return "warn" as const;
}

function ProgressAndActionCells({
  thesisId,
  validated,
  completedSteps,
}: {
  thesisId: string;
  validated: number;
  completedSteps: number;
}) {
  return (
    <>
      <td className="px-4 py-4 text-right font-mono text-xs text-ink-secondary tabular-nums">
        <div>假设 {validated}/3</div>
        <div className="mt-0.5 text-ink-muted">成熟度 {completedSteps}/5</div>
      </td>
      <td className="px-5 py-4 text-right">
        <Link
          href={`/thesis/${thesisId}`}
          className="inline-flex items-center gap-1 rounded-control px-2.5 py-1 text-xs font-medium text-ink-primary hover:bg-titanium-subtle"
        >
          <span>画布</span>
          <IconArrowUpRight size={14} stroke={1.5} />
        </Link>
      </td>
    </>
  );
}

function ComparisonRow({ thesis }: { thesis: ThesisDetail }) {
  const { valuation } = thesis;
  const validated = thesis.hypotheses.filter((h) => h.status === "validated").length;
  const readiness = calculateResearchReadiness(thesis);
  const ratioText =
    valuation.riskRewardRatio !== null ? `${valuation.riskRewardRatio.toFixed(2)}×` : "∞";

  return (
    <tr className="border-t border-hairline transition-colors hover:bg-muted/45">
      <IdentityCell thesis={thesis} />
      <td className="px-4 py-4 text-right font-mono text-sm text-ink-primary tabular-nums">
        ${thesis.currentPrice.toFixed(2)}
      </td>
      <td className="px-4 py-4 text-right font-mono text-sm tabular-nums">
        <div className="font-semibold text-ink-primary">
          ${valuation.base.targetPrice.toFixed(1)}
        </div>
        <div className="text-xs text-status-pass">
          {valuation.upsidePct > 0 ? "+" : ""}
          {valuation.upsidePct.toFixed(1)}%
        </div>
      </td>
      <td className="px-4 py-4 text-right font-mono text-sm text-ink-primary tabular-nums">
        {valuation.base.cagrPct.toFixed(1)}%
      </td>
      <td className="px-4 py-4 text-right font-mono text-sm text-ink-secondary tabular-nums">
        -{Math.max(0, valuation.downsidePct).toFixed(1)}%
      </td>
      <td className="px-4 py-4 text-right">
        <Badge
          variant={zoneBadgeVariant(valuation.convictionZone)}
          className="font-mono tabular-nums"
        >
          {ratioText}
        </Badge>
      </td>
      <ProgressAndActionCells
        thesisId={thesis.id}
        validated={validated}
        completedSteps={readiness.completedCount}
      />
    </tr>
  );
}

export function PortfolioComparisonTable({ theses }: { theses: readonly ThesisDetail[] }) {
  const sorted = [...theses].sort(
    (a, b) => (b.valuation.riskRewardRatio ?? 99) - (a.valuation.riskRewardRatio ?? 99),
  );

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[780px] border-collapse text-left">
          <thead>
            <tr className="bg-muted/50 text-xs font-medium text-ink-muted">
              <th className="px-5 py-3.5">标的与赛道</th>
              <th className="px-4 py-3.5 text-right">当前参考价</th>
              <th className="px-4 py-3.5 text-right">中性目标 / 空间</th>
              <th className="px-4 py-3.5 text-right">年化 CAGR</th>
              <th className="px-4 py-3.5 text-right">悲观回撤</th>
              <th className="px-4 py-3.5 text-right">赔率比</th>
              <th className="px-4 py-3.5 text-right">研究进度</th>
              <th className="px-5 py-3.5 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((thesis) => (
              <ComparisonRow key={thesis.id} thesis={thesis} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
