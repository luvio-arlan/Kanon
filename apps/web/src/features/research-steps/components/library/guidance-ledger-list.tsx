"use client";

import type {
  GuidanceCandidate,
  GuidanceCommitment,
  GuidanceCredibility,
  ResearchNote,
} from "@kanon/core";
import { Badge, Button } from "@kanon/ui";
import { IconSparkles } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { apiListGuidance, apiPostGuidance } from "../../lib/guidance-api";
import { GuidanceEntryRow } from "./guidance-entry-row";

const STYLE_LABELS: Record<NonNullable<GuidanceCredibility["style"]>, string> = {
  conservative: "偏保守",
  balanced: "均衡",
  aggressive: "偏激进",
};

function CredibilitySummaryBar(p: {
  credibility: GuidanceCredibility | null;
  selectedNote: ResearchNote | null;
  busy: boolean;
  onExtract: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-6 py-3 sm:px-7">
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-secondary">
        {p.credibility?.keptRatio ? (
          <>
            <span className="font-mono font-medium text-ink-primary tabular-nums">
              兑现率 {p.credibility.keptRatio}
            </span>
            {p.credibility.style ? (
              <Badge variant="titanium">{STYLE_LABELS[p.credibility.style]}</Badge>
            ) : null}
          </>
        ) : (
          <span className="text-ink-muted">已验证指引样本不足，暂不评定信誉等级</span>
        )}
      </div>
      {p.selectedNote ? (
        <Button variant="outline" size="xs" loading={p.busy} onClick={p.onExtract}>
          {!p.busy ? <IconSparkles size={13} stroke={1.5} /> : null}
          <span>从当前纪要抽取指引</span>
        </Button>
      ) : null}
    </div>
  );
}

function PendingDraftsSection(p: {
  drafts: readonly GuidanceCommitment[];
  open: boolean;
  busy: boolean;
  onToggle: () => void;
  onConfirm: (item: GuidanceCommitment) => void;
  onWithdraw: (item: GuidanceCommitment) => void;
}) {
  if (p.drafts.length === 0) return null;
  return (
    <div className="border-b border-hairline bg-canvas/35">
      <button
        type="button"
        onClick={p.onToggle}
        className="flex w-full cursor-pointer items-center justify-between px-6 py-2.5 text-xs font-medium text-ink-secondary hover:text-ink-primary sm:px-7"
      >
        <span>待确认 ({p.drafts.length})</span>
        <span>{p.open ? "收起" : "展开"}</span>
      </button>
      {p.open ? (
        <div className="divide-y divide-hairline border-t border-hairline">
          {p.drafts.map((item) => (
            <GuidanceEntryRow
              key={item.id}
              item={item}
              busy={p.busy}
              onConfirm={p.onConfirm}
              onWithdraw={p.onWithdraw}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ConfirmedGuidanceSection(p: {
  loading: boolean;
  confirmed: readonly GuidanceCommitment[];
  busy: boolean;
}) {
  if (p.loading) return <p className="px-6 py-6 text-xs text-ink-muted sm:px-7">加载指引账本…</p>;
  if (p.confirmed.length === 0) {
    return (
      <p className="px-6 py-6 text-xs text-ink-muted sm:px-7">
        暂无已确认管理层指引。可从法说会纪要抽取并确认入账。
      </p>
    );
  }
  return (
    <div className="divide-y divide-hairline">
      {p.confirmed.map((item) => (
        <GuidanceEntryRow key={item.id} item={item} busy={p.busy} />
      ))}
    </div>
  );
}

function PressCandidatesStrip(p: {
  candidates: readonly GuidanceCandidate[];
  busy: boolean;
  onAdopt: (candidateId: string) => void;
}) {
  if (p.candidates.length === 0) return null;
  return (
    <div className="divide-y divide-hairline border-b border-hairline bg-canvas/20 text-xs">
      {p.candidates.slice(0, 6).map((c) => (
        <div
          key={c.id}
          className="flex flex-wrap items-center justify-between gap-2 px-6 py-2 sm:px-7"
        >
          <span className="min-w-0 flex-1 truncate text-ink-secondary">
            来自 8-K · {c.issuedOn} · FY{c.targetFiscalYear} {c.targetFiscalPeriod} · {c.quote}
          </span>
          <Button variant="outline" size="xs" disabled={p.busy} onClick={() => p.onAdopt(c.id)}>
            <span>采纳</span>
          </Button>
        </div>
      ))}
    </div>
  );
}

function useGuidanceLedger(thesisId: string) {
  const [items, setItems] = useState<GuidanceCommitment[]>([]);
  const [candidates, setCandidates] = useState<GuidanceCandidate[]>([]);
  const [credibility, setCredibility] = useState<GuidanceCredibility | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    void apiListGuidance(thesisId, ctrl.signal).then((res) => {
      if (ctrl.signal.aborted) return;
      if (res.ok) {
        setItems(res.data.items);
        setCandidates(res.data.candidates ?? []);
        setCredibility(res.data.credibility);
      }
      setLoading(false);
    });
    return () => ctrl.abort();
  }, [thesisId]);

  async function runOp(req: Parameters<typeof apiPostGuidance>[1], successMsg: string) {
    setBusy(true);
    const res = await apiPostGuidance(thesisId, req);
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    setItems(res.data.items);
    setCandidates(res.data.candidates ?? []);
    setCredibility(res.data.credibility);
    toast.success(successMsg);
  }

  return { items, candidates, credibility, loading, busy, runOp };
}

export function GuidanceLedgerList({
  thesisId,
  selectedNote,
}: {
  thesisId: string;
  selectedNote: ResearchNote | null;
}) {
  const { items, candidates, credibility, loading, busy, runOp } = useGuidanceLedger(thesisId);
  const [draftsOpen, setDraftsOpen] = useState(true);
  const drafts = items.filter((i) => i.status === "draft_ai" || i.status === "draft_legacy");
  const confirmed = items.filter((i) => i.status === "confirmed");

  return (
    <div>
      <CredibilitySummaryBar
        credibility={credibility}
        selectedNote={selectedNote}
        busy={busy}
        onExtract={() =>
          selectedNote
            ? void runOp({ op: "draft_from_note", noteId: selectedNote.id }, "已抽取待确认指引草稿")
            : undefined
        }
      />
      <PressCandidatesStrip
        candidates={candidates}
        busy={busy}
        onAdopt={(candidateId) =>
          void runOp({ op: "adopt_candidate", candidateId }, "已采纳为待确认草稿")
        }
      />
      <PendingDraftsSection
        drafts={drafts}
        open={draftsOpen}
        busy={busy}
        onToggle={() => setDraftsOpen((v) => !v)}
        onConfirm={(it) =>
          void runOp(
            { op: "confirm", id: it.id, expectedUpdatedAt: it.updatedAt },
            "指引已确认入账",
          )
        }
        onWithdraw={(it) => void runOp({ op: "withdraw", id: it.id }, "已忽略草稿")}
      />
      <ConfirmedGuidanceSection loading={loading} confirmed={confirmed} busy={busy} />
    </div>
  );
}
