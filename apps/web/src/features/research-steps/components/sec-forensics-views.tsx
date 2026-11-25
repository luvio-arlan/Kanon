"use client";

import type { ForensicRedFlag, SecForensicReport, SecQuarterlyFinancial } from "@kanon/core";
import { Badge, ReadinessRing } from "@kanon/ui";
import { IconAlertTriangle, IconShieldCheck } from "@tabler/icons-react";
import {
  buildForensicCells,
  type ForensicCellTone,
  formatCompact,
  formatPct,
} from "../lib/forensic-cells";

function MetricCell({
  label,
  value,
  tone = "primary",
}: {
  label: string;
  value: string;
  tone?: ForensicCellTone;
}) {
  const toneMap = {
    pass: "text-status-pass",
    warn: "text-status-warn",
    muted: "text-ink-secondary",
    primary: "text-ink-primary",
  };
  return (
    <div className="px-4 py-3">
      <div className="text-xs text-ink-muted">{label}</div>
      <div className={`mt-1 font-mono text-sm font-semibold tabular-nums ${toneMap[tone]}`}>
        {value}
      </div>
    </div>
  );
}

function ForensicFlagList({ flags }: { flags: readonly ForensicRedFlag[] }) {
  if (flags.length === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-status-pass">
        <IconShieldCheck size={15} stroke={1.5} />
        <span>
          财务法证审阅通过：未检出 SBC 过度稀释、股本异常扩张、负真实 FCF 或存货/应收异常背离。
        </span>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {flags.map((flag) => (
        <div
          key={flag.id}
          className="flex items-start gap-2.5 rounded-control bg-muted/50 px-3.5 py-2.5 text-xs"
        >
          <IconAlertTriangle
            size={15}
            stroke={1.5}
            className={
              flag.severity === "fail"
                ? "mt-0.5 shrink-0 text-status-fail"
                : "mt-0.5 shrink-0 text-status-warn"
            }
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-ink-primary">{flag.label}</span>
              <Badge variant={flag.severity === "fail" ? "fail" : "warn"}>
                {flag.severity === "fail" ? "高关注" : "留意"}
              </Badge>
            </div>
            <p className="mt-1 leading-relaxed text-ink-secondary">{flag.detail}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function gradeBadgeTone(grade: SecForensicReport["forensicGrade"]) {
  if (grade === "fortress" || grade === "compounder") return "pass" as const;
  if (grade === "watch") return "warn" as const;
  return "fail" as const;
}

export function SecForensicsView({ report }: { report: SecForensicReport }) {
  const cells = buildForensicCells(report);
  return (
    <div className="divide-y divide-hairline">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/25 px-5 py-3">
        <div className="flex items-center gap-3">
          <ReadinessRing
            scorePct={report.forensicScore}
            size={30}
            label={`${report.forensicScore}`}
          />
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-ink-primary">盈利质量评级</span>
            <Badge variant={gradeBadgeTone(report.forensicGrade)}>
              {report.forensicGradeLabel}
            </Badge>
          </div>
        </div>
        {report.rdIntensityPct !== null ? (
          <span className="font-mono text-xs text-ink-secondary tabular-nums">
            研发强度 {report.rdIntensityPct.toFixed(1)}%
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-2 divide-x divide-y divide-hairline sm:grid-cols-3">
        {cells.map((c) => (
          <MetricCell key={c.label} label={c.label} value={c.value} tone={c.tone} />
        ))}
      </div>
      <div className="px-5 py-4">
        <ForensicFlagList flags={report.redFlags} />
      </div>
    </div>
  );
}

function QuarterlyRow({ q }: { q: SecQuarterlyFinancial }) {
  const revClass = (q.revenueYoYPct ?? 0) >= 0 ? "text-status-pass" : "text-status-fail";
  const gmClass = (q.grossMarginYoYBps ?? 0) >= 0 ? "text-status-pass" : "text-status-warn";
  const gmDelta =
    q.grossMarginYoYBps !== null
      ? `${q.grossMarginYoYBps > 0 ? "+" : ""}${q.grossMarginYoYBps}bps`
      : "—";
  return (
    <tr className="border-t border-hairline">
      <td className="px-5 py-2.5 font-semibold text-ink-primary">{q.periodLabel}</td>
      <td className="px-3 py-2.5 text-right text-ink-primary">{formatCompact(q.revenue)}</td>
      <td className={`px-3 py-2.5 text-right ${revClass}`}>{formatPct(q.revenueYoYPct, true)}</td>
      <td className="px-3 py-2.5 text-right text-ink-primary">{formatPct(q.grossMarginPct)}</td>
      <td className={`px-3 py-2.5 text-right ${gmClass}`}>{gmDelta}</td>
      <td className="px-5 py-2.5 text-right font-medium text-ink-primary">
        {q.dilutedEps !== null ? `$${q.dilutedEps.toFixed(2)}` : "—"}
      </td>
    </tr>
  );
}

export function SecQuarterliesTable({
  quarterlies,
}: {
  quarterlies: readonly SecQuarterlyFinancial[];
}) {
  if (quarterlies.length === 0) {
    return (
      <div className="px-5 py-8 text-center text-xs text-ink-muted">
        暂无 10-Q 季度拐点记录，点击上方「同步 SEC 实时数据」自动拉取近 8 个单季数据。
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[580px] border-collapse font-mono text-xs tabular-nums">
        <thead>
          <tr className="bg-muted/45 font-sans text-ink-muted">
            <th className="px-5 py-2.5 text-left font-medium">季度</th>
            <th className="px-3 py-2.5 text-right font-medium">单季营收</th>
            <th className="px-3 py-2.5 text-right font-medium">营收同比</th>
            <th className="px-3 py-2.5 text-right font-medium">单季毛利率</th>
            <th className="px-3 py-2.5 text-right font-medium">毛利同比变动</th>
            <th className="px-5 py-2.5 text-right font-medium">单季 EPS</th>
          </tr>
        </thead>
        <tbody>
          {quarterlies.map((q) => (
            <QuarterlyRow key={q.periodLabel} q={q} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
