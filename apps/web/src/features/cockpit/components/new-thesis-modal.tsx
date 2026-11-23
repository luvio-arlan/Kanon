"use client";

import type { ThesisDetail } from "@kanon/core";
import { Button, DialogModal, Input, Textarea } from "@kanon/ui";
import { IconSparkles } from "@tabler/icons-react";
import { useState } from "react";
import { apiCreateThesis, type NewThesisDraft } from "../lib/cockpit-api";

export interface NewThesisModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (thesis: ThesisDetail) => void;
}

const EMPTY_DRAFT: NewThesisDraft = {
  ticker: "",
  companyName: "",
  sectorTag: "",
  currentPrice: "150",
  convictionSummary: "",
};

function TickerPriceRow({
  draft,
  onPatch,
}: {
  draft: NewThesisDraft;
  onPatch: (patch: Partial<NewThesisDraft>) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <label htmlFor="new-ticker" className="mb-1.5 block text-xs font-medium text-ink-muted">
          美股代码（Ticker）
        </label>
        <Input
          id="new-ticker"
          value={draft.ticker}
          onChange={(e) => onPatch({ ticker: e.target.value.toUpperCase() })}
          placeholder="如 TSM / MSFT"
          className="font-mono uppercase"
        />
      </div>
      <div>
        <label htmlFor="new-price" className="mb-1.5 block text-xs font-medium text-ink-muted">
          当前参考价 ($)
        </label>
        <Input
          id="new-price"
          type="number"
          min={0.5}
          step={0.5}
          value={draft.currentPrice}
          onChange={(e) => onPatch({ currentPrice: e.target.value })}
          className="font-mono tabular-nums"
        />
      </div>
    </div>
  );
}

function DraftFormFields({
  draft,
  onPatch,
}: {
  draft: NewThesisDraft;
  onPatch: (patch: Partial<NewThesisDraft>) => void;
}) {
  return (
    <div className="space-y-4">
      <TickerPriceRow draft={draft} onPatch={onPatch} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="new-name" className="mb-1.5 block text-xs font-medium text-ink-muted">
            公司名称
          </label>
          <Input
            id="new-name"
            value={draft.companyName}
            onChange={(e) => onPatch({ companyName: e.target.value })}
            placeholder="例如 台积电"
          />
        </div>
        <div>
          <label htmlFor="new-sector" className="mb-1.5 block text-xs font-medium text-ink-muted">
            核心赛道标签
          </label>
          <Input
            id="new-sector"
            value={draft.sectorTag}
            onChange={(e) => onPatch({ sectorTag: e.target.value })}
            placeholder="例如 晶圆代工 · 先进封装"
          />
        </div>
      </div>
      <Textarea
        value={draft.convictionSummary}
        onChange={(e) => onPatch({ convictionSummary: e.target.value })}
        placeholder="初步看多逻辑（可选）：先记下一句直觉，进入画布后再用 5 步脚手架证伪打磨..."
        className="min-h-[76px]"
      />
    </div>
  );
}

export function NewThesisModal({ open, onOpenChange, onCreated }: NewThesisModalProps) {
  const [draft, setDraft] = useState<NewThesisDraft>(EMPTY_DRAFT);
  const [submitting, setSubmitting] = useState(false);

  async function handleCreate() {
    setSubmitting(true);
    try {
      const created = await apiCreateThesis(draft);
      if (!created) return;
      setDraft(EMPTY_DRAFT);
      onOpenChange(false);
      onCreated(created);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogModal
      open={open}
      onOpenChange={onOpenChange}
      title="新建美股研究标的"
      subtitle="创建后将写入 PostgreSQL 并直达五步引导式研究画布"
      icon={<IconSparkles size={18} stroke={1.5} />}
      footer={
        <>
          <Button variant="outline" size="md" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button variant="primary" size="md" disabled={submitting} onClick={handleCreate}>
            {submitting ? "正在落库..." : "创建并进入画布"}
          </Button>
        </>
      }
    >
      <DraftFormFields draft={draft} onPatch={(p) => setDraft((prev) => ({ ...prev, ...p }))} />
    </DialogModal>
  );
}
