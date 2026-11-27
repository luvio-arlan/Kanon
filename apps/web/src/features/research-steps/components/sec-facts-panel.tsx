"use client";

import type {
  EarningsDigest,
  SecFilingItem,
  SecFinancialFact,
  SecInsiderSummary,
  SecSnapshot,
} from "@kanon/core";
import { Badge, Button, Card } from "@kanon/ui";
import { IconEdit, IconExternalLink, IconRefresh } from "@tabler/icons-react";
import { AlertBellToggle } from "@/shared/components/alert-bell-toggle";

export { InboundCrossChecksPanel } from "./sec/inbound-cross-checks-panel";

export interface SecFactsPanelProps {
  thesisId?: string;
  ticker: string;
  snapshot: SecSnapshot | null;
  syncing: boolean;
  onSync: () => Promise<void>;
  onOpenManual?: () => void;
}

function FactsGrid({ facts }: { facts: readonly SecFinancialFact[] }) {
  if (facts.length === 0) return null;
  return (
    <div className="grid grid-cols-2 divide-x divide-y divide-hairline border-t border-hairline sm:grid-cols-3">
      {facts.map((fact) => (
        <div key={fact.metric} className="px-6 py-4">
          <div className="text-xs text-ink-muted">
            {fact.label} · {fact.period}
          </div>
          <div className="mt-1.5 font-mono text-2xl font-light tracking-[-0.03em] text-ink-primary tabular-nums">
            {fact.valueFormatted}
          </div>
        </div>
      ))}
    </div>
  );
}

function FilingsRow({ filings }: { filings: readonly SecFilingItem[] }) {
  if (filings.length === 0) return null;
  const items = [
    ...filings.filter((f) => f.form !== "4").slice(0, 4),
    ...filings.filter((f) => f.form === "4").slice(0, 2),
  ];
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-hairline px-6 py-3.5">
      {items.map((f) => (
        <a
          key={f.accessionNumber}
          href={f.documentUrl}
          target="_blank"
          rel="noreferrer"
          className={
            f.form === "4"
              ? "inline-flex items-center gap-1.5 rounded-control border border-hairline bg-titanium-subtle/65 px-2.5 py-1.5 text-xs text-ink-secondary transition-colors hover:border-strong hover:text-ink-primary"
              : "inline-flex items-center gap-1.5 rounded-control border border-hairline bg-canvas/55 px-3 py-1.5 text-xs font-medium text-ink-primary transition-colors hover:border-strong hover:bg-surface"
          }
        >
          <span className="font-mono">{f.form === "4" ? "Form 4" : f.form}</span>
          <span className="text-ink-muted tabular-nums">{f.filingDate}</span>
          <IconExternalLink size={12} stroke={1.5} className="text-ink-muted" />
        </a>
      ))}
    </div>
  );
}

const INSIDER_META: Record<
  SecInsiderSummary["signal"],
  { label: string; tone: "pass" | "warn" | "fail" | "titanium" }
> = {
  cluster_buy: { label: "内部人抱团买入", tone: "pass" },
  net_buying: { label: "内部人净买入", tone: "pass" },
  routine_10b51: { label: "10b5-1 例行减持", tone: "titanium" },
  discretionary_selling: { label: "自主公开市场减持", tone: "warn" },
  neutral: { label: "内部人交易中性", tone: "titanium" },
};

function InsiderSignalStrip({ summary }: { summary: SecInsiderSummary }) {
  const meta = INSIDER_META[summary.signal];
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-hairline bg-canvas/35 px-6 py-2.5 text-xs">
      <Badge variant={meta.tone}>{meta.label}</Badge>
      <span className="font-mono text-ink-secondary tabular-nums">
        买入 {summary.openMarketBuysCount} 笔 (${Math.round(summary.openMarketBuysUsd / 1e3)}K) ·
        卖出 {summary.openMarketSalesCount} 笔 (10b5-1: {summary.routine10b51SalesCount})
      </span>
    </div>
  );
}

