"use client";

import type { SecFilingItem, SecFinancialFact, SecSnapshot } from "@kanon/core";
import { Badge, Button, Card } from "@kanon/ui";
import { IconExternalLink, IconRefresh } from "@tabler/icons-react";

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
