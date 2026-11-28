import type { RedlineChange } from "@kanon/core";
import { Badge, formatMoney } from "@kanon/ui";
import { fmtSignedPct, KpiStrip, type PresentSlideData } from "./present-slide";

function summarizeChangeText(ch: RedlineChange): string {
  const ins = ch.tokens
    .filter((t) => t.op !== "del")
    .map((t) => t.text)
    .join(" ")
    .trim();
  return (
    ins ||
    ch.tokens
      .map((t) => t.text)
      .join(" ")
      .trim()
  );
}

export function SlideRedline({ data }: { data: PresentSlideData }) {
  const { redline } = data;
  return (
    <section className="space-y-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-2xl font-semibold tracking-tight text-ink-primary">
          最近一次 Redline 关键变化
        </h2>
        {redline ? (
          <span className="font-mono text-xs text-ink-muted">
            {redline.form} · {redline.previousPeriod} → {redline.currentPeriod}
          </span>
        ) : null}
      </div>
      {!redline || redline.changes.length === 0 ? (
        <p className="border-y border-hairline py-6 text-sm text-ink-muted">暂无可比年季报变动</p>
      ) : (
        <div className="divide-y divide-hairline border-y border-hairline">
          {redline.changes.slice(0, 5).map((ch) => (
            <div key={ch.id} className="space-y-1 py-3">
              <Badge
                variant={
                  ch.severity === "critical" ? "fail" : ch.severity === "warn" ? "warn" : "default"
                }
              >
                {ch.kind}
              </Badge>
              <p className="line-clamp-3 text-sm leading-relaxed text-ink-primary">
                {summarizeChangeText(ch) || "—"}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function SlideGuidance({ data }: { data: PresentSlideData }) {
  const { credibility, guidance } = data;
  const kpis = [
    { label: "已兑现样本", value: String(credibility.resolved) },
    { label: "兑现比例", value: credibility.keptRatio ?? "—" },
    {
      label: "均值偏差",
      value: credibility.meanSurprisePct !== null ? fmtSignedPct(credibility.meanSurprisePct) : "—",
    },
    { label: "在轨条目", value: String(guidance.length) },
  ];
  return (
    <section className="space-y-6">
      <h2 className="text-2xl font-semibold tracking-tight text-ink-primary">管理层指引信誉</h2>
      <KpiStrip items={kpis} />
      {guidance.length === 0 ? (
        <p className="border-b border-hairline pb-6 text-sm text-ink-muted">暂无已记录指引</p>
      ) : (
        <div className="divide-y divide-hairline border-b border-hairline">
          {guidance.slice(0, 6).map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-4 py-2.5 text-sm">
              <span className="truncate font-medium text-ink-primary">
                FY{item.targetFiscalYear ?? "—"} {item.targetFiscalPeriod ?? ""} · {item.metric}
              </span>
              <Badge
                variant={
                  item.outcome === "beat" || item.outcome === "in_line"
                    ? "pass"
                    : item.outcome === "miss"
                      ? "fail"
                      : "default"
                }
              >
                {item.outcome ?? item.status}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function SlideExit({ data }: { data: PresentSlideData }) {
  const exitEntries = data.thesis.disciplineEntries.filter((e) => e.exitRule.trim().length > 0);
  return (
    <section className="space-y-6">
      <h2 className="text-2xl font-semibold tracking-tight text-ink-primary">离场条件与风控纪律</h2>
      {data.thesis.businessFilter.preMortem ? (
        <div className="border-y border-hairline py-4">
          <div className="text-xs font-medium text-ink-muted">逆向压力推演</div>
          <p className="mt-1 text-sm leading-relaxed text-ink-primary">
            {data.thesis.businessFilter.preMortem}
          </p>
        </div>
      ) : null}
      {exitEntries.length === 0 ? (
        <p className="border-b border-hairline pb-6 text-sm text-ink-muted">暂无已记录离场条件</p>
      ) : (
        <div className="divide-y divide-hairline border-b border-hairline">
          {exitEntries.slice(0, 6).map((entry) => (
            <div key={entry.id} className="space-y-1 py-3">
              <div className="flex items-center justify-between font-mono text-xs text-ink-muted">
                <span>
                  {entry.action.toUpperCase()} · {formatMoney(entry.priceAnchor, data.currency)}
                </span>
                <span>{entry.createdAt.slice(0, 10)}</span>
              </div>
              <p className="text-sm text-ink-primary">{entry.exitRule}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
