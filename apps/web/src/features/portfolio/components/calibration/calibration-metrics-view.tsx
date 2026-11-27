"use client";

import type { PortfolioCalibrationReport } from "@kanon/core";
import { Badge, Card, cn } from "@kanon/ui";
import { DecisionMatrixView } from "./decision-matrix-view";

function KpiCell(props: { label: string; value: string; tone?: string }) {
  return (
    <Card className="p-3.5">
      <div className="text-xs text-ink-muted">{props.label}</div>
      <div
        className={cn(
          "mt-1 font-mono text-lg font-semibold tabular-nums",
          props.tone ?? "text-ink-primary",
        )}
      >
        {props.value}
      </div>
    </Card>
  );
}

function VerdictTrackCard({ report }: { report: PortfolioCalibrationReport }) {
  const v = report.verdictSummary;
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="text-xs font-medium text-ink-secondary">
        季度复盘裁决轨迹（共 {v.totalVerdicts} 条假设裁决）
      </div>
      <div className="flex flex-wrap items-center gap-2 font-mono text-xs tabular-nums">
        <Badge variant="pass">强化 {v.strengthenedCount}</Badge>
        <Badge variant="titanium">持平 {v.unchangedCount}</Badge>
        <Badge variant="warn">转弱 {v.weakenedCount}</Badge>
      </div>
    </Card>
  );
}

function PositionRowCells({ row }: { row: PortfolioCalibrationReport["positionRows"][number] }) {
  const returnTone =
    row.unrealisedReturnPct === null
      ? "text-ink-muted"
      : row.unrealisedReturnPct >= 0
        ? "text-status-pass"
        : "text-status-warn";
  const returnText =
    row.unrealisedReturnPct !== null
      ? `${row.unrealisedReturnPct >= 0 ? "+" : ""}${row.unrealisedReturnPct.toFixed(1)}%`
      : "—";
  return (
    <tr>
      <td className="px-4 py-2.5 font-sans font-medium text-ink-primary">
        {row.ticker} <span className="text-ink-muted">{row.companyName}</span>
      </td>
      <td className="px-4 py-2.5 text-right text-ink-primary">
        {row.currentWeightPct.toFixed(1)}%
      </td>
      <td className="px-4 py-2.5 text-right text-ink-secondary">
        {row.kellyCappedWeightPct.toFixed(1)}%
      </td>
      <td className={cn("px-4 py-2.5 text-right", returnTone)}>{returnText}</td>
      <td className="px-4 py-2.5 text-right text-ink-primary">{row.calibrationScore}</td>
    </tr>
  );
}

function PositionEfficiencyTable({ report }: { report: PortfolioCalibrationReport }) {
  if (report.positionRows.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold text-ink-muted">在仓标的 Kelly 上限与未实现盈亏</h3>
      <div className="overflow-x-auto rounded-card border border-hairline bg-surface">
        <table className="w-full min-w-[520px] text-left text-xs">
          <thead className="border-b border-hairline bg-canvas/50 text-ink-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium">标的</th>
              <th className="px-4 py-2.5 text-right font-medium">现仓位</th>
              <th className="px-4 py-2.5 text-right font-medium">Kelly 建议</th>
              <th className="px-4 py-2.5 text-right font-medium">浮动回报</th>
              <th className="px-4 py-2.5 text-right font-medium">校准分</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline font-mono tabular-nums">
            {report.positionRows.map((row) => (
              <PositionRowCells key={row.thesisId} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function CalibrationMetricsView({ report }: { report: PortfolioCalibrationReport }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCell label="加权认知校准分" value={`${report.weightedCalibrationScore}`} />
        <KpiCell
          label="零杠杆守则率"
          value={`${report.zeroLeverageCompliancePct}%`}
          tone={report.zeroLeverageCompliancePct === 100 ? "text-status-pass" : "text-status-warn"}
        />
        <KpiCell label="冷静决策占比" value={`${report.calmSharePct}%`} />
        <KpiCell
          label="顺向决策胜率"
          value={report.overallWinRatePct !== null ? `${report.overallWinRatePct}%` : "—"}
        />
      </div>
      <DecisionMatrixView />
      <VerdictTrackCard report={report} />
      <PositionEfficiencyTable report={report} />
    </div>
  );
}
