"use client";

import { calculateSotpValuation, type SotpSegment, type SotpValuationResult } from "@kanon/core";
import { Badge, Button, Card, Input } from "@kanon/ui";
import { IconArrowDownRight, IconLayersSubtract, IconPlus, IconTrash } from "@tabler/icons-react";
import { DriverNumInput } from "../ev-owner-fcf-card";
import { SotpSecImport } from "./sotp-sec-import";

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
  sharePct: number | null;
  baseValB: number | null;
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
        <span className="font-mono text-xs text-ink-primary tabular-nums">
          {p.baseValB !== null ? `$${p.baseValB}B` : "—"}
        </span>
        <div className="flex items-center gap-1">
          <span className="font-mono text-xs text-ink-muted">
            {p.sharePct !== null ? `${p.sharePct}%` : "—"}
          </span>
          <button
            type="button"
            aria-label={`删除 ${p.seg.name} 分部`}
            onClick={p.onRemove}
            className="cursor-pointer text-ink-muted hover:text-status-fail"
          >
            <IconTrash size={12} stroke={1.5} />
          </button>
        </div>
      </div>
    </div>
  );
}

function SotpHeader(p: { netCashB: number; disc: number; onDisc: (v: number) => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <IconLayersSubtract size={16} stroke={1.5} className="text-ink-muted" />
        <h3 className="text-sm font-semibold text-ink-primary">SOTP 分部加总估值</h3>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="titanium">净现金 ${p.netCashB.toFixed(1)}B</Badge>
        <div className="w-28">
          <DriverNumInput label="控股折价%" value={p.disc} step={1} onChange={p.onDisc} />
        </div>
      </div>
    </div>
  );
}

function SotpFooter(p: {
  res: SotpValuationResult;
  canAdd: boolean;
  onAdd: () => void;
  onApply: () => void;
}) {
  const ready =
    p.res.bearTargetPrice !== null &&
    p.res.baseTargetPrice !== null &&
    p.res.bullTargetPrice !== null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-3.5">
      <div className="flex items-center gap-3">
        {p.canAdd ? (
          <Button variant="outline" size="xs" onClick={p.onAdd}>
            <IconPlus size={13} stroke={1.5} />
            <span>添加分部</span>
          </Button>
        ) : null}
        <span className="font-mono text-xs text-ink-secondary tabular-nums">
          悲观 {p.res.bearTargetPrice !== null ? `$${p.res.bearTargetPrice}` : "—"} · 中性{" "}
          <strong className="text-accent-coral">
            {p.res.baseTargetPrice !== null ? `$${p.res.baseTargetPrice}` : "—"}
          </strong>{" "}
          · 乐观 {p.res.bullTargetPrice !== null ? `$${p.res.bullTargetPrice}` : "—"}
        </span>
      </div>
      <Button variant="primary" size="sm" disabled={!ready} onClick={p.onApply}>
        <IconArrowDownRight size={14} stroke={1.5} />
        <span>按 SOTP 锚定三情景</span>
      </Button>
    </div>
  );
}

interface SotpBuilderProps {
  ticker?: string;
  currentPrice: number;
  horizonYears: number;
  dilutedSharesM: number;
  netCashB: number;
  segments?: SotpSegment[];
  holdingDiscountPct?: number;
  onChange: (next: { sotpSegments: SotpSegment[]; sotpHoldingDiscountPct: number }) => void;
  onApplyTargets: (targets: { bear: number; base: number; bull: number }) => void;
}

function makeEmptySegment(count: number): SotpSegment {
  return {
    id: `seg-${Date.now()}-${count + 1}`,
    name: `业务分部 ${count + 1}`,
    metricLabel: "EBIT",
    metricValueB: null,
    bearMultiple: null,
    baseMultiple: null,
    bullMultiple: null,
  };
}

function SotpEmptyState(p: {
  ticker?: string;
  onAddFirst: () => void;
  onImported: (segments: SotpSegment[]) => void;
}) {
  return (
    <div className="space-y-3 border-t border-hairline pt-4 text-xs text-ink-muted">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span>尚未配置业务分部</span>
        <Button variant="outline" size="xs" onClick={p.onAddFirst}>
          <IconPlus size={13} stroke={1.5} />
          <span>添加分部</span>
        </Button>
      </div>
      {p.ticker ? <SotpSecImport ticker={p.ticker} onImported={p.onImported} /> : null}
    </div>
  );
}

function SotpSegmentsList(p: {
  list: readonly SotpSegment[];
  res: SotpValuationResult;
  onPatchAt: (idx: number, patch: Partial<SotpSegment>) => void;
  onRemoveAt: (idx: number) => void;
  onAdd: () => void;
  onApply: () => void;
}) {
  return (
    <>
      <div className="divide-y divide-hairline">
        {p.list.map((seg, idx) => (
          <SotpSegmentRow
            key={seg.id}
            seg={seg}
            sharePct={p.res.segments[idx]?.baseSharePct ?? null}
            baseValB={p.res.segments[idx]?.baseValueB ?? null}
            onPatch={(patch) => p.onPatchAt(idx, patch)}
            onRemove={() => p.onRemoveAt(idx)}
          />
        ))}
      </div>
      <SotpFooter res={p.res} canAdd={p.list.length < 6} onAdd={p.onAdd} onApply={p.onApply} />
    </>
  );
}

export function SotpBuilderCard(props: SotpBuilderProps) {
  const list = props.segments ?? [];
  const disc = props.holdingDiscountPct ?? 0;
  const res = calculateSotpValuation({ ...props, segments: list, holdingDiscountPct: disc });
  const update = (nextSegs: SotpSegment[], nextDisc = disc) =>
    props.onChange({ sotpSegments: nextSegs, sotpHoldingDiscountPct: nextDisc });
  const apply = () => {
    if (
      res.bearTargetPrice === null ||
      res.baseTargetPrice === null ||
      res.bullTargetPrice === null
    )
      return;
    props.onApplyTargets({
      bear: res.bearTargetPrice,
      base: res.baseTargetPrice,
      bull: res.bullTargetPrice,
    });
  };
  return (
    <Card className="space-y-4 p-5">
      <SotpHeader
        netCashB={props.netCashB}
        disc={disc}
        onDisc={(v) => update(list, Math.max(0, Math.min(40, v)))}
      />
      {list.length === 0 ? (
        <SotpEmptyState
          ticker={props.ticker}
          onAddFirst={() => update([makeEmptySegment(0)])}
          onImported={(segs) => update(segs)}
        />
      ) : (
        <>
          {props.ticker ? (
            <SotpSecImport ticker={props.ticker} onImported={(segs) => update(segs)} />
          ) : null}
          <SotpSegmentsList
            list={list}
            res={res}
            onPatchAt={(idx, p) => update(list.map((s, i) => (i === idx ? { ...s, ...p } : s)))}
            onRemoveAt={(idx) => update(list.filter((_, i) => i !== idx))}
            onAdd={() => update([...list, makeEmptySegment(list.length)])}
            onApply={apply}
          />
        </>
      )}
    </Card>
  );
}