function resolveSourceBadge(source?: SecSnapshot["source"]) {
  if (source === "sec-edgar-live") return { label: "SEC 实时", variant: "pass" as const };
  if (source === "manual-verified") return { label: "手动核验", variant: "pass" as const };
  return { label: "基准", variant: "default" as const };
}

function formatCurrencyBadge(snapshot: SecSnapshot | null): string | null {
  if (!snapshot?.reportingCurrency || snapshot.reportingCurrency === "USD") return null;
  const adr = (snapshot.adrRatio ?? 1) > 1 ? ` · ADR ${snapshot.adrRatio}:1` : "";
  return `${snapshot.reportingCurrency}→USD${adr}`;
}

export function SecFactsPanel({
  thesisId,
  ticker,
  snapshot,
  syncing,
  onSync,
  onOpenManual,
}: SecFactsPanelProps) {
  const srcBadge = resolveSourceBadge(snapshot?.source);
  const curTag = formatCurrencyBadge(snapshot);
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <h3 className="text-[15px] font-semibold tracking-[-0.015em] text-ink-primary">
            财报与披露档案
          </h3>
          <span className="font-mono text-xs text-ink-muted tabular-nums">
            {snapshot ? `CIK ${snapshot.cik}` : ticker}
          </span>
          <Badge variant={srcBadge.variant}>{srcBadge.label}</Badge>
          {curTag ? <Badge variant="titanium">{curTag}</Badge> : null}
        </div>
        <div className="flex items-center gap-2">
          {thesisId ? (
            <AlertBellToggle
              rule={{ kind: "form8k_redflag", thesisId }}
              initialEnabled
              title="8-K 重大公告提醒"
            />
          ) : null}
          {onOpenManual ? (
            <Button variant="outline" size="xs" onClick={onOpenManual}>
              <IconEdit size={13} stroke={1.5} />
              <span>全球/手动录入</span>
            </Button>
          ) : null}
          <Button variant="outline" size="xs" disabled={syncing} onClick={onSync}>
            <IconRefresh size={13} stroke={1.5} className={syncing ? "animate-spin" : ""} />
            <span>{syncing ? "同步中" : "同步 SEC"}</span>
          </Button>
        </div>
      </div>
      {snapshot ? <FactsGrid facts={snapshot.facts} /> : null}
      {snapshot?.insiderSummary ? <InsiderSignalStrip summary={snapshot.insiderSummary} /> : null}
      {snapshot ? <FilingsRow filings={snapshot.filings} /> : null}
    </Card>
  );
}

export function EarningsDigestPanel({ digest }: { digest: EarningsDigest }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-hairline px-6 py-4">
        <h3 className="text-[15px] font-semibold tracking-[-0.015em] text-ink-primary">
          电话会核心提炼
        </h3>
        <Badge variant="coral">{digest.quarterLabel}</Badge>
      </div>
      <div className="space-y-5 px-6 py-5">
        <p className="text-sm leading-[1.7] text-ink-primary">{digest.guidanceSummary}</p>
        <div className="grid grid-cols-1 gap-5 border-t border-hairline pt-5 md:grid-cols-2">
          {[
            { title: "资本开支与供给信号", items: digest.capexSignals },
            { title: "管理层措辞与关注点", items: digest.toneShifts },
          ].map((group) => (
            <div key={group.title}>
              <div className="text-xs font-semibold text-ink-primary">{group.title}</div>
              <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-ink-secondary">
                {group.items.map((sig) => (
                  <li key={sig} className="flex gap-2">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-pill bg-ink-muted" />
                    <span>{sig}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        {digest.quotesWithAnchors.length > 0 ? (
          <div className="space-y-3 border-t border-hairline pt-5">
            <div className="text-xs font-medium text-ink-muted">原文锚点</div>
            {digest.quotesWithAnchors.map((q) => (
              <div
                key={`${q.topic}-${q.sourceAnchor}`}
                className="border-l-2 border-accent-coral/55 py-0.5 pl-3.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-ink-primary">{q.topic}</span>
                  <span className="font-mono text-ink-muted">{q.sourceAnchor}</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-ink-secondary">{q.summary}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
