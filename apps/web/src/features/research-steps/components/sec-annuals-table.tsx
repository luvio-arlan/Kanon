"use client";

import {
  analyzeSecForensics,
  analyzeSecQuality,
  type SecAnnualFinancial,
  type SecQualitySummary,
  type SecQuarterlyFinancial,
} from "@kanon/core";
import {
  Badge,
  Card,
  KANON_LENS_VARIANTS,
  type SecChartDatum,
  SecFinancialChart,
  SegmentedTabs,
} from "@kanon/ui";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { formatCompact } from "../lib/forensic-cells";
import { SecForensicsView, SecQuarterliesTable } from "./sec-forensics-views";

type DisplayMode = "table" | "quarters" | "chart" | "forensics";

function formatSignedEps(value: number | null): string {
  if (value === null) return "—";
  return `${value < 0 ? "-" : ""}$${Math.abs(value).toFixed(2)}`;
}

function toChartData(annuals: readonly SecAnnualFinancial[]): SecChartDatum[] {
  return annuals.map((row) => ({
    fiscalYear: row.fiscalYear,
    revenueBillions: row.revenue !== null ? Number((row.revenue / 1e9).toFixed(2)) : null,
    fcfBillions: row.freeCashFlow !== null ? Number((row.freeCashFlow / 1e9).toFixed(2)) : null,
    grossMarginPct: row.grossMarginPct,
    dilutedEps: row.dilutedEps,
  }));
}

function gradeBadgeVariant(grade: SecQualitySummary["qualityGrade"]) {
  if (grade === "compounder") return "pass" as const;
  if (grade === "capital_intensive") return "titanium" as const;
  if (grade === "cyclical") return "warn" as const;
  return "default" as const;
}

function SecQualityStrip({ quality }: { quality: SecQualitySummary }) {
  return (
    <div className="grid grid-cols-2 gap-3 border-b border-hairline bg-muted/30 px-5 py-3 font-mono text-xs tabular-nums sm:grid-cols-4">
      <div>
        <div className="font-sans text-ink-muted">营收复合增速</div>
        <div className="mt-0.5 text-sm font-semibold text-ink-primary">
          {quality.revenueCagrPct !== null ? `${quality.revenueCagrPct.toFixed(1)}%` : "—"}
        </div>
      </div>
      <div>
        <div className="font-sans text-ink-muted">均值毛利率</div>
        <div className="mt-0.5 text-sm font-semibold text-ink-primary">
          {quality.avgGrossMarginPct !== null ? `${quality.avgGrossMarginPct.toFixed(1)}%` : "—"}
        </div>
      </div>
      <div>
        <div className="font-sans text-ink-muted">FCF 转化率</div>
        <div className="mt-0.5 text-sm font-semibold text-status-pass">
          {quality.fcfConversionPct !== null ? `${quality.fcfConversionPct.toFixed(1)}%` : "—"}
        </div>
      </div>
      <div>
        <div className="font-sans text-ink-muted">CapEx 强度</div>
        <div className="mt-0.5 text-sm font-semibold text-ink-secondary">
          {quality.capexIntensityPct !== null ? `${quality.capexIntensityPct.toFixed(1)}%` : "—"}
        </div>
      </div>
    </div>
  );
}

function SecAnnualRow({ row }: { row: SecAnnualFinancial }) {
  const netClass = (row.netIncome ?? 0) < 0 ? "text-status-fail" : "text-ink-secondary";
  const fcfClass = (row.freeCashFlow ?? 0) < 0 ? "text-status-fail" : "text-status-pass";

  return (
    <tr className="border-t border-hairline">
      <td className="px-5 py-2.5 font-semibold text-ink-primary">{row.fiscalYear}</td>
      <td className="px-3 py-2.5 text-right text-ink-primary">{formatCompact(row.revenue)}</td>
      <td className="px-3 py-2.5 text-right text-ink-primary">
        {row.grossMarginPct !== null ? `${row.grossMarginPct.toFixed(1)}%` : "—"}
      </td>
      <td className={`px-3 py-2.5 text-right ${netClass}`}>{formatCompact(row.netIncome)}</td>
      <td className={`px-3 py-2.5 text-right ${fcfClass}`}>{formatCompact(row.freeCashFlow)}</td>
      <td className="px-5 py-2.5 text-right font-medium text-ink-primary">
        {formatSignedEps(row.dilutedEps)}
      </td>
    </tr>
  );
}

