"use client";

import {
  analyzeSecForensics,
  analyzeSecQuality,
  type SecAnnualFinancial,
  type SecQualitySummary,
  type SecQuarterlyFinancial,
} from "@kanon/core";
import { Badge, Card, KANON_LENS_VARIANTS, type SecChartDatum, SegmentedTabs } from "@kanon/ui";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { ForensicScorecardStrip } from "./sec/forensic-scorecard-strip";
import { type RestatementMarker, SecTableGrid } from "./sec/sec-annual-grid";
import { SecForensicsView, SecQuarterliesTable } from "./sec-forensics-views";

const SecFinancialChart = dynamic(
  () => import("@kanon/ui/charts").then((mod) => mod.SecFinancialChart),
  {
    ssr: false,
    loading: () => <div aria-hidden="true" className="kanon-shimmer m-5 h-52 rounded-panel" />,
  },
);

type DisplayMode = "table" | "quarters" | "chart" | "forensics";

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
    <div className="grid grid-cols-2 divide-x divide-hairline border-b border-hairline bg-canvas/45 font-mono text-xs tabular-nums sm:grid-cols-4">
      <div className="px-6 py-4">
        <div className="font-sans text-ink-muted">营收复合增速</div>
        <div className="mt-1 text-base font-medium text-ink-primary">
          {quality.revenueCagrPct !== null ? `${quality.revenueCagrPct.toFixed(1)}%` : "—"}
        </div>
      </div>
      <div className="px-6 py-4">
        <div className="font-sans text-ink-muted">均值毛利率</div>
        <div className="mt-1 text-base font-medium text-ink-primary">
          {quality.avgGrossMarginPct !== null ? `${quality.avgGrossMarginPct.toFixed(1)}%` : "—"}
        </div>
      </div>
      <div className="px-6 py-4">
        <div className="font-sans text-ink-muted">FCF 转化率</div>
        <div className="mt-1 text-base font-medium text-status-pass">
          {quality.fcfConversionPct !== null ? `${quality.fcfConversionPct.toFixed(1)}%` : "—"}
        </div>
      </div>
      <div className="px-6 py-4">
        <div className="font-sans text-ink-muted">CapEx 强度</div>
        <div className="mt-1 text-base font-medium text-ink-secondary">
          {quality.capexIntensityPct !== null ? `${quality.capexIntensityPct.toFixed(1)}%` : "—"}
        </div>
      </div>
    </div>
  );
}

function SecTabContent({
  mode,
  annuals,
  quarterlies,
  chartData,
  forensics,
  restatements,
}: {
  mode: DisplayMode;
  annuals: readonly SecAnnualFinancial[];
  quarterlies: readonly SecQuarterlyFinancial[];
  chartData: SecChartDatum[];
  forensics: ReturnType<typeof analyzeSecForensics>;
  restatements: readonly RestatementMarker[];
}) {
  const inner =
    mode === "chart" ? (
      <SecFinancialChart data={chartData} />
    ) : mode === "quarters" ? (
      <SecQuarterliesTable quarterlies={quarterlies} />
    ) : mode === "forensics" && forensics ? (
      <SecForensicsView report={forensics} />
    ) : (
      <SecTableGrid annuals={annuals} restatements={restatements} />
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
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-6 py-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <h3 className="text-[15px] font-semibold tracking-[-0.015em] text-ink-primary">
          {props.title}
        </h3>
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
            <Badge variant="warn">{props.flagCount} 项提示</Badge>
          </button>
        ) : null}
      </div>
      <SegmentedTabs
        layoutId={`sec-view-${props.title}`}
        value={props.mode}
        onChange={props.onMode}
        items={[
          { id: "table", label: "年度" },
          { id: "quarters", label: "季度", count: props.quarterCount || undefined },
          { id: "chart", label: "趋势" },
          { id: "forensics", label: "法证" },
        ]}
      />
    </div>
  );
}

export function SecAnnualsTable({
  annuals,
  quarterlies = [],
  restatements = [],
  title = "SEC 多年度基本面质量轨迹",
}: {
  annuals: readonly SecAnnualFinancial[];
  quarterlies?: readonly SecQuarterlyFinancial[];
  restatements?: readonly RestatementMarker[];
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
      <ForensicScorecardStrip annuals={annuals} />
      <div role="tabpanel">
        <SecTabContent
          mode={mode}
          annuals={annuals}
          quarterlies={quarterlies}
          chartData={chartData}
          forensics={forensics}
          restatements={restatements}
        />
      </div>
    </Card>
  );
}
