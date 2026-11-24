"use client";

import {
  calculatePeerCompsTable,
  type MarketQuoteSnapshot,
  type PeerCompRow,
  type PeerCompsMedians,
  type ThesisDetail,
} from "@kanon/core";
import { Badge, buttonVariants, Card, cn, MarketSessionBadge } from "@kanon/ui";
import { IconArrowUpRight, IconChartHistogram } from "@tabler/icons-react";
import Link from "next/link";
import { useMemo } from "react";

function formatPct(val: number | null, signed = false): string {
  if (val === null) return "—";
  const prefix = signed && val > 0 ? "+" : "";
  return `${prefix}${val.toFixed(1)}%`;
}

function PeerMetricsCells({ row }: { row: PeerCompRow }) {
  const gapLabel =
    row.weightGapPct > 1
      ? `可增 +${row.weightGapPct.toFixed(0)}%`
      : row.weightGapPct < -1
        ? `超配 ${row.weightGapPct.toFixed(0)}%`
        : "均衡";
  return (
    <>
      <td className="whitespace-nowrap px-3 py-3.5 text-right font-mono text-sm text-ink-secondary tabular-nums">
        {formatPct(row.drawdownFrom52wHighPct)}
      </td>
      <td className="whitespace-nowrap px-3 py-3.5 text-right font-mono text-sm tabular-nums">
        <div className="font-semibold text-ink-primary">${row.baseTargetPrice.toFixed(1)}</div>
        <div className="text-xs text-status-pass">{formatPct(row.upsidePct, true)}</div>
      </td>
      <td className="whitespace-nowrap px-3 py-3.5 text-right font-mono text-sm text-ink-primary tabular-nums">
        {row.baseCagrPct.toFixed(1)}%
      </td>
      <td className="whitespace-nowrap px-3 py-3.5 text-right font-mono text-sm tabular-nums">
        <span className={row.marginOfSafetyPct >= 25 ? "text-status-pass" : "text-ink-primary"}>
          {row.marginOfSafetyPct.toFixed(1)}%
        </span>
      </td>
      <td className="whitespace-nowrap px-3 py-3.5 text-right font-mono text-sm tabular-nums">
        <Badge variant={(row.riskRewardRatio ?? 99) >= 2.5 ? "pass" : "titanium"}>
          {row.riskRewardRatio !== null ? `${row.riskRewardRatio.toFixed(2)}×` : "∞"}
        </Badge>
      </td>
      <td className="whitespace-nowrap px-3 py-3.5 text-right font-mono text-xs tabular-nums">
        <div className="text-ink-primary">
          {row.currentWeightPct}% / 凯利 {row.kellyMaxPct}%
        </div>
        <div className="text-ink-muted">{gapLabel}</div>
      </td>
      <td className="whitespace-nowrap px-3 py-3.5 text-right font-mono text-xs text-ink-secondary tabular-nums">
        {row.upcomingCatalysts} 项
      </td>
    </>
  );
}

function PeerCompTr({ row }: { row: PeerCompRow }) {
  return (
    <tr className="border-t border-hairline transition-colors hover:bg-muted/35">
      <td className="whitespace-nowrap px-4 py-3.5">
        <div className="flex items-center gap-2">
          <Link
            href={`/thesis/${row.thesisId}`}
            className="text-sm font-semibold text-ink-primary hover:text-accent-coral"
          >
            {row.companyName}
          </Link>
          <Badge variant="titanium" className="font-mono">
            {row.ticker}
          </Badge>
        </div>
        <div className="mt-0.5 text-xs text-ink-muted">{row.sectorTag}</div>
      </td>
      <td className="whitespace-nowrap px-3 py-3.5 text-right font-mono text-sm tabular-nums">
        <div className="font-medium text-ink-primary">${row.livePrice.toFixed(2)}</div>
        <div className="mt-0.5 flex items-center justify-end gap-1.5">
          {row.sessionState ? <MarketSessionBadge session={row.sessionState} compact /> : null}
          {row.belowHurdle15 ? (
            <span className="text-xs font-medium text-status-pass">买点内</span>
          ) : null}
        </div>
      </td>
      <PeerMetricsCells row={row} />
      <td className="whitespace-nowrap px-4 py-3.5 text-right">
        <Link
          href={`/thesis/${row.thesisId}?step=4`}
          className={cn(buttonVariants({ variant: "outline", size: "xs" }), "group/cta")}
        >
          <span>估值</span>
          <IconArrowUpRight
            size={13}
            stroke={1.5}
            className="transition-transform duration-150 group-hover/cta:-translate-y-0.5 group-hover/cta:translate-x-0.5"
          />
        </Link>
      </td>
    </tr>
  );
}

