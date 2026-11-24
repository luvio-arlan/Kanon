"use client";

import {
  calculateImpliedExpectations,
  type ThesisDetail,
  type ValuationCaseResult,
} from "@kanon/core";
import { Badge, Button, buttonVariants, Input, Sheet } from "@kanon/ui";
import { IconArrowUpRight, IconCheck, IconDownload } from "@tabler/icons-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PositionEditorPanel } from "@/features/portfolio";
import { apiCalibratePriceAnchor } from "../lib/cockpit-api";

export interface ThesisPreviewSheetProps {
  thesis: ThesisDetail | null;
  onClose: () => void;
  onUpdated: (updated: ThesisDetail) => void;
}

function ScenarioRow({ label, data }: { label: string; data: ValuationCaseResult }) {
  const sign = data.returnPct > 0 ? "+" : "";
  return (
    <div className="grid grid-cols-4 items-center py-2.5 font-mono text-sm tabular-nums">
      <span className="font-sans font-medium text-ink-primary">{label}</span>
      <span className="text-ink-secondary">
        ${data.eps} × {data.peMultiple}x
      </span>
      <span className="text-right font-semibold text-ink-primary">
        ${data.targetPrice.toFixed(2)}
      </span>
      <span className="text-right text-xs text-ink-secondary">
        {sign}
        {data.cagrPct.toFixed(1)}% / 年
      </span>
    </div>
  );
}

function QuickPriceCalibrator({
  thesis,
  onUpdated,
}: {
  thesis: ThesisDetail;
  onUpdated: (updated: ThesisDetail) => void;
}) {
  const [priceText, setPriceText] = useState(String(thesis.currentPrice));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPriceText(String(thesis.currentPrice));
  }, [thesis.currentPrice]);

  async function handleCalibrate() {
    const numeric = Number(priceText);
    if (!Number.isFinite(numeric) || numeric <= 0) return;
    setSaving(true);
    const updated = await apiCalibratePriceAnchor(thesis.id, numeric).finally(() =>
      setSaving(false),
    );
    if (updated) onUpdated(updated);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-hairline bg-surface p-4">
      <div>
        <div className="text-xs font-semibold text-ink-primary">快速校准当前参考价</div>
        <div className="mt-0.5 text-xs text-ink-muted">重算赔率并写入版本演进记录</div>
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={0.5}
          step={0.5}
          value={priceText}
          onChange={(e) => setPriceText(e.target.value)}
          aria-label="校准当前参考价"
          className="h-8 w-24 font-mono text-xs tabular-nums"
        />
        <Button variant="titanium" size="sm" disabled={saving} onClick={handleCalibrate}>
          <IconCheck size={14} stroke={1.5} />
          <span>{saving ? "保存中" : "校准"}</span>
        </Button>
      </div>
    </div>
  );
}

function ExpectationsStrip({ thesis }: { thesis: ThesisDetail }) {
  const exp = calculateImpliedExpectations({ summary: thesis.valuation });
  return (
    <div className="grid grid-cols-3 divide-x divide-hairline rounded-control border border-hairline bg-muted/45 text-center font-mono tabular-nums">
      <div className="px-2.5 py-2.5">
        <div className="font-sans text-xs text-ink-muted">安全边际</div>
        <div className="mt-0.5 text-sm font-semibold text-ink-primary">
          {exp.marginOfSafetyPct.toFixed(1)}%
        </div>
      </div>
      <div className="px-2.5 py-2.5">
        <div className="font-sans text-xs text-ink-muted">15% 买点</div>
        <div className="mt-0.5 text-sm font-semibold text-status-pass">
          ${exp.hurdleEntry15.toFixed(1)}
        </div>
      </div>
      <div className="px-2.5 py-2.5">
        <div className="font-sans text-xs text-ink-muted">20% 买点</div>
        <div className="mt-0.5 text-sm font-semibold text-ink-primary">
          ${exp.hurdleEntry20.toFixed(1)}
        </div>
      </div>
    </div>
  );
}

function HypothesesSection({ thesis }: { thesis: ThesisDetail }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-ink-primary">核心假设与证伪红线</h3>
      <div className="mt-3 space-y-2.5">
        {thesis.hypotheses.map((item) => (
          <div key={item.id} className="rounded-control border border-hairline bg-surface p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-ink-primary">{item.title}</span>
              <span className="shrink-0 font-mono text-xs text-ink-secondary tabular-nums">
                {item.threshold}
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-ink-secondary">{item.note}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SheetBody({
  thesis,
  onUpdated,
}: {
  thesis: ThesisDetail;
  onUpdated: (updated: ThesisDetail) => void;
}) {
  const { valuation } = thesis;
  return (
    <div className="space-y-5">
      <div className="rounded-card bg-titanium-subtle p-4">
        <div className="text-xs font-medium text-ink-muted">核心投资论点</div>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-primary">
          {thesis.convictionSummary}
        </p>
      </div>
      <QuickPriceCalibrator thesis={thesis} onUpdated={onUpdated} />
      <PositionEditorPanel thesis={thesis} onUpdated={onUpdated} />
      <ExpectationsStrip thesis={thesis} />
      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink-primary">
            三情景估值赔率表（{thesis.horizonYears} 年）
          </h3>
          <Badge variant="titanium" className="font-mono tabular-nums">
            期望目标价 ${valuation.expectedTargetPrice.toFixed(2)}
          </Badge>
        </div>
        <div className="mt-3 divide-y divide-hairline border-y border-hairline">
          <ScenarioRow label="悲观" data={valuation.bear} />
          <ScenarioRow label="中性" data={valuation.base} />
          <ScenarioRow label="乐观" data={valuation.bull} />
        </div>
      </div>
      <HypothesesSection thesis={thesis} />
    </div>
  );
}

function SheetFooterActions({ thesis, onClose }: { thesis: ThesisDetail; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Link
          href={`/thesis/${thesis.id}`}
          className={buttonVariants({ variant: "primary", size: "md" })}
        >
          <span>进入五步画布</span>
          <IconArrowUpRight size={15} stroke={1.5} />
        </Link>
        <a
          href={`/api/export/thesis/${thesis.id}?format=gdoc`}
          className="inline-flex h-9 items-center gap-1.5 rounded-control border border-hairline bg-surface px-3 text-xs font-medium text-ink-secondary hover:border-strong hover:text-ink-primary"
        >
          <IconDownload size={14} stroke={1.5} />
          <span>研报</span>
        </a>
        <a
          href={`/api/export/thesis/${thesis.id}?format=json`}
          className="inline-flex h-9 items-center gap-1 rounded-control border border-hairline bg-surface px-2.5 font-mono text-xs text-ink-muted hover:border-strong hover:text-ink-primary"
        >
          JSON
        </a>
      </div>
      <Button variant="outline" size="md" onClick={onClose}>
        关闭
      </Button>
    </div>
  );
}

export function ThesisPreviewSheet({ thesis, onClose, onUpdated }: ThesisPreviewSheetProps) {
  return (
    <Sheet
      open={thesis !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={thesis ? `${thesis.companyName} · ${thesis.ticker}` : ""}
      subtitle={thesis ? `${thesis.sectorTag} · 当前参考价 $${thesis.currentPrice.toFixed(2)}` : ""}
      footer={thesis ? <SheetFooterActions thesis={thesis} onClose={onClose} /> : undefined}
    >
      {thesis ? <SheetBody thesis={thesis} onUpdated={onUpdated} /> : null}
    </Sheet>
  );
}
