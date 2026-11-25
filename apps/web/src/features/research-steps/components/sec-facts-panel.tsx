"use client";

import type {
  EarningsDigest,
  InboundCrossCheck,
  SecFilingItem,
  SecFinancialFact,
  SecSnapshot,
} from "@kanon/core";
import { Badge, Button, Card } from "@kanon/ui";
import { IconArrowUpRight, IconExternalLink, IconLink, IconRefresh } from "@tabler/icons-react";
import Link from "next/link";

export interface SecFactsPanelProps {
  ticker: string;
  snapshot: SecSnapshot | null;
  syncing: boolean;
  onSync: () => Promise<void>;
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
  const primary = filings.filter((f) => f.form !== "4").slice(0, 4);
  const insiders = filings.filter((f) => f.form === "4").slice(0, 2);
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-hairline px-6 py-3.5">
      {primary.map((f) => (
        <a
          key={f.accessionNumber}
          href={f.documentUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-control border border-hairline bg-canvas/55 px-3 py-1.5 text-xs font-medium text-ink-primary transition-colors hover:border-strong hover:bg-surface"
        >
          <span className="font-mono">{f.form}</span>
          <span className="text-ink-muted tabular-nums">{f.filingDate}</span>
          <IconExternalLink size={12} stroke={1.5} className="text-ink-muted" />
        </a>
      ))}
      {insiders.map((f) => (
        <a
          key={f.accessionNumber}
          href={f.documentUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-control border border-hairline bg-titanium-subtle/65 px-2.5 py-1.5 text-xs text-ink-secondary transition-colors hover:border-strong hover:text-ink-primary"
        >
          <span className="font-mono font-medium">Form 4</span>
          <span className="tabular-nums">{f.filingDate}</span>
          <IconExternalLink size={12} stroke={1.5} className="text-ink-muted" />
        </a>
      ))}
    </div>
  );
}

export function SecFactsPanel({ ticker, snapshot, syncing, onSync }: SecFactsPanelProps) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <h3 className="text-[15px] font-semibold tracking-[-0.015em] text-ink-primary">
            SEC EDGAR 档案
          </h3>
          {snapshot ? (
            <span className="font-mono text-xs text-ink-muted tabular-nums">
              CIK {snapshot.cik}
            </span>
          ) : (
            <span className="font-mono text-xs text-ink-muted">{ticker}</span>
          )}
          <Badge variant={snapshot?.source === "sec-edgar-live" ? "pass" : "default"}>
            {snapshot?.source === "sec-edgar-live" ? "实时" : "基准"}
          </Badge>
        </div>
        <Button variant="outline" size="xs" disabled={syncing} onClick={onSync}>
          <IconRefresh size={13} stroke={1.5} className={syncing ? "animate-spin" : ""} />
          <span>{syncing ? "同步中" : "同步 SEC"}</span>
        </Button>
      </div>
      {snapshot ? <FactsGrid facts={snapshot.facts} /> : null}
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

export function InboundCrossChecksPanel({ items }: { items: readonly InboundCrossCheck[] }) {
  if (items.length === 0) return null;
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-hairline px-6 py-3.5 text-xs text-ink-muted">
        <span className="inline-flex items-center gap-1.5 font-medium text-ink-secondary">
          <IconLink size={14} stroke={1.5} />
          <span>关联标的互证</span>
        </span>
        <span className="font-mono tabular-nums">{items.length} 条</span>
      </div>
      <div className="divide-y divide-hairline">
        {items.map((item) => (
          <div key={item.id} className="space-y-1.5 px-6 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <Link
                href={`/thesis/${item.sourceThesisId}`}
                className="inline-flex items-center gap-1 font-semibold text-ink-primary hover:text-accent-coral"
              >
                <span>
                  {item.sourceCompanyName} ({item.sourceTicker})
                </span>
                <IconArrowUpRight size={13} stroke={1.5} />
              </Link>
              <Badge
                variant={
                  item.alignment === "aligned"
                    ? "pass"
                    : item.alignment === "divergent"
                      ? "fail"
                      : "warn"
                }
              >
                {item.topic}
              </Badge>
            </div>
            <p className="text-sm leading-relaxed text-ink-secondary">{item.statement}</p>
            <div className="text-xs text-ink-muted">
              {item.sourceAnchor} · {item.takeaway}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
