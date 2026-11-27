"use client";

import type { SecFilingItem, SecFilingReaderResponse } from "@kanon/core";
import { Badge, Button, cn } from "@kanon/ui";
import { IconCloudDownload, IconExternalLink, IconRefresh } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { fetchLiveSecFiling } from "../../lib/filing-api";
import { FilingRedlineView } from "./filing-redline-view";

function SectionSwitcher(p: {
  reader: SecFilingReaderResponse;
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {p.reader.sections.map((sec) => (
        <button
          key={sec.id}
          type="button"
          onClick={() => p.onSelect(sec.id)}
          className={cn(
            "cursor-pointer rounded-pill border px-2.5 py-1 text-xs font-medium transition-colors",
            p.activeId === sec.id
              ? "border-strong bg-titanium text-ink-primary"
              : "border-hairline bg-surface text-ink-secondary hover:border-strong hover:text-ink-primary",
          )}
        >
          {sec.heading}
        </button>
      ))}
    </div>
  );
}

function useFilingLoader(
  ticker: string,
  filings: readonly SecFilingItem[],
  onLoadedText: (text: string, anchor: string) => void,
) {
  const defaultPick = filings.find((f) => f.form !== "4") ?? filings[0];
  const [selectedAcc, setSelectedAcc] = useState(defaultPick?.accessionNumber ?? "");
  const [loading, setLoading] = useState(false);
  const [reader, setReader] = useState<SecFilingReaderResponse | null>(null);
  const [sectionId, setSectionId] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  async function load(accession?: string, refresh = false) {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    try {
      const res = await fetchLiveSecFiling({
        ticker,
        accession: accession || undefined,
        refresh,
        signal: ctrl.signal,
      });
      if (ctrl.signal.aborted) return;
      if (!res.ok) return void toast.error(res.error);
      setReader(res.data);
      const first = res.data.sections[0];
      setSectionId(first?.id ?? "");
      onLoadedText(
        first ? first.paragraphs.join("\n\n") : res.data.fullExcerpt,
        `${res.data.form} (${res.data.filingDate || "SEC"})`,
      );
      toast.success(res.data.notice);
    } finally {
      if (abortRef.current === ctrl) setLoading(false);
    }
  }

  function selectSection(nextId: string) {
    setSectionId(nextId);
    const sec = reader?.sections.find((s) => s.id === nextId);
    if (sec && reader) onLoadedText(sec.paragraphs.join("\n\n"), `${reader.form} · ${sec.heading}`);
  }
  return { selectedAcc, setSelectedAcc, loading, reader, sectionId, load, selectSection };
}

function FilingPickActions(p: {
  documentUrl?: string;
  hasReader: boolean;
  loading: boolean;
  onLoad: (refresh?: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {p.documentUrl ? (
        <a
          href={p.documentUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink-primary"
        >
          <span>SEC 原件</span>
          <IconExternalLink size={13} stroke={1.5} />
        </a>
      ) : null}
      {p.hasReader ? (
        <Button
          variant="ghost"
          size="xs"
          aria-label="重新拉取 SEC 原文"
          disabled={p.loading}
          onClick={() => p.onLoad(true)}
        >
          <IconRefresh size={13} stroke={1.5} className={p.loading ? "animate-spin" : ""} />
        </Button>
      ) : null}
      <Button variant="titanium" size="xs" loading={p.loading} onClick={() => p.onLoad(false)}>
        {!p.loading ? <IconCloudDownload size={14} stroke={1.5} /> : null}
        <span>{p.loading ? "拉取中" : "直拉 SEC 原文"}</span>
      </Button>
    </div>
  );
}

function FilingPickRow(p: {
  picks: readonly SecFilingItem[];
  selectedAcc: string;
  documentUrl?: string;
  hasReader: boolean;
  loading: boolean;
  onSelect: (acc: string) => void;
  onLoad: (refresh?: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {p.picks.map((item) => (
          <button
            key={item.accessionNumber}
            type="button"
            onClick={() => p.onSelect(item.accessionNumber)}
            className={cn(
              "cursor-pointer rounded-control border px-2 py-1 font-mono text-xs transition-colors",
              p.selectedAcc === item.accessionNumber
                ? "border-strong bg-surface font-medium text-ink-primary"
                : "border-hairline bg-transparent text-ink-muted hover:text-ink-primary",
            )}
          >
            {item.form} · {item.filingDate.slice(0, 7)}
          </button>
        ))}
      </div>
      <FilingPickActions
        documentUrl={p.documentUrl}
        hasReader={p.hasReader}
        loading={p.loading}
        onLoad={p.onLoad}
      />
    </div>
  );
}

function FilingSourceSection(p: {
  reader: SecFilingReaderResponse;
  sectionId: string;
  onSelect: (id: string) => void;
}) {
  const badgeLabel = p.reader.cached
    ? "本地已缓存 · 即时"
    : p.reader.source === "sec-edgar-live"
      ? "SEC EDGAR 直连"
      : "本地摘要回退";
  return (
    <div className="space-y-2.5 border-t border-hairline pt-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionSwitcher reader={p.reader} activeId={p.sectionId} onSelect={p.onSelect} />
        <Badge variant={p.reader.source === "sec-edgar-live" ? "pass" : "default"}>
          {badgeLabel}
        </Badge>
      </div>
    </div>
  );
}

function ViewModeToggle(p: {
  mode: "source" | "redline";
  onChange: (m: "source" | "redline") => void;
}) {
  return (
    <div className="inline-flex rounded-pill border border-hairline bg-surface p-0.5 text-xs">
      {(["source", "redline"] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => p.onChange(mode)}
          className={cn(
            "cursor-pointer rounded-pill px-2.5 py-0.5 transition-colors",
            p.mode === mode ? "bg-titanium font-medium text-ink-primary" : "text-ink-muted",
          )}
        >
          {mode === "source" ? "原文" : "对照"}
        </button>
      ))}
    </div>
  );
}

export function FilingLivePanel({
  ticker,
  filings,
  onLoadedText,
  onSelectExcerpt,
}: {
  ticker: string;
  filings: readonly SecFilingItem[];
  onLoadedText: (text: string, anchor: string) => void;
  onSelectExcerpt?: (snippet: string) => void;
}) {
  const [viewMode, setViewMode] = useState<"source" | "redline">("source");
  const loader = useFilingLoader(ticker, filings, onLoadedText);
  const picks = filings.filter((f) => f.form !== "4").slice(0, 4);
  return (
    <div className="mb-4 space-y-3 rounded-card border border-hairline bg-titanium-subtle/60 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FilingPickRow
          picks={picks}
          selectedAcc={loader.selectedAcc}
          documentUrl={loader.reader?.documentUrl}
          hasReader={Boolean(loader.reader)}
          loading={loader.loading}
          onSelect={loader.setSelectedAcc}
          onLoad={(refresh) => void loader.load(loader.selectedAcc, Boolean(refresh))}
        />
        <ViewModeToggle mode={viewMode} onChange={setViewMode} />
      </div>
      {viewMode === "redline" ? (
        <FilingRedlineView
          ticker={ticker}
          currentAccession={loader.selectedAcc || undefined}
          onClipSnippet={onSelectExcerpt}
        />
      ) : loader.reader ? (
        <FilingSourceSection
          reader={loader.reader}
          sectionId={loader.sectionId}
          onSelect={loader.selectSection}
        />
      ) : null}
    </div>
  );
}
