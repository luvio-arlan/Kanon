"use client";

import type { SecFilingDiff, SecFilingItem, SecFilingReaderResponse } from "@kanon/core";
import { Badge, Button, cn } from "@kanon/ui";
import { IconCloudDownload, IconExternalLink, IconGitCompare } from "@tabler/icons-react";
import { useState } from "react";
import { toast } from "sonner";
import { fetchLiveSecFiling } from "../../lib/filing-api";

function FilingDiffBox({ diff }: { diff: SecFilingDiff }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-control border border-hairline bg-muted/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-primary">
          <IconGitCompare size={14} stroke={1.5} className="text-accent-coral" />
          <span>{diff.changeSummary}</span>
        </span>
        <Button variant="ghost" size="xs" onClick={() => setOpen((v) => !v)}>
          <span>{open ? "收起对比" : "查看措辞 Diff"}</span>
        </Button>
      </div>
      {open ? (
        <div className="mt-2.5 space-y-2 border-t border-hairline pt-2.5 text-xs">
          {diff.addedSnippets.map((snippet) => (
            <div
              key={`add-${snippet.slice(0, 32)}`}
              className="rounded-badge border-l-2 border-status-pass bg-status-pass-soft/35 px-2.5 py-1.5 leading-relaxed text-ink-primary"
            >
              + {snippet}
            </div>
          ))}
          {diff.removedSnippets.map((snippet) => (
            <div
              key={`rem-${snippet.slice(0, 32)}`}
              className="rounded-badge border-l-2 border-status-warn bg-status-warn-soft/35 px-2.5 py-1.5 leading-relaxed text-ink-secondary line-through"
            >
              − {snippet}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SectionSwitcher({
  reader,
  activeId,
  onSelect,
}: {
  reader: SecFilingReaderResponse;
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {reader.sections.map((sec) => (
        <button
          key={sec.id}
          type="button"
          onClick={() => onSelect(sec.id)}
          className={cn(
            "cursor-pointer rounded-pill border px-2.5 py-1 text-xs font-medium transition-colors",
            activeId === sec.id
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
  const [selectedAcc, setSelectedAcc] = useState(filings[0]?.accessionNumber ?? "");
  const [loading, setLoading] = useState(false);
  const [reader, setReader] = useState<SecFilingReaderResponse | null>(null);
  const [sectionId, setSectionId] = useState("");

  async function load(accession?: string) {
    setLoading(true);
    try {
      const res = await fetchLiveSecFiling({ ticker, accession: accession || undefined });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setReader(res.data);
      const first = res.data.sections[0];
      setSectionId(first?.id ?? "");
      const anchor = `${res.data.form} (${res.data.filingDate || "SEC"})`;
      onLoadedText(first ? first.paragraphs.join("\n\n") : res.data.fullExcerpt, anchor);
      toast.success(res.data.notice);
    } finally {
      setLoading(false);
    }
  }

  function selectSection(nextId: string) {
    setSectionId(nextId);
    const sec = reader?.sections.find((s) => s.id === nextId);
    if (sec && reader) {
      onLoadedText(sec.paragraphs.join("\n\n"), `${reader.form} · ${sec.heading}`);
    }
  }

  return { selectedAcc, setSelectedAcc, loading, reader, sectionId, load, selectSection };
}

function FilingPickRow(p: {
  picks: readonly SecFilingItem[];
  selectedAcc: string;
  documentUrl?: string;
  loading: boolean;
  onSelect: (acc: string) => void;
  onLoad: () => void;
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
        <Button variant="titanium" size="xs" loading={p.loading} onClick={p.onLoad}>
          {!p.loading ? <IconCloudDownload size={14} stroke={1.5} /> : null}
          <span>{p.loading ? "拉取中" : "直拉 SEC 原文"}</span>
        </Button>
      </div>
    </div>
  );
}

export function FilingLivePanel({
  ticker,
  filings,
  onLoadedText,
}: {
  ticker: string;
  filings: readonly SecFilingItem[];
  onLoadedText: (text: string, anchor: string) => void;
}) {
  const loader = useFilingLoader(ticker, filings, onLoadedText);
  return (
    <div className="mb-4 space-y-3 rounded-card border border-hairline bg-titanium-subtle/60 p-3.5">
      <FilingPickRow
        picks={filings.slice(0, 4)}
        selectedAcc={loader.selectedAcc}
        documentUrl={loader.reader?.documentUrl}
        loading={loader.loading}
        onSelect={loader.setSelectedAcc}
        onLoad={() => void loader.load(loader.selectedAcc)}
      />
      {loader.reader ? (
        <div className="space-y-2.5 border-t border-hairline pt-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionSwitcher
              reader={loader.reader}
              activeId={loader.sectionId}
              onSelect={loader.selectSection}
            />
            <Badge variant={loader.reader.source === "sec-edgar-live" ? "pass" : "default"}>
              {loader.reader.source === "sec-edgar-live" ? "SEC EDGAR 直连" : "本地摘要回退"}
            </Badge>
          </div>
          {loader.reader.diff ? <FilingDiffBox diff={loader.reader.diff} /> : null}
        </div>
      ) : null}
    </div>
  );
}
