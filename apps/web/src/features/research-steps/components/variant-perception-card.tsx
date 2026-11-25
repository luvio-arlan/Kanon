"use client";

import type { BusinessFilter } from "@kanon/core";
import { Card, cn, Textarea } from "@kanon/ui";

interface VariantFieldConfig {
  code: string;
  key: "consensusView" | "variantPerception" | "keyDebate" | "preMortem";
  label: string;
  placeholder: string;
  starter: string;
}

const BUY_SIDE_FIELDS: readonly VariantFieldConfig[] = [
  {
    code: "01",
    key: "consensusView",
    label: "市场一致预期",
    placeholder: "当前股价正在定价的核心叙事…",
    starter: "市场当前按传统周期或单一产品折价估值，核心担忧在于未来 4 季增速放缓与竞争加剧。",
  },
  {
    code: "02",
    key: "variantPerception",
    label: "核心预期差",
    placeholder: "尚未被充分定价的结构性变化…",
    starter: "高毛利业务占比提升与长期合约特征正在抬升跨周期盈利中枢，盈利韧性显著强于一致预期。",
  },
  {
    code: "03",
    key: "keyDebate",
    label: "18 个月核心分歧",
    placeholder: "多空双方最关键的验证焦点…",
    starter:
      "核心分歧在于新产能与新产品渗透率能否维持毛利率中枢，未来两季分部毛利与管理层指引将成为关键验证。",
  },
  {
    code: "04",
    key: "preMortem",
    label: "逆向压力推演",
    placeholder: "若出现深度回撤，核心风险传导路径…",
    starter:
      "若 18 个月后出现显著回撤，最可能源于下游资本开支放缓叠加价格竞争，引发盈利预期与估值倍数双重承压。",
  },
];

function QuadrantHeader({
  cfg,
  empty,
  onFill,
}: {
  cfg: VariantFieldConfig;
  empty: boolean;
  onFill: () => void;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <label htmlFor={`vp-${cfg.key}`} className="inline-flex items-center gap-2.5">
        <span className="font-mono text-xs text-ink-muted tabular-nums">{cfg.code}</span>
        <span className="text-sm font-semibold tracking-[-0.01em] text-ink-primary">
          {cfg.label}
        </span>
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 rounded-pill bg-accent-coral opacity-0 transition-opacity duration-200 group-focus-within/cell:opacity-100"
        />
      </label>
      {empty ? (
        <button
          type="button"
          onClick={onFill}
          className="shrink-0 cursor-pointer rounded-badge px-2 py-0.5 text-xs text-ink-muted opacity-0 transition-[opacity,background-color,color] duration-150 ease-[var(--ease-kanon)] hover:bg-muted/80 hover:text-ink-primary focus-visible:opacity-100 group-focus-within/cell:opacity-100 group-hover/cell:opacity-100"
        >
          填充示例
        </button>
      ) : null}
    </div>
  );
}

function EditorialQuadrantCell({
  cfg,
  index,
  value,
  onChange,
}: {
  cfg: VariantFieldConfig;
  index: number;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div
      className={cn(
        "group/cell relative flex flex-col p-6 transition-colors duration-200 ease-[var(--ease-kanon)] focus-within:bg-canvas/45 sm:p-7",
        index % 2 === 1 && "lg:border-l lg:border-hairline",
        index >= 2 && "lg:border-t lg:border-hairline",
      )}
    >
      <QuadrantHeader cfg={cfg} empty={!value.trim()} onFill={() => onChange(cfg.starter)} />
      <Textarea
        id={`vp-${cfg.key}`}
        variant="editorial"
        rows={4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={cfg.placeholder}
        className="min-h-[112px]"
      />
    </div>
  );
}

function CompletionDots({ filter }: { filter: BusinessFilter }) {
  return (
    <div className="flex items-center gap-1.5" aria-hidden="true">
      {BUY_SIDE_FIELDS.map((f) => {
        const filled = filter[f.key].trim().length >= 8;
        return (
          <span
            key={f.key}
            className={cn(
              "h-1.5 w-1.5 rounded-pill transition-colors duration-200",
              filled ? "bg-ink-primary" : "bg-hairline",
            )}
          />
        );
      })}
    </div>
  );
}

export function VariantPerceptionCard({
  filter,
  onPatch,
}: {
  filter: BusinessFilter;
  onPatch: (patch: Partial<BusinessFilter>) => void;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-6 py-4 sm:px-7">
        <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-ink-primary">
          预期差与逆向推演
        </h2>
        <CompletionDots filter={filter} />
      </div>
      <div className="grid grid-cols-1 divide-y divide-hairline lg:grid-cols-2 lg:divide-y-0">
        {BUY_SIDE_FIELDS.map((cfg, idx) => (
          <EditorialQuadrantCell
            key={cfg.key}
            cfg={cfg}
            index={idx}
            value={filter[cfg.key]}
            onChange={(val) => onPatch({ [cfg.key]: val })}
          />
        ))}
      </div>
    </Card>
  );
}
