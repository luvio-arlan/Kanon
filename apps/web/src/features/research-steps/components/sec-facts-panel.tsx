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
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {facts.map((fact) => (
        <div key={fact.metric} className="rounded-control border border-hairline bg-surface p-3.5">
          <div className="text-xs text-ink-muted">
            {fact.label} · {fact.period}
          </div>
          <div className="mt-1 font-mono text-xl font-semibold text-ink-primary tabular-nums">
            {fact.valueFormatted}
          </div>
        </div>
      ))}
    </div>
  );
}

function FilingsRow({ filings }: { filings: readonly SecFilingItem[] }) {
  if (filings.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {filings.slice(0, 4).map((f) => (
        <a
          key={f.accessionNumber}
          href={f.documentUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-control border border-hairline bg-surface px-3 py-1.5 text-xs font-medium text-ink-primary transition-colors hover:border-strong"
        >
          <span className="font-mono">{f.form}</span>
          <span className="text-ink-muted tabular-nums">{f.filingDate}</span>
          <IconExternalLink size={13} stroke={1.5} className="text-ink-muted" />
        </a>
      ))}
    </div>
  );
}

export function SecFactsPanel({ ticker, snapshot, syncing, onSync }: SecFactsPanelProps) {
  return (
    <Card tone="titanium" className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-ink-primary">SEC EDGAR 官方一阶档案</h3>
            <Badge variant={snapshot?.source === "sec-edgar-live" ? "pass" : "default"}>
              {snapshot?.source === "sec-edgar-live" ? "SEC 实时已缓存" : "基准缓存"}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-ink-secondary">
            {snapshot
              ? `${snapshot.entityName} · CIK ${snapshot.cik}（所有财务锚点均读自 Postgres 缓存，严禁大模型编造）`
              : `点击一键拉取 ${ticker} 官方 10-K / 10-Q 原件列表与 XBRL 财务事实`}
          </p>
        </div>
        <Button variant="outline" size="sm" disabled={syncing} onClick={onSync}>
          <IconRefresh size={14} stroke={1.5} className={syncing ? "animate-spin" : ""} />
          <span>{syncing ? "同步中..." : "同步 SEC EDGAR"}</span>
        </Button>
      </div>
      {snapshot ? <FactsGrid facts={snapshot.facts} /> : null}
      {snapshot ? <FilingsRow filings={snapshot.filings} /> : null}
    </Card>
  );
}

export function EarningsDigestPanel({ digest }: { digest: EarningsDigest }) {
  return (
    <Card className="space-y-4 border-accent-coral/30 p-6">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-ink-primary">电话会核心提炼（已持久化）</h3>
        <Badge variant="coral">{digest.quarterLabel}</Badge>
      </div>
      <p className="text-sm leading-relaxed text-ink-primary">{digest.guidanceSummary}</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {[
          { title: "资本开支与供给信号", items: digest.capexSignals },
          { title: "管理层措辞与关注点", items: digest.toneShifts },
        ].map((group) => (
          <div key={group.title} className="rounded-control bg-muted/60 p-4">
            <div className="text-xs font-semibold text-ink-primary">{group.title}</div>
            <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-ink-secondary">
              {group.items.map((sig) => (
                <li key={sig}>{sig}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {digest.quotesWithAnchors.length > 0 ? (
        <div className="space-y-2 border-t border-hairline pt-4">
          <div className="text-xs font-semibold text-ink-muted">一阶原文锚点摘录</div>
          {digest.quotesWithAnchors.map((q) => (
            <div
              key={`${q.topic}-${q.sourceAnchor}`}
              className="border-l-2 border-accent-coral/60 py-0.5 pl-3.5"
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
    </Card>
  );
}

export function InboundCrossChecksPanel({ items }: { items: readonly InboundCrossCheck[] }) {
  if (items.length === 0) return null;
  return (
    <Card className="space-y-3 p-5">
      <div className="flex items-center justify-between gap-2 text-xs text-ink-muted">
        <span className="inline-flex items-center gap-1.5 font-medium text-ink-secondary">
          <IconLink size={14} stroke={1.5} />
          <span>来自库内关联标的的双向产业链互证</span>
        </span>
        <span className="font-mono tabular-nums">{items.length} 条引用</span>
      </div>
      <div className="divide-y divide-hairline">
        {items.map((item) => (
          <div key={item.id} className="space-y-1.5 py-3 first:pt-1 last:pb-1">
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
            <p className="text-xs leading-relaxed text-ink-secondary">{item.statement}</p>
            <div className="text-xs text-ink-muted">
              出处：{item.sourceAnchor} · 结论：{item.takeaway}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
