"use client";

import type {
  CatalystCategory,
  CatalystDirection,
  CatalystImpact,
  CatalystStatus,
  ThesisCatalyst,
} from "@kanon/core";
import { Badge, Button, Input } from "@kanon/ui";
import { IconTrash } from "@tabler/icons-react";

const STATUS_CYCLE: Record<CatalystStatus, CatalystStatus> = {
  upcoming: "realized",
  realized: "missed",
  missed: "upcoming",
};

const STATUS_META: Record<
  CatalystStatus,
  { label: string; variant: "coral" | "pass" | "default" }
> = {
  upcoming: { label: "待验证", variant: "coral" },
  realized: { label: "已兑现", variant: "pass" },
  missed: { label: "未兑现", variant: "default" },
};

const CATEGORY_OPTIONS: ReadonlyArray<{ id: CatalystCategory; label: string }> = [
  { id: "earnings", label: "财报节点" },
  { id: "product", label: "产品周期" },
  { id: "capital", label: "资本配置" },
  { id: "regulatory", label: "政策监管" },
  { id: "macro", label: "宏观行业" },
];

const DIRECTION_OPTIONS: ReadonlyArray<{ id: CatalystDirection; label: string }> = [
  { id: "bullish", label: "偏多" },
  { id: "binary", label: "双向" },
  { id: "bearish", label: "风险" },
];

const IMPACT_OPTIONS: ReadonlyArray<{ id: CatalystImpact; label: string }> = [
  { id: "high", label: "高影响" },
  { id: "medium", label: "中影响" },
];

function OptionPills<T extends string>({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<{ id: T; label: string }>;
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div className="inline-flex flex-wrap items-center gap-1">
      {options.map((opt) => (
        <Button
          key={opt.id}
          variant={opt.id === value ? "titanium" : "ghost"}
          size="xs"
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}

function CatalystMetaBar({
  item,
  onChange,
  onRemove,
}: {
  item: ThesisCatalyst;
  onChange: (next: ThesisCatalyst) => void;
  onRemove: () => void;
}) {
  const st = STATUS_META[item.status];
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onChange({ ...item, status: STATUS_CYCLE[item.status] })}
          className="cursor-pointer"
          title="点击切换状态（待验证 → 已兑现 → 未兑现）"
        >
          <Badge variant={st.variant}>{st.label}</Badge>
        </button>
        <OptionPills
          options={CATEGORY_OPTIONS}
          value={item.category}
          onChange={(category) => onChange({ ...item, category })}
        />
      </div>
      <div className="flex items-center gap-1.5">
        <OptionPills
          options={IMPACT_OPTIONS}
          value={item.impact}
          onChange={(impact) => onChange({ ...item, impact })}
        />
        <OptionPills
          options={DIRECTION_OPTIONS}
          value={item.direction}
          onChange={(direction) => onChange({ ...item, direction })}
        />
        <Button variant="ghost" size="icon-sm" aria-label="删除催化剂" onClick={onRemove}>
          <IconTrash size={14} stroke={1.5} className="text-ink-muted" />
        </Button>
      </div>
    </div>
  );
}

export function CatalystEditorRow({
  item,
  onChange,
  onRemove,
}: {
  item: ThesisCatalyst;
  onChange: (next: ThesisCatalyst) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-3 rounded-panel border border-hairline bg-surface p-4 shadow-card">
      <CatalystMetaBar item={item} onChange={onChange} onRemove={onRemove} />
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[160px_1fr]">
        <Input
          value={item.dateLabel}
          onChange={(e) => onChange({ ...item, dateLabel: e.target.value })}
          placeholder="时间窗口（如 2027 Q1）"
          className="h-9 font-mono text-xs"
        />
        <Input
          value={item.title}
          onChange={(e) => onChange({ ...item, title: e.target.value })}
          placeholder="核心催化事件（如 Blackwell 放量 / HBM4 认证）"
          className="h-9 text-sm font-medium"
        />
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <Input
          value={item.verificationMetric}
          onChange={(e) => onChange({ ...item, verificationMetric: e.target.value })}
          placeholder="量化验证口径（如 毛利率 > 45%）"
          className="h-9 font-mono text-xs"
        />
        <Input
          value={item.note}
          onChange={(e) => onChange({ ...item, note: e.target.value })}
          placeholder="预期差重估逻辑备注（可选）"
          className="h-9 text-xs"
        />
      </div>
    </div>
  );
}
