"use client";

import type { ThesisCatalyst } from "@kanon/core";
import { Button } from "@kanon/ui";
import { IconCheck, IconDeviceFloppy, IconPlus } from "@tabler/icons-react";
import { useEffect, useState } from "react";
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

function CatalystFooterBar(p: {
  count: number;
  saving: boolean;
  onAdd: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
      {p.count < 12 ? (
        <Button variant="outline" size="md" onClick={p.onAdd}>
          <IconPlus size={15} stroke={1.5} />
          <span>新增催化事件</span>
        </Button>
      ) : (
        <span className="font-mono text-xs text-ink-muted">12 / 12 催化剂上限</span>
      )}
      <Button variant="primary" size="lg" disabled={p.saving} onClick={p.onSave}>
        {p.saving ? (
          <IconCheck size={16} stroke={1.5} />
        ) : (
          <IconDeviceFloppy size={16} stroke={1.5} />
        )}
        <span>{p.saving ? "保存中..." : `保存 ${p.count} 项催化剂`}</span>
      </Button>
    </div>
  );
}

function CatalystEmptyCard({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-card border border-hairline bg-surface p-8 text-center">
      <p className="text-sm text-ink-secondary">
        高安全边际若缺乏明确催化剂，容易陷入长期价值陷阱。建议列出 2–4 个关键财报或产品节点。
      </p>
      <div className="mt-4">
        <Button variant="titanium" size="sm" onClick={onAdd}>
          <IconPlus size={15} stroke={1.5} />
          <span>新增首条催化剂</span>
        </Button>
      </div>
    </div>
  );
}

export function CatalystLedgerSection({
  thesisId,
  serverCatalysts,
  saving,
  onSave,
}: {
  thesisId: string;
  serverCatalysts: readonly ThesisCatalyst[];
  saving: boolean;
  onSave: (items: ThesisCatalyst[]) => Promise<void>;
}) {
  const [items, setItems] = useState<ThesisCatalyst[]>([...serverCatalysts]);
  useEffect(() => {
    setItems([...serverCatalysts]);
  }, [serverCatalysts]);

  const handlePatch = (id: string, next: ThesisCatalyst) =>
    setItems((prev) => prev.map((it) => (it.id === id ? next : it)));
  const handleRemove = (id: string) => setItems((prev) => prev.filter((it) => it.id !== id));
  const handleAdd = () => setItems((prev) => [...prev, createBlankCatalyst(thesisId)]);

  return (
    <div className="space-y-4">
      {items.length === 0 ? (
        <CatalystEmptyCard onAdd={handleAdd} />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <CatalystEditorRow
              key={item.id}
              item={item}
              onChange={(next) => handlePatch(item.id, next)}
              onRemove={() => handleRemove(item.id)}
            />
          ))}
        </div>
      )}
      <CatalystFooterBar
        count={items.length}
        saving={saving}
        onAdd={handleAdd}
        onSave={() => void onSave(items)}
      />
    </div>
  );
}