function MediansFooterRow({ medians }: { medians: PeerCompsMedians }) {
  return (
    <tr className="border-t border-strong bg-muted/55 font-mono text-xs font-semibold text-ink-primary tabular-nums">
      <td className="px-4 py-3 font-sans">组合中位数基准（MEDIAN）</td>
      <td className="px-3 py-3 text-right text-ink-muted">—</td>
      <td className="px-3 py-3 text-right text-ink-muted">—</td>
      <td className="px-3 py-3 text-right text-status-pass">
        {formatPct(medians.upsidePct, true)}
      </td>
      <td className="px-3 py-3 text-right">{formatPct(medians.baseCagrPct)}</td>
      <td className="px-3 py-3 text-right">{formatPct(medians.marginOfSafetyPct)}</td>
      <td className="px-3 py-3 text-right">
        {medians.riskRewardRatio !== null ? `${medians.riskRewardRatio.toFixed(2)}×` : "—"}
      </td>
      <td className="px-3 py-3 text-right text-ink-muted">
        成熟度 {medians.readinessScore ?? "—"}%
      </td>
      <td className="px-3 py-3 text-right text-ink-muted">—</td>
      <td className="px-4 py-3" />
    </tr>
  );
}

export function PeerExpectationsMatrix({
  theses,
  liveQuotes,
}: {
  theses: readonly ThesisDetail[];
  liveQuotes: Readonly<Record<string, MarketQuoteSnapshot>>;
}) {
  const table = useMemo(() => calculatePeerCompsTable(theses, liveQuotes), [theses, liveQuotes]);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-4">
        <div className="flex items-center gap-2">
          <IconChartHistogram size={17} stroke={1.5} className="text-accent-coral" />
          <span className="text-sm font-semibold text-ink-primary">
            同业预期横评与半凯利仓位校准矩阵
          </span>
        </div>
        <span className="font-mono text-xs text-ink-muted tabular-nums">
          实时结合盘前/盘后价与 52W 区间回撤
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] border-collapse text-left">
          <thead>
            <tr className="bg-muted/45 text-xs font-medium text-ink-muted">
              <th className="whitespace-nowrap px-4 py-3">标的与赛道</th>
              <th className="whitespace-nowrap px-3 py-3 text-right">实时价 / 买点</th>
              <th className="whitespace-nowrap px-3 py-3 text-right">距 52W 高</th>
              <th className="whitespace-nowrap px-3 py-3 text-right">3Y 中性目标</th>
              <th className="whitespace-nowrap px-3 py-3 text-right">年化 CAGR</th>
              <th className="whitespace-nowrap px-3 py-3 text-right">安全边际</th>
              <th className="whitespace-nowrap px-3 py-3 text-right">赔率比</th>
              <th className="whitespace-nowrap px-3 py-3 text-right">现仓 / 凯利</th>
              <th className="whitespace-nowrap px-3 py-3 text-right">待验催化</th>
              <th className="whitespace-nowrap px-4 py-3 text-right">画布</th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <PeerCompTr key={row.thesisId} row={row} />
            ))}
            {table.rows.length > 0 ? <MediansFooterRow medians={table.medians} /> : null}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
