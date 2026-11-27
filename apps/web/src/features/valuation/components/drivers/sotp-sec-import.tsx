"use client";

import {
  mapSegmentsToSotp,
  type SegmentImportBlocker,
  type SegmentReport,
  SegmentsResponseSchema,
  type SotpSegment,
} from "@kanon/core";
import { Badge, Button, cn } from "@kanon/ui";
import { IconCloudDownload, IconRefresh } from "@tabler/icons-react";
import { useState } from "react";
import { toast } from "sonner";
import { kanonFetch } from "@/shared/lib/kanon-fetch";

const BLOCKER_LABELS: Record<SegmentImportBlocker, string> = {
  single_segment: "该公司按单一经营分部披露，暂不支持分部拆解",
  unreconciled: "分部加总与合并营收差异超 1%，暂不可自动带入",
  custom_profit_measure: "分部利润为非标准口径，仅可按营收带入",
  negative_profit_segment: "含亏损分部，带入 EBIT 请核对倍数",
  has_eliminations: "含重大分部间抵消项，暂不可自动带入",
  fx_missing: "缺少期末汇率，暂无法折算美元",
};

function formatSegBillions(val: number | null): string {
  return val !== null ? `$${(val / 1e9).toFixed(2)}B` : "—";
}

function SegmentMetricToggle(p: {
  metric: "revenue" | "operatingIncome";
  canOperatingIncome: boolean;
  onChange: (m: "revenue" | "operatingIncome") => void;
}) {
  return (
    <div className="inline-flex rounded-pill border border-hairline bg-surface p-0.5">
      {(["revenue", "operatingIncome"] as const).map((m) => (
        <button
          key={m}
          type="button"
          disabled={m === "operatingIncome" && !p.canOperatingIncome}
          onClick={() => p.onChange(m)}
          className={cn(
            "cursor-pointer rounded-pill px-2 py-0.5 disabled:cursor-not-allowed disabled:opacity-40",
            p.metric === m ? "bg-titanium font-medium text-ink-primary" : "text-ink-muted",
          )}
        >
          {m === "revenue" ? "营收 ($B)" : "EBIT ($B)"}
        </button>
      ))}
    </div>
  );
}

function SegmentPreviewRows(p: {
  lines: SegmentReport["lines"];
  metric: "revenue" | "operatingIncome";
}) {
  return (
    <div className="divide-y divide-hairline">
      {p.lines.map((line) => (
        <div key={line.memberQname} className="flex items-center justify-between py-1.5">
          <span className="text-ink-primary">{line.label}</span>
          <span className="font-mono text-ink-secondary tabular-nums">
            {formatSegBillions(p.metric === "revenue" ? line.revenue : line.operatingIncome)}
          </span>
        </div>
      ))}
    </div>
  );
}

