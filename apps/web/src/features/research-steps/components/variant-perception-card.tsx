"use client";

import type { BusinessFilter } from "@kanon/core";
import { Card, Textarea } from "@kanon/ui";

interface VariantFieldConfig {
  key: "consensusView" | "variantPerception" | "keyDebate" | "preMortem";
  label: string;
  en: string;
  placeholder: string;
  starter: string;
}

const BUY_SIDE_FIELDS: readonly VariantFieldConfig[] = [
  {
    key: "consensusView",
    label: "市场一致预期",
    en: "Consensus",
    placeholder: "当前股价与卖方预期正在定价何种叙事？市场最担忧或最乐观的前提是什么？",
    starter: "市场当前按传统周期或单一产品折价估值，核心担忧在于未来 4 季增速放缓与竞争加剧。",
  },
  {
    key: "variantPerception",
    label: "核心预期差",
    en: "Variant Perception",
    placeholder: "市场尚未充分定价的结构性变化是什么？为何一致预期可能出现偏差？",
    starter: "高毛利业务占比提升与长期合约特征正在抬升跨周期盈利中枢，盈利韧性显著强于一致预期。",
  },
  {
    key: "keyDebate",
    label: "18 个月核心分歧",
    en: "Key Debate",
    placeholder: "多空双方最核心的一项二元分歧是什么？哪项指标将在未来 2–4 个季度给出明确验证？",
    starter:
      "核心分歧在于新产能与新产品渗透率能否维持毛利率中枢，未来两季分部毛利与管理层指引将成为关键验证。",
  },
  {
    key: "preMortem",
    label: "逆向压力推演",
    en: "Downside Scenario",
    placeholder: "假设 18 个月后出现 40% 回撤，最核心的风险传导链条是什么？",
    starter:
      "若 18 个月后出现显著回撤，最可能源于下游资本开支放缓叠加价格竞争，引发盈利预期与估值倍数双重承压。",
  },
];

function BuySideFieldBlock({
  cfg,
  value,
  onChange,
}: {
  cfg: VariantFieldConfig;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={`vp-${cfg.key}`} className="flex min-w-0 flex-wrap items-baseline gap-2">
          <span className="text-sm font-semibold text-ink-primary">{cfg.label}</span>
          <span className="text-xs text-ink-muted">{cfg.en}</span>
        </label>
        {!value.trim() ? (
          <button
            type="button"
            onClick={() => onChange(cfg.starter)}
            className="shrink-0 cursor-pointer rounded-badge px-1.5 py-0.5 text-xs text-ink-muted transition-colors duration-150 ease-[var(--ease-kanon)] hover:bg-muted/75 hover:text-ink-primary"
          >
            填充示例
          </button>
        ) : null}
      </div>
      <Textarea
        id={`vp-${cfg.key}`}
        rows={4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={cfg.placeholder}
        className="min-h-[128px]"
      />
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
  const filledCount = BUY_SIDE_FIELDS.filter((f) => filter[f.key].trim().length >= 8).length;

  return (
    <Card className="space-y-6 p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-4">
        <div className="flex flex-wrap items-baseline gap-2.5">
          <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-ink-primary">
            预期差与逆向推演
          </h2>
          <span className="text-xs text-ink-muted">IC Framework</span>
        </div>
        <span className="rounded-badge border border-hairline bg-muted/60 px-2 py-1 font-mono text-xs text-ink-muted tabular-nums">
          已完成 <strong className="font-semibold text-ink-primary">{filledCount}</strong> / 4
        </span>
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {BUY_SIDE_FIELDS.map((cfg) => (
          <BuySideFieldBlock
            key={cfg.key}
            cfg={cfg}
            value={filter[cfg.key]}
            onChange={(val) => onPatch({ [cfg.key]: val })}
          />
        ))}
      </div>
    </Card>
  );
}
