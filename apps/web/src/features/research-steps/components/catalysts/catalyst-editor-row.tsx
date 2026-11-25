"use client";

import type {
  CatalystCategory,
  CatalystDirection,
  CatalystImpact,
  CatalystStatus,
  ThesisCatalyst,
} from "@kanon/core";
import { ActionMenu, Badge, Card, Input } from "@kanon/ui";
import { IconChevronDown, IconTrash } from "@tabler/icons-react";

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

function CompactPicker<T extends string>({
  ariaLabel,
  options,
  value,
  onChange,
}: {
  ariaLabel: string;
  options: ReadonlyArray<{ id: T; label: string }>;
  value: T;
  onChange: (next: T) => void;
}) {
  const active = options.find((o) => o.id === value)?.label ?? "";
  return (
    <ActionMenu
      ariaLabel={ariaLabel}
      items={options.map((opt) => ({
        id: opt.id,
        label: opt.label,
        selected: opt.id === value,
        onSelect: () => onChange(opt.id),
      }))}
      triggerClassName="h-7 border-transparent bg-transparent px-2 text-xs text-ink-secondary shadow-none hover:border-hairline hover:bg-muted/60 hover:text-ink-primary"
      trigger={
        <>
          <span>{active}</span>
          <IconChevronDown size={12} stroke={1.5} className="kanon-chevron text-ink-muted" />
        </>
      }
    />
  );
}

function CatalystMetaPickers({
  item,
  onChange,
  onRemove,
}: {
  item: ThesisCatalyst;
  onChange: (next: ThesisCatalyst) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <CompactPicker
        ariaLabel="催化类别"
        options={CATEGORY_OPTIONS}
        value={item.category}
        onChange={(category) => onChange({ ...item, category })}
      />
      <CompactPicker
        ariaLabel="影响程度"
        options={IMPACT_OPTIONS}
        value={item.impact}
        onChange={(impact) => onChange({ ...item, impact })}
      />
      <CompactPicker
        ariaLabel="催化方向"
        options={DIRECTION_OPTIONS}
        value={item.direction}
        onChange={(direction) => onChange({ ...item, direction })}
      />
      <button
        type="button"
        aria-label="删除催化剂"
        onClick={onRemove}
        className="ml-1 flex h-7 w-7 cursor-pointer items-center justify-center rounded-item text-ink-muted opacity-0 transition-[opacity,background-color,color] duration-150 hover:bg-status-fail-soft hover:text-status-fail focus-visible:opacity-100 group-hover/cat:opacity-100"
      >
        <IconTrash size={14} stroke={1.5} />
      </button>
    </div>
  );
}

function CatalystMetaHeader({
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
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-5 py-3 sm:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <button
          type="button"
          onClick={() => onChange({ ...item, status: STATUS_CYCLE[item.status] })}
          className="shrink-0 cursor-pointer"
          title="切换状态"
        >
          <Badge variant={st.variant}>{st.label}</Badge>
        </button>
        <Input
          variant="editorial"
          value={item.dateLabel}
          onChange={(e) => onChange({ ...item, dateLabel: e.target.value })}
          placeholder="时间窗口"
          className="w-28 shrink-0 font-mono text-xs text-ink-secondary"
        />
        <Input
          variant="editorial"
          value={item.title}
          onChange={(e) => onChange({ ...item, title: e.target.value })}
          placeholder="核心催化事件…"
          className="text-sm font-semibold"
        />
      </div>
      <CatalystMetaPickers item={item} onChange={onChange} onRemove={onRemove} />
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
    <Card className="group/cat overflow-hidden">
      <CatalystMetaHeader item={item} onChange={onChange} onRemove={onRemove} />
      <div className="grid grid-cols-1 divide-y divide-hairline bg-canvas/30 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        <div className="px-5 py-3 transition-colors focus-within:bg-surface/85 sm:px-6">
          <div className="mb-1 text-xs text-ink-muted">验证口径</div>
          <Input
            variant="editorial"
            value={item.verificationMetric}
            onChange={(e) => onChange({ ...item, verificationMetric: e.target.value })}
            placeholder="例如：毛利率 > 45%"
            className="font-mono text-xs"
          />
        </div>
        <div className="px-5 py-3 transition-colors focus-within:bg-surface/85 sm:px-6">
          <div className="mb-1 text-xs text-ink-muted">备注</div>
          <Input
            variant="editorial"
            value={item.note}
            onChange={(e) => onChange({ ...item, note: e.target.value })}
            placeholder="重估逻辑补充…"
            className="text-xs"
          />
        </div>
      </div>
    </Card>
  );
}
