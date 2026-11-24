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
    placeholder: "当前股价与卖方预期正在定价什么叙事？市场最担忧或最乐观的前提是什么？",
    starter: "市场当前按传统周期/单一产品折价估值，核心担忧在于未来 4 季增速放缓与竞争加剧。",
  },
  {
    key: "variantPerception",
    label: "核心预期差",
    en: "Variant Perception",
    placeholder: "我们看到了什么市场尚未充分定价的结构性变化？为什么一致预期会看错？",
    starter: "高毛利结构占比提升与长期锁单特征正在抬升跨周期盈利中枢，盈利韧性显著强于一致预期。",
  },
  {
    key: "keyDebate",
    label: "18 个月核心争论",
    en: "The Key Debate",
    placeholder: "多空双方最核心的 1 个二元分歧是什么？哪项指标在未来 2–4 季会一锤定音？",
    starter:
      "核心争论在于新产能/新产品渗透率能否守住毛利红线，未来 2 季财报分部毛利与指引将揭晓答案。",
  },
  {
    key: "preMortem",
    label: "事前验尸",
    en: "Pre-Mortem",
    placeholder: "假设 18 个月后这笔投资回撤 40%，复盘时最可能的死因链条是什么？",
    starter:
      "若 18 个月后回撤 40%，最可能源于下游资本开支骤停叠加价格战，导致毛利率与估值倍数双击下杀。",
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
    <div className="group space-y-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={`vp-${cfg.key}`} className="flex flex-wrap items-baseline gap-2">
          <span className="text-[15px] font-semibold text-ink-primary">{cfg.label}</span>
          <span className="font-mono text-xs text-ink-muted">{cfg.en}</span>
        </label>
        {!value.trim() ? (
          <button
            type="button"
            onClick={() => onChange(cfg.starter)}
            className="cursor-pointer text-xs text-ink-muted transition-colors hover:text-accent-coral"
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
        className="min-h-[136px]"
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
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-hairline pb-4">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-ink-primary">
            预期差与事前验尸
          </h2>
          <span className="kanon-serif-italic text-xl">IC Framework</span>
        </div>
        <span className="font-mono text-sm text-ink-muted tabular-nums">
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
