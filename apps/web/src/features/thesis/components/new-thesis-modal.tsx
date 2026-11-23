"use client";

import type { ThesisDetail } from "@kanon/core";
import { Button, DialogModal, Input, Textarea } from "@kanon/ui";
import { IconSparkles } from "@tabler/icons-react";
import { useState } from "react";
import { toast } from "sonner";

export interface NewThesisModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (thesis: ThesisDetail) => void;
}

interface DraftFields {
  ticker: string;
  companyName: string;
  sectorTag: string;
  currentPrice: string;
  convictionSummary: string;
}

const EMPTY_DRAFT: DraftFields = {
  ticker: "",
  companyName: "",
  sectorTag: "",
  currentPrice: "150",
  convictionSummary: "",
};

async function submitNewThesis(draft: DraftFields): Promise<ThesisDetail | null> {
  const priceNum = Number(draft.currentPrice);
  if (
    !draft.ticker.trim() ||
    !draft.companyName.trim() ||
    !draft.sectorTag.trim() ||
    priceNum <= 0
  ) {
    toast.error("请完整填写美股代码、公司名称、赛道与参考价");
    return null;
  }
  const res = await fetch("/api/theses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ticker: draft.ticker.trim().toUpperCase(),
      companyName: draft.companyName.trim(),
      sectorTag: draft.sectorTag.trim(),
      currentPrice: priceNum,
      convictionSummary: draft.convictionSummary.trim() || undefined,
    }),
  });
  const json = (await res.json()) as { thesis?: ThesisDetail; error?: string };
  if (!res.ok || !json.thesis) {
    toast.error(json.error ?? "创建标的失败");
    return null;
  }
  toast.success(`已新建 ${json.thesis.companyName} (${json.thesis.ticker}) 研究档案`);
  return json.thesis;
}

function TickerPriceRow({
  draft,
  onPatch,
}: {
  draft: DraftFields;
  onPatch: (patch: Partial<DraftFields>) => void;
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
  draft: DraftFields;
  onPatch: (patch: Partial<DraftFields>) => void;
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
  const [draft, setDraft] = useState<DraftFields>(EMPTY_DRAFT);
  const [submitting, setSubmitting] = useState(false);

  async function handleCreate() {
    setSubmitting(true);
    try {
      const created = await submitNewThesis(draft);
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