function SecTableGrid({ annuals }: { annuals: readonly SecAnnualFinancial[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[540px] border-collapse font-mono text-xs tabular-nums">
        <thead>
          <tr className="bg-muted/45 font-sans text-ink-muted">
            <th className="px-5 py-2.5 text-left font-medium">财年</th>
            <th className="px-3 py-2.5 text-right font-medium">营业收入</th>
            <th className="px-3 py-2.5 text-right font-medium">毛利率</th>
            <th className="px-3 py-2.5 text-right font-medium">净利润</th>
            <th className="px-3 py-2.5 text-right font-medium">自由现金流</th>
            <th className="px-5 py-2.5 text-right font-medium">稀释 EPS</th>
          </tr>
        </thead>
        <tbody>
          {annuals.map((row) => (
            <SecAnnualRow key={row.fiscalYear} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SecTabContent({
  mode,
  annuals,
  quarterlies,
  chartData,
  forensics,
}: {
  mode: DisplayMode;
  annuals: readonly SecAnnualFinancial[];
  quarterlies: readonly SecQuarterlyFinancial[];
  chartData: SecChartDatum[];
  forensics: ReturnType<typeof analyzeSecForensics>;
}) {
  const inner =
    mode === "chart" ? (
      <SecFinancialChart data={chartData} />
    ) : mode === "quarters" ? (
      <SecQuarterliesTable quarterlies={quarterlies} />
    ) : mode === "forensics" && forensics ? (
      <SecForensicsView report={forensics} />
    ) : (
      <SecTableGrid annuals={annuals} />
    );
  return (
    <motion.div
      key={mode}
      variants={KANON_LENS_VARIANTS}
      initial="enter"
      animate="center"
      className="min-h-[220px]"
    >
      {inner}
    </motion.div>
  );
}

function SecTableHeader(props: {
  title: string;
  mode: DisplayMode;
  quality: SecQualitySummary | null;
  flagCount: number;
  quarterCount: number;
  onMode: (m: DisplayMode) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-5 py-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-ink-primary">{props.title}</h3>
        {props.quality ? (
          <Badge variant={gradeBadgeVariant(props.quality.qualityGrade)}>
            {props.quality.qualityLabel}
          </Badge>
        ) : null}
        {props.flagCount > 0 ? (
          <button
            type="button"
            onClick={() => props.onMode("forensics")}
            className="cursor-pointer"
          >
            <Badge variant="warn">{props.flagCount} 项法证提示</Badge>
          </button>
        ) : null}
      </div>
      <SegmentedTabs
        layoutId={`sec-view-${props.title}`}
        value={props.mode}
        onChange={props.onMode}
        items={[
          { id: "table", label: "年度" },
          { id: "quarters", label: "季度拐点", count: props.quarterCount || undefined },
          { id: "chart", label: "趋势图" },
          { id: "forensics", label: "法证体检" },
        ]}
      />
    </div>
  );
}

export function SecAnnualsTable({
  annuals,
  quarterlies = [],
  title = "SEC 多年度基本面质量轨迹",
}: {
  annuals: readonly SecAnnualFinancial[];
  quarterlies?: readonly SecQuarterlyFinancial[];
  title?: string;
}) {
  const [mode, setMode] = useState<DisplayMode>("table");
  const quality = useMemo(() => analyzeSecQuality(annuals), [annuals]);
  const forensics = useMemo(
    () => analyzeSecForensics(annuals, quarterlies),
    [annuals, quarterlies],
  );
  const chartData = useMemo(() => toChartData(annuals), [annuals]);
  if (annuals.length === 0) return null;

  return (
    <Card className="overflow-hidden">
      <SecTableHeader
        title={title}
        mode={mode}
        quality={quality}
        flagCount={forensics?.redFlags.length ?? 0}
        quarterCount={quarterlies.length}
        onMode={setMode}
      />
      {quality ? <SecQualityStrip quality={quality} /> : null}
      <div role="tabpanel">
        <SecTabContent
          mode={mode}
          annuals={annuals}
          quarterlies={quarterlies}
          chartData={chartData}
          forensics={forensics}
        />
      </div>
    </Card>
  );
}
