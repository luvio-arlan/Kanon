"use client";

import type { FilingRedlineResponse, RedlineChange, RedlineSection } from "@kanon/core";
import { Badge, cn } from "@kanon/ui";
import { useEffect, useState } from "react";
import { fetchFilingRedline } from "../../lib/redline-api";
import { FilingRedlineChangeRow } from "./filing-redline-change-row";

const SECTION_TABS: ReadonlyArray<{ id: RedlineSection; label: string }> = [
  { id: "risk_factors", label: "风险因素 (1A)" },
  { id: "mda", label: "经营讨论 (7)" },
];

const EMPTY_STATUS_LABELS: Record<
  Exclude<FilingRedlineResponse["status"], "ready" | "pending">,
  string
> = {
  no_comparable: "暂无同口径可比往期申报",
  section_missing: "该申报未识别到对应章节正文",
  too_large: "原文体积超出在线比对上限",
  failed: "跨期对照构建失败",
};

function useRedlineQuery(ticker: string, section: RedlineSection, current?: string) {
  const [data, setData] = useState<FilingRedlineResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    async function poll() {
      const res = await fetchFilingRedline({ ticker, section, current, signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      if (!res.ok) {
        setError(res.error);
        setLoading(false);
        return;
      }
      setData(res.data);
      if (res.data.status === "pending" && attempts < 8) {
        attempts += 1;
        timer = setTimeout(() => void poll(), 1500);
        return;
      }
      setLoading(false);
    }

    setLoading(true);
    setError(null);
    void poll();
    return () => {
      ctrl.abort();
      if (timer) clearTimeout(timer);
    };
  }, [ticker, section, current]);

  return { data, error, loading };
}

function RedlineToolbar(p: {
  section: RedlineSection;
  numbersOnlyCount: number;
  showNumbersOnly: boolean;
  onSection: (s: RedlineSection) => void;
  onToggleNumbers: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-1.5">
        {SECTION_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => p.onSection(tab.id)}
            className={cn(
              "cursor-pointer rounded-pill border px-2.5 py-1 text-xs font-medium transition-colors",
              p.section === tab.id
                ? "border-strong bg-titanium text-ink-primary"
                : "border-hairline bg-surface text-ink-secondary hover:text-ink-primary",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {p.numbersOnlyCount > 0 ? (
        <button
          type="button"
          onClick={p.onToggleNumbers}
          className="cursor-pointer font-mono text-xs text-ink-muted hover:text-ink-primary"
        >
          {p.showNumbersOnly ? "隐藏纯数字变动" : `含纯数字变动 (${p.numbersOnlyCount})`}
        </button>
      ) : null}
    </div>
  );
}

function RedlineBody(p: {
  data: FilingRedlineResponse | null;
  loading: boolean;
  changes: readonly RedlineChange[];
  onClipSnippet?: (snippet: string) => void;
}) {
  if (p.loading || p.data?.status === "pending") {
    return <p className="text-xs text-ink-muted">正在生成跨期逐词对照…</p>;
  }
  if (p.data && p.data.status !== "ready") {
    return <p className="text-xs text-ink-muted">{EMPTY_STATUS_LABELS[p.data.status]}</p>;
  }
  if (p.changes.length === 0) {
    return <p className="text-xs text-ink-muted">两期正文未发现实质性措辞变动。</p>;
  }
  return (
    <div className="max-h-72 overflow-y-auto pr-1">
      {p.changes.map((change) => (
        <FilingRedlineChangeRow key={change.id} change={change} onClip={p.onClipSnippet} />
      ))}
    </div>
  );
}

export function FilingRedlineView({
  ticker,
  currentAccession,
  onClipSnippet,
}: {
  ticker: string;
  currentAccession?: string;
  onClipSnippet?: (snippet: string) => void;
}) {
  const [section, setSection] = useState<RedlineSection>("risk_factors");
  const [showNumbersOnly, setShowNumbersOnly] = useState(false);
  const { data, error, loading } = useRedlineQuery(ticker, section, currentAccession);
  const visibleChanges = (data?.changes ?? []).filter(
    (c) => showNumbersOnly || c.kind !== "numbers_only",
  );
  return (
    <div className="space-y-3 border-t border-hairline pt-3">
      <RedlineToolbar
        section={section}
        numbersOnlyCount={data?.stats?.numbersOnly ?? 0}
        showNumbersOnly={showNumbersOnly}
        onSection={setSection}
        onToggleNumbers={() => setShowNumbersOnly((v) => !v)}
      />
      {data?.current && data.previous ? (
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-ink-muted">
          <span>
            {data.current.form} ({data.current.filedAt}) 对比 {data.previous.form} (
            {data.previous.filedAt})
          </span>
          {data.stats ? (
            <Badge variant="titanium">
              +{data.stats.added} / -{data.stats.removed} / ~{data.stats.modified}
            </Badge>
          ) : null}
        </div>
      ) : null}
      {error ? <p className="text-xs text-status-fail">{error}</p> : null}
      <RedlineBody
        data={data}
        loading={loading}
        changes={visibleChanges}
        onClipSnippet={onClipSnippet}
      />
    </div>
  );
}
