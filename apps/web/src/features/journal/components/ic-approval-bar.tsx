"use client";

import { Badge, Button, Input } from "@kanon/ui";
import { IconCheck, IconShieldCheck, IconX } from "@tabler/icons-react";
import { useState } from "react";
import type { IcApprovalRow } from "../lib/forecasts-ic-api";

const IC_STATE_LABEL: Record<IcApprovalRow["state"], string> = {
  draft: "草稿",
  in_review: "审阅中",
  approved: "已批准",
  rejected: "已驳回",
  archived: "已归档",
};

function resolveIcBadge(latest: IcApprovalRow | undefined, isPersonal: boolean) {
  if (!latest) return null;
  const label =
    isPersonal && latest.state === "approved" ? "自审通过" : IC_STATE_LABEL[latest.state];
  const variant =
    latest.state === "approved"
      ? ("pass" as const)
      : latest.state === "rejected"
        ? ("warn" as const)
        : ("titanium" as const);
  return { label, variant };
}

function buildIcMetaLine(latest: IcApprovalRow | undefined, isPersonal: boolean): string | null {
  if (!latest) return null;
  const datePart = (latest.updatedAt ?? latest.createdAt).slice(0, 10);
  const hashPart = latest.snapshotHash ? ` · ${latest.snapshotHash.slice(0, 8)}` : "";
  const notePart = latest.decisionNote ? ` · ${latest.decisionNote}` : "";
  return `${isPersonal ? "个人自审" : "团队 IC"} · ${datePart}${hashPart}${notePart}`;
}

function IcRejectForm({
  busy,
  onConfirm,
  onCancel,
}: {
  busy: boolean;
  onConfirm: (note: string) => void;
  onCancel: () => void;
}) {
  const [note, setNote] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="填写驳回理由"
        className="w-48"
      />
      <Button
        variant="outline"
        size="sm"
        loading={busy}
        disabled={!note.trim()}
        onClick={() => onConfirm(note)}
      >
        <span>确认驳回</span>
      </Button>
      <Button variant="ghost" size="sm" onClick={onCancel}>
        <span>取消</span>
      </Button>
    </div>
  );
}

function IcDecisionControls({
  approvalId,
  busy,
  onDecide,
}: {
  approvalId: string;
  busy: boolean;
  onDecide: (id: string, decision: "approved" | "rejected", note?: string) => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  if (rejecting) {
    return (
      <IcRejectForm
        busy={busy}
        onCancel={() => setRejecting(false)}
        onConfirm={(note) => {
          onDecide(approvalId, "rejected", note);
          setRejecting(false);
        }}
      />
    );
  }
  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => setRejecting(true)}>
        <IconX size={14} stroke={1.5} />
        <span>驳回</span>
      </Button>
      <Button
        variant="primary"
        size="sm"
        loading={busy}
        onClick={() => onDecide(approvalId, "approved")}
      >
        <IconCheck size={14} stroke={1.5} />
        <span>批准</span>
      </Button>
    </div>
  );
}

export function IcApprovalBar({
  latest,
  busy,
  onSubmit,
  onDecide,
}: {
  latest?: IcApprovalRow;
  busy: boolean;
  onSubmit: () => void;
  onDecide: (id: string, decision: "approved" | "rejected", note?: string) => void;
}) {
  const isPersonal = !latest?.orgId;
  const badge = resolveIcBadge(latest, isPersonal);
  const metaLine = buildIcMetaLine(latest, isPersonal);

  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-hairline bg-surface p-5">
      <div className="space-y-1">
        <div className="flex items-center gap-2.5">
          <IconShieldCheck size={16} stroke={1.5} className="text-ink-muted" />
          <span className="text-sm font-semibold text-ink-primary">
            {isPersonal ? "备忘录自审" : "投委会审批"}
          </span>
          {badge ? <Badge variant={badge.variant}>{badge.label}</Badge> : null}
        </div>
        {metaLine ? (
          <div className="font-mono text-xs text-ink-muted tabular-nums">{metaLine}</div>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        {latest?.state === "in_review" ? (
          <IcDecisionControls approvalId={latest.id} busy={busy} onDecide={onDecide} />
        ) : (
          <Button variant="outline" size="sm" loading={busy} onClick={onSubmit}>
            <span>提交审批</span>
          </Button>
        )}
      </div>
    </section>
  );
}
