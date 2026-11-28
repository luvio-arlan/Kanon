import type {
  GuidanceCommitment,
  GuidanceCredibility,
  RedlineChange,
  RedlineSection,
  RedlineStats,
  ThesisDetail,
} from "@kanon/core";
import { Badge, formatMoney } from "@kanon/ui";

export interface PresentRedlineSummary {
  form: string;
  currentPeriod: string;
  previousPeriod: string;
  sectionCode: RedlineSection;
  stats: RedlineStats | null;
  changes: readonly RedlineChange[];
}

export interface PresentSlideData {
  thesis: ThesisDetail;
  currency: string;
  credibility: GuidanceCredibility;
  guidance: readonly GuidanceCommitment[];
  redline: PresentRedlineSummary | null;
}

const HYP_META: Record<
  ThesisDetail["hypotheses"][number]["status"],
  { label: string; variant: "pass" | "default" | "warn" | "fail" }
> = {
  validated: { label: "已验证", variant: "pass" },
  watching: { label: "跟踪中", variant: "default" },
  warning: { label: "预警", variant: "warn" },
  invalidated: { label: "证伪", variant: "fail" },
};

export const fmtSignedPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
const fmtRatio = (v: number | null, digits = 1) => (v !== null ? `${v.toFixed(digits)}×` : "∞");

export function KpiStrip({ items }: { items: ReadonlyArray<{ label: string; value: string }> }) {
  return (
    <div className="grid grid-cols-2 divide-x divide-hairline border-y border-hairline py-4 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="px-4 first:pl-0">
          <div className="text-xs text-ink-muted">{item.label}</div>
          <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-ink-primary">
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

export function SlideConclusion({ data }: { data: PresentSlideData }) {
  const { thesis, currency } = data;
  const kpis = [
    { label: "当前股价", value: formatMoney(thesis.currentPrice, currency) },
    { label: "期望回报", value: fmtSignedPct(thesis.valuation.expectedReturnPct) },
    { label: "赔率", value: fmtRatio(thesis.valuation.riskRewardRatio) },
    { label: "期限", value: thesis.horizonLabel },
  ];
  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-ink-muted">
          <span>{thesis.ticker}</span>
          <span>·</span>
          <span>{thesis.sectorTag}</span>
          <Badge variant="default">{thesis.status === "active" ? "跟踪中" : "暂不纳入"}</Badge>
        </div>
        <h2 className="text-3xl font-semibold tracking-tight text-ink-primary">
          {thesis.companyName}
        </h2>
        <p className="max-w-3xl text-base leading-relaxed text-ink-secondary">
          {thesis.convictionSummary}
        </p>
      </div>
      <KpiStrip items={kpis} />
      {thesis.businessFilter.variantPerception ? (
        <div className="border-t border-hairline pt-4">
          <div className="text-xs font-medium text-ink-muted">核心预期差</div>
          <p className="mt-1 text-sm leading-relaxed text-ink-primary">
            {thesis.businessFilter.variantPerception}
          </p>
        </div>
      ) : null}
    </section>
  );
}

function ValuationCaseRow(p: {
  label: string;
  currency: string;
  row: ThesisDetail["valuation"]["base"];
}) {
  return (
    <tr>
      <td className="py-3 font-sans font-medium text-ink-primary">{p.label}</td>
      <td className="py-3 text-right text-ink-secondary">
        {(p.row.probability * 100).toFixed(0)}%
      </td>
      <td className="py-3 text-right text-ink-primary">
        {formatMoney(p.row.targetPrice, p.currency)}
      </td>
      <td className="py-3 text-right text-ink-primary">{fmtSignedPct(p.row.returnPct)}</td>
      <td className="py-3 text-right text-ink-secondary">{fmtSignedPct(p.row.cagrPct)}</td>
    </tr>
  );
}

export function SlideValuation({ data }: { data: PresentSlideData }) {
  const { valuation } = data.thesis;
  const summary = [
    { label: "期望目标价", value: formatMoney(valuation.expectedTargetPrice, data.currency) },
    { label: "中性上行", value: fmtSignedPct(valuation.upsidePct) },
    { label: "悲观回撤", value: fmtSignedPct(valuation.downsidePct) },
    { label: "非对称赔率", value: fmtRatio(valuation.riskRewardRatio, 2) },
  ];
  return (
    <section className="space-y-6">
      <h2 className="text-2xl font-semibold tracking-tight text-ink-primary">三情景估值与赔率</h2>
      <div className="overflow-x-auto border-y border-hairline">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-hairline text-xs text-ink-muted">
              <th className="py-3 font-medium">情景</th>
              <th className="py-3 text-right font-medium">概率</th>
              <th className="py-3 text-right font-medium">目标价</th>
              <th className="py-3 text-right font-medium">潜在收益</th>
              <th className="py-3 text-right font-medium">年化复合</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline font-mono tabular-nums">
            <ValuationCaseRow label="悲观情景" currency={data.currency} row={valuation.bear} />
            <ValuationCaseRow label="中性情景" currency={data.currency} row={valuation.base} />
            <ValuationCaseRow label="乐观情景" currency={data.currency} row={valuation.bull} />
          </tbody>
        </table>
      </div>
      <KpiStrip items={summary} />
    </section>
  );
}

export function SlideHypotheses({ data }: { data: PresentSlideData }) {
  return (
    <section className="space-y-6">
      <h2 className="text-2xl font-semibold tracking-tight text-ink-primary">核心假设状态</h2>
      <div className="divide-y divide-hairline border-y border-hairline">
        {data.thesis.hypotheses.map((h) => (
          <div key={h.id} className="space-y-1 py-3.5">
            <div className="flex items-center gap-2">
              <Badge variant={HYP_META[h.status].variant}>{HYP_META[h.status].label}</Badge>
              <span className="text-sm font-semibold text-ink-primary">{h.title}</span>
            </div>
            <div className="font-mono text-xs text-ink-muted">
              {h.metricLabel} · 阈值 {h.threshold}
            </div>
            {h.note ? <p className="text-sm text-ink-secondary">{h.note}</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
