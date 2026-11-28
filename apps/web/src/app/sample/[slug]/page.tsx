import {
  getStaticSampleDossier,
  SAMPLE_DOSSIER_SLUGS,
  type StaticSampleDossier,
} from "@kanon/core";
import { Badge, buttonVariants, cn, formatMoney } from "@kanon/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

export function generateStaticParams() {
  return SAMPLE_DOSSIER_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const sample = getStaticSampleDossier(slug);
  if (!sample) return { title: "示例档案 — KANON 卡农" };
  return {
    title: `${sample.thesis.ticker} · ${sample.thesis.companyName} — KANON 示例档案`,
    robots: { index: true, follow: true },
  };
}

function SampleKpiStrip({ sample }: { sample: StaticSampleDossier }) {
  const { thesis } = sample;
  const ratio =
    thesis.valuation.riskRewardRatio !== null
      ? `${thesis.valuation.riskRewardRatio.toFixed(2)}×`
      : "∞";
  const cells = [
    { label: "参考价", val: formatMoney(thesis.currentPrice, "USD") },
    {
      label: `${thesis.horizonYears}Y 中性目标`,
      val: formatMoney(thesis.valuation.base.targetPrice, "USD", { maximumFractionDigits: 1 }),
    },
    { label: "中性年化", val: `${thesis.valuation.base.cagrPct.toFixed(1)}%` },
    { label: "赔率比", val: ratio },
  ];
  return (
    <div className="grid grid-cols-2 divide-y divide-hairline border-y border-hairline sm:grid-cols-4 sm:divide-x sm:divide-y-0">
      {cells.map((c) => (
        <div key={c.label} className="px-4 py-3.5">
          <div className="text-xs text-ink-muted">{c.label}</div>
          <div className="mt-1 font-mono text-base font-semibold text-ink-primary tabular-nums">
            {c.val}
          </div>
        </div>
      ))}
    </div>
  );
}

function SampleHypothesesSection({ sample }: { sample: StaticSampleDossier }) {
  return (
    <section className="space-y-3 border-b border-hairline pb-6">
      <h2 className="text-sm font-semibold text-ink-primary">核心假设</h2>
      <div className="divide-y divide-hairline border-y border-hairline">
        {sample.thesis.hypotheses.map((h) => (
          <div
            key={h.id}
            className="flex flex-wrap items-baseline justify-between gap-2 py-3 text-xs"
          >
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="font-medium text-ink-primary">{h.title}</div>
              <p className="text-ink-secondary">{h.note}</p>
            </div>
            <div className="flex items-center gap-2 font-mono tabular-nums">
              <span className="text-ink-muted">{h.threshold}</span>
              <Badge
                variant={
                  h.status === "validated" ? "pass" : h.status === "warning" ? "warn" : "titanium"
                }
              >
                {h.status === "validated" ? "已验证" : h.status === "warning" ? "预警" : "观察"}
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SampleValuationAndSec({ sample }: { sample: StaticSampleDossier }) {
  const { valuation } = sample.thesis;
  const cases = [
    { label: "悲观", row: valuation.bear },
    { label: "中性", row: valuation.base },
    { label: "乐观", row: valuation.bull },
  ];
  const annuals = sample.secSnapshot?.annuals.slice(-4) ?? [];
  return (
    <section className="grid gap-8 sm:grid-cols-2">
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-ink-primary">三情景估值</h2>
        <div className="divide-y divide-hairline border-y border-hairline font-mono text-xs tabular-nums">
          {cases.map(({ label, row }) => (
            <div key={label} className="flex items-center justify-between py-2.5">
              <span className="font-sans text-ink-secondary">{label}</span>
              <span className="text-ink-primary">
                EPS {formatMoney(row.eps, "USD")} × {row.peMultiple}× →{" "}
                {formatMoney(row.targetPrice, "USD", { maximumFractionDigits: 1 })} ({row.cagrPct}%)
              </span>
            </div>
          ))}
        </div>
      </div>
      {annuals.length > 0 ? (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-ink-primary">SEC 财报事实</h2>
          <div className="divide-y divide-hairline border-y border-hairline font-mono text-xs tabular-nums">
            {annuals.map((a) => (
              <div key={a.fiscalYear} className="flex items-center justify-between py-2.5">
                <span className="text-ink-secondary">{a.fiscalYear}</span>
                <span className="text-ink-primary">
                  营收 {formatMoney(a.revenue, "USD", { scale: "B", maximumFractionDigits: 1 })} ·
                  毛利率 {a.grossMarginPct ?? "—"}%
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default async function PublicSampleDossierPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const sample = getStaticSampleDossier(slug);
  if (!sample) notFound();
  const { thesis } = sample;
  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-hairline pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-tight text-ink-primary">
              {thesis.companyName}
            </h1>
            <span className="font-mono text-sm text-ink-secondary">{thesis.ticker}</span>
            <Badge variant="titanium">示例</Badge>
          </div>
          <div className="font-mono text-xs text-ink-muted tabular-nums">
            {thesis.sectorTag} · 数据截止 {sample.asOfDate}
          </div>
        </div>
        <Link href="/register" className={cn(buttonVariants({ variant: "primary", size: "sm" }))}>
          进入工作台
        </Link>
      </header>
      <SampleKpiStrip sample={sample} />
      <section className="space-y-2 border-b border-hairline pb-6 text-sm leading-relaxed text-ink-primary">
        <p>{thesis.convictionSummary}</p>
        {thesis.businessFilter.variantPerception ? (
          <p className="text-xs text-ink-secondary">{thesis.businessFilter.variantPerception}</p>
        ) : null}
      </section>
      <SampleHypothesesSection sample={sample} />
      <SampleValuationAndSec sample={sample} />
    </main>
  );
}
