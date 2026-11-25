"use client";

import { calculateSotpValuation, type SotpSegment, type SotpValuationResult } from "@kanon/core";
import { Badge, Button, Card, Input } from "@kanon/ui";
import { IconArrowDownRight, IconLayersSubtract, IconPlus, IconTrash } from "@tabler/icons-react";
import { DriverNumInput } from "../ev-owner-fcf-card";

function buildDefaultSegments(revenueB: number): SotpSegment[] {
  const half = Math.max(1, Math.round(revenueB * 0.28 * 10) / 10);
  return [
    {
      id: "seg-1",
      name: "核心增长引擎",
      metricLabel: "EBIT",
      metricValueB: half,
      bearMultiple: 18,
      baseMultiple: 24,
      bullMultiple: 30,
    },
    {
      id: "seg-2",
      name: "成熟现金牛业务",
      metricLabel: "EBIT",
      metricValueB: Math.max(1, Math.round(half * 0.7 * 10) / 10),
      bearMultiple: 12,
      baseMultiple: 16,
      bullMultiple: 20,
    },
  ];
}

const SEG_NUM_FIELDS: ReadonlyArray<{
  key: "metricValueB" | "bearMultiple" | "baseMultiple" | "bullMultiple";
  label: (metricLabel: string) => string;
  step: number;
}> = [
  { key: "metricValueB", label: (m) => `${m} ($B)`, step: 0.5 },
  { key: "bearMultiple", label: () => "悲观×", step: 1 },
  { key: "baseMultiple", label: () => "中性×", step: 1 },
  { key: "bullMultiple", label: () => "乐观×", step: 1 },
];

function SotpSegmentRow(p: {
  seg: SotpSegment;
  sharePct: number;
  baseValB: number;
  canRemove: boolean;
  onPatch: (patch: Partial<SotpSegment>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid grid-cols-2 items-end gap-2 py-3 sm:grid-cols-12">
      <div className="col-span-2 space-y-1 sm:col-span-3">
        <span className="text-xs text-ink-muted">业务分部</span>
        <Input
          value={p.seg.name}
          onChange={(e) => p.onPatch({ name: e.target.value })}
          className="h-8 text-xs"
        />
      </div>
      {SEG_NUM_FIELDS.map((f) => (
        <div key={f.key} className="sm:col-span-2">
          <DriverNumInput
            label={f.label(p.seg.metricLabel)}
            value={p.seg[f.key]}
            step={f.step}
            onChange={(val) => p.onPatch({ [f.key]: val })}
          />
        </div>
      ))}
      <div className="flex items-center justify-between sm:col-span-1 sm:flex-col sm:items-end">
        <span className="font-mono text-xs text-ink-primary tabular-nums">${p.baseValB}B</span>
        <div className="flex items-center gap-1">
          <span className="font-mono text-xs text-ink-muted">{p.sharePct}%</span>
          {p.canRemove ? (
            <button
              type="button"
              aria-label={`删除 ${p.seg.name} 分部`}
              onClick={p.onRemove}
              className="cursor-pointer text-ink-muted hover:text-status-fail"
            >
              <IconTrash size={12} stroke={1.5} />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SotpHeader({
  netCashB,
  disc,
  onDisc,
}: {
  netCashB: number;
  disc: number;
  onDisc: (v: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <IconLayersSubtract size={16} stroke={1.5} className="text-ink-muted" />
        <h3 className="text-sm font-semibold text-ink-primary">SOTP 分部加总估值</h3>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="titanium">净现金 ${netCashB.toFixed(1)}B</Badge>
        <div className="w-28">
          <DriverNumInput label="控股折价%" value={disc} step={1} onChange={onDisc} />
        </div>
      </div>
    </div>
  );
}

function SotpFooter({
  res,
  canAdd,
  onAdd,
  onApply,
}: {
  res: SotpValuationResult;
  canAdd: boolean;
  onAdd: () => void;
  onApply: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-3.5">
      <div className="flex items-center gap-3">
        {canAdd ? (
          <Button variant="outline" size="xs" onClick={onAdd}>
            <IconPlus size={13} stroke={1.5} />
            <span>新增分部</span>
          </Button>
        ) : null}
        <span className="font-mono text-xs text-ink-secondary tabular-nums">
          悲观 ${res.bearTargetPrice} · 中性{" "}
          <strong className="text-accent-coral">${res.baseTargetPrice}</strong> · 乐观 $
          {res.bullTargetPrice}
        </span>
      </div>
      <Button variant="primary" size="sm" onClick={onApply}>
        <IconArrowDownRight size={14} stroke={1.5} />
        <span>按 SOTP 锚定三情景</span>
      </Button>
    </div>
  );
}

interface SotpBuilderProps {
  currentPrice: number;
  horizonYears: number;
  dilutedSharesM: number;
  netCashB: number;
  fallbackRevenueB: number;
  segments?: SotpSegment[];
  holdingDiscountPct?: number;
  onChange: (next: { sotpSegments: SotpSegment[]; sotpHoldingDiscountPct: number }) => void;
  onApplyTargets: (targets: { bear: number; base: number; bull: number }) => void;
}

function makeExtraSegment(count: number): SotpSegment {
  return {
    id: `seg-${Date.now()}`,
    name: `业务分部 ${count + 1}`,
    metricLabel: "EBIT",
    metricValueB: 5,
    bearMultiple: 14,
    baseMultiple: 18,
    bullMultiple: 22,
  };
}

export function SotpBuilderCard(props: SotpBuilderProps) {
  const list = props.segments?.length
    ? props.segments
    : buildDefaultSegments(props.fallbackRevenueB);
  const disc = props.holdingDiscountPct ?? 0;
  const res = calculateSotpValuation({ ...props, segments: list, holdingDiscountPct: disc });
  const update = (nextSegs: SotpSegment[], nextDisc = disc) =>
    props.onChange({ sotpSegments: nextSegs, sotpHoldingDiscountPct: nextDisc });

  return (
    <Card className="space-y-4 p-5">
      <SotpHeader
        netCashB={props.netCashB}
        disc={disc}
        onDisc={(v) => update(list, Math.max(0, Math.min(40, v)))}
      />
      <div className="divide-y divide-hairline">
        {list.map((seg, idx) => (
          <SotpSegmentRow
            key={seg.id}
            seg={seg}
            sharePct={res.segments[idx]?.baseSharePct ?? 0}
            baseValB={res.segments[idx]?.baseValueB ?? 0}
            canRemove={list.length > 1}
            onPatch={(p) => update(list.map((s, i) => (i === idx ? { ...s, ...p } : s)))}
            onRemove={() => update(list.filter((_, i) => i !== idx))}
          />
        ))}
      </div>
      <SotpFooter
        res={res}
        canAdd={list.length < 6}
        onAdd={() => update([...list, makeExtraSegment(list.length)])}
        onApply={() =>
          props.onApplyTargets({
            bear: res.bearTargetPrice,
            base: res.baseTargetPrice,
            bull: res.bullTargetPrice,
          })
        }
      />
    </Card>
  );
}
