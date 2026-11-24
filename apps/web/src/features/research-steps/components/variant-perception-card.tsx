"use client";

import type { BusinessFilter } from "@kanon/core";
import { Badge, Card, Textarea } from "@kanon/ui";
import { IconCompass } from "@tabler/icons-react";

interface VariantFieldConfig {
  key: "consensusView" | "variantPerception" | "keyDebate" | "preMortem";
  label: string;
  badge: string;
  placeholder: string;
  starter: string;
}

const BUY_SIDE_FIELDS: readonly VariantFieldConfig[] = [
  {
    key: "consensusView",
    label: "市场一致预期（Consensus）",
    badge: "共识定价",
    placeholder: "当前股价和卖方一致预期正在定价什么叙事？市场最担心或最乐观的假设是什么？",
    starter: "市场当前按传统周期/单一产品折价估值，核心担忧在于未来 4 季增速放缓与竞争加剧。",
  },
  {
    key: "variantPerception",
    label: "我的核心预期差（Variant Perception）",
    badge: "超额底气",
    placeholder: "我们看到了什么市场尚未充分定价的结构性变化？为什么市场会看错？",
    starter: "高毛利结构占比提升与长期锁单特征正在抬升跨周期盈利中枢，盈利韧性显著强于一致预期。",
  },
  {
    key: "keyDebate",
    label: "未来 18 个月核心争论（The Key Debate）",
    badge: "胜负手",
    placeholder: "多空双方最核心的 1 个二元分歧是什么？哪项指标在未来 2–4 季会一锤定音？",
    starter:
      "核心争论在于新产能/新产品渗透率能否守住毛利红线，未来 2 季财报分部毛利与指引将揭晓答案。",
  },
  {
    key: "preMortem",
    label: "事前验尸（Pre-Mortem · 反演风控）",
    badge: "反演假设",
    placeholder: "假设 18 个月后这笔投资亏了 40%，复盘时最可能的死因链条是什么？",
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
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={`vp-${cfg.key}`} className="text-xs font-semibold text-ink-primary">
          {cfg.label}
        </label>
        <div className="flex items-center gap-2">
          {!value.trim() ? (
            <button
              type="button"
              onClick={() => onChange(cfg.starter)}
              className="cursor-pointer text-xs text-accent-coral transition-opacity hover:opacity-80"
            >
              填入买方句式参考
            </button>
          ) : null}
          <Badge variant="default">{cfg.badge}</Badge>
        </div>
      </div>
      <Textarea
        id={`vp-${cfg.key}`}
        rows={4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={cfg.placeholder}
        className="min-h-[104px]"
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
    <Card className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline pb-4">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-control bg-titanium-subtle text-ink-primary">
            <IconCompass size={15} stroke={1.5} />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-ink-primary">
              买方深度引导 · 预期差、核心争论与事前验尸
            </h3>
            <p className="mt-0.5 text-xs text-ink-secondary">
              对标顶级买方投委会（IC）框架：先明确「市场错了哪、胜负手是什么、最坏怎么死」，再建立仓位底气
            </p>
          </div>
        </div>
        <Badge variant={filledCount === 4 ? "pass" : "titanium"} className="font-mono tabular-nums">
          已完成 {filledCount}/4
        </Badge>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
