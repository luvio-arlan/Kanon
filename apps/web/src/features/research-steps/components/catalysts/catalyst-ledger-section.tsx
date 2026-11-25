"use client";

import type { ThesisCatalyst } from "@kanon/core";
import { Button } from "@kanon/ui";
import { IconPlus } from "@tabler/icons-react";
import { useMemo } from "react";
import { type AutoSaveStatus, useThesisStepDraft } from "@/shared/hooks/use-thesis-step-draft";
import { CatalystEditorRow } from "./catalyst-editor-row";

function createBlankCatalyst(thesisId: string): ThesisCatalyst {
  return {
    id: `${thesisId}-cat-${Date.now().toString(36).slice(-5)}`,
    title: "下一季财报毛利率与核心增速指引验证",
    dateLabel: "下一季财报",
    category: "earnings",
    impact: "high",
    direction: "bullish",
    status: "upcoming",
    verificationMetric: "单季营收同比增速与毛利率高于指引中值",
    note: "",
  };
}

function isCatalystItem(val: unknown): val is ThesisCatalyst {
  if (!val || typeof val !== "object") return false;
  const r = val as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.title === "string" &&
    typeof r.dateLabel === "string" &&
    typeof r.verificationMetric === "string"
  );
}

function isCatalystArray(val: unknown): val is ThesisCatalyst[] {
  return Array.isArray(val) && val.every(isCatalystItem);
}

function areValidCatalysts(items: readonly ThesisCatalyst[]): boolean {
  return items.every(
    (c) =>
      c.title.trim().length >= 2 &&
      c.dateLabel.trim().length >= 2 &&
      c.verificationMetric.trim().length >= 1,
  );
}

function CatalystEmptyCard({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-card border border-hairline bg-surface px-6 py-10 text-center">
      <p className="text-sm text-ink-secondary">暂无催化事件</p>
      <div className="mt-4">
        <Button variant="outline" size="sm" onClick={onAdd}>
          <IconPlus size={14} stroke={1.5} />
          <span>新增催化剂</span>
        </Button>
      </div>
    </div>
  );
}

function AddCatalystTrigger({ onAdd }: { onAdd: () => void }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-panel border border-hairline bg-surface/60 py-3 text-xs font-medium text-ink-secondary transition-colors duration-150 ease-[var(--ease-kanon)] hover:border-strong hover:bg-surface hover:text-ink-primary"
    >
      <IconPlus size={14} stroke={1.5} />
      <span>新增催化事件</span>
    </button>
  );
}

export function CatalystLedgerSection(p: {
  thesisId: string;
  serverCatalysts: readonly ThesisCatalyst[];
  serverVersion: string;
  onSyncChange?: (status: AutoSaveStatus, flush: (() => Promise<void>) | null) => void;
  onSave: (items: ThesisCatalyst[]) => Promise<boolean>;
}) {
  const serverValue = useMemo(() => [...p.serverCatalysts], [p.serverCatalysts]);
  const d = useThesisStepDraft<ThesisCatalyst[]>({
    storageKey: `kanon-draft:${p.thesisId}:step2-catalysts`,
    serverValue,
    serverVersion: p.serverVersion,
    canSaveDraft: areValidCatalysts,
    onSyncChange: p.onSyncChange,
    validateStored: isCatalystArray,
    onSave: p.onSave,
  });
  const handleAdd = () => d.setDraft((prev) => [...prev, createBlankCatalyst(p.thesisId)]);
  if (d.draft.length === 0) return <CatalystEmptyCard onAdd={handleAdd} />;

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {d.draft.map((item) => (
          <CatalystEditorRow
            key={item.id}
            item={item}
            onChange={(next) =>
              d.setDraft((prev) => prev.map((it) => (it.id === item.id ? next : it)))
            }
            onRemove={() => d.setDraft((prev) => prev.filter((it) => it.id !== item.id))}
          />
        ))}
      </div>
      {d.draft.length < 12 ? <AddCatalystTrigger onAdd={handleAdd} /> : null}
    </div>
  );
}