function SegmentPreviewBox(p: {
  report: SegmentReport;
  metric: "revenue" | "operatingIncome";
  onMetric: (m: "revenue" | "operatingIncome") => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const canImport =
    p.metric === "revenue" ? p.report.importable.revenue : p.report.importable.operatingIncome;
  const segLines = p.report.lines.filter((l) => l.kind === "segment");
  return (
    <div className="space-y-3 rounded-card border border-hairline bg-canvas/45 p-3.5 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-mono text-ink-secondary">
          <span>
            {p.report.form} · {p.report.periodEnd}
          </span>
          {p.report.diffPct !== null ? (
            <Badge variant="pass">校验差 {p.report.diffPct}%</Badge>
          ) : null}
        </div>
        <SegmentMetricToggle
          metric={p.metric}
          canOperatingIncome={p.report.importable.operatingIncome}
          onChange={p.onMetric}
        />
      </div>
      {p.report.importable.blockers.length > 0 ? (
        <p className="text-status-warn">
          {p.report.importable.blockers.map((b) => BLOCKER_LABELS[b]).join("；")}
        </p>
      ) : null}
      <SegmentPreviewRows lines={segLines} metric={p.metric} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="xs" onClick={p.onClose}>
          取消
        </Button>
        <Button variant="primary" size="xs" disabled={!canImport} onClick={p.onConfirm}>
          确认带入
        </Button>
      </div>
    </div>
  );
}

function useSecSegmentLoader(ticker: string) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [report, setReport] = useState<SegmentReport | null>(null);
  const [metric, setMetric] = useState<"revenue" | "operatingIncome">("revenue");

  async function loadSegments(refresh = false) {
    setOpen(true);
    setLoading(true);
    setStatusMsg(null);
    const base = `/api/sec/${encodeURIComponent(ticker)}/segments`;
    const res = refresh
      ? await kanonFetch(base, SegmentsResponseSchema, {
          method: "POST",
          body: { op: "refresh" },
          fallbackError: "刷新 SEC 分部失败",
        })
      : await kanonFetch(`${base}?axis=business`, SegmentsResponseSchema, {
          fallbackError: "加载 SEC 分部失败",
        });
    setLoading(false);
    if (!res.ok) return void setStatusMsg(res.error);
    if (res.data.status === "pending")
      return void setStatusMsg("正在解析 SEC XBRL 分部报表，请稍后刷新。");
    const first = res.data.reports[0] ?? null;
    if (!first) return void setStatusMsg("暂无可核对的 SEC XBRL 业务分部数据。");
    setReport(first);
    setMetric(first.importable.operatingIncome ? "operatingIncome" : "revenue");
  }

  return { open, setOpen, loading, statusMsg, report, metric, setMetric, loadSegments };
}

function mapReportToSotpSegments(report: SegmentReport, metric: "revenue" | "operatingIncome") {
  const mode = metric === "revenue" ? "revenue" : "operating_income";
  return mapSegmentsToSotp({
    accession: report.accession,
    periodEnd: report.periodEnd,
    mode,
    concept: mode === "revenue" ? "us-gaap:Revenues" : "us-gaap:OperatingIncomeLoss",
    currency: report.currency,
    fxToUsd: report.fxToUsd,
    lines: report.lines,
  });
}

function ImportTriggerRow(p: {
  open: boolean;
  loading: boolean;
  onLoad: () => void;
  onRefresh: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Button variant="outline" size="xs" loading={p.loading} onClick={p.onLoad}>
        {!p.loading ? <IconCloudDownload size={13} stroke={1.5} /> : null}
        <span>从 SEC 分部带入</span>
      </Button>
      {p.open ? (
        <Button variant="ghost" size="xs" disabled={p.loading} onClick={p.onRefresh}>
          <IconRefresh size={12} stroke={1.5} />
        </Button>
      ) : null}
    </div>
  );
}

export function SotpSecImport({
  ticker,
  onImported,
}: {
  ticker: string;
  onImported: (segments: SotpSegment[]) => void;
}) {
  const s = useSecSegmentLoader(ticker);
  const handleConfirm = () => {
    if (!s.report) return;
    const mapped = mapReportToSotpSegments(s.report, s.metric);
    if (mapped.length === 0) return void toast.error("所选口径无可带入分部。");
    onImported(mapped);
    s.setOpen(false);
    toast.success(`已带入 ${mapped.length} 个 SEC 业务分部（倍数待填写）`);
  };
  return (
    <div className="space-y-2.5">
      <ImportTriggerRow
        open={s.open}
        loading={s.loading}
        onLoad={() => void s.loadSegments(false)}
        onRefresh={() => void s.loadSegments(true)}
      />
      {s.open && s.statusMsg ? <p className="text-xs text-ink-muted">{s.statusMsg}</p> : null}
      {s.open && s.report ? (
        <SegmentPreviewBox
          report={s.report}
          metric={s.metric}
          onMetric={s.setMetric}
          onConfirm={handleConfirm}
          onClose={() => s.setOpen(false)}
        />
      ) : null}
    </div>
  );
}
