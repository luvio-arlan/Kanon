"use client";

import type { ThesisDetail, ValuationCaseResult } from "@kanon/core";
import { Badge, Button, Sheet } from "@kanon/ui";
import { IconArrowUpRight, IconDownload } from "@tabler/icons-react";
import Link from "next/link";

export interface ThesisPreviewSheetProps {
  thesis: ThesisDetail | null;
  onClose: () => void;
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

function HypothesesSection({ thesis }: { thesis: ThesisDetail }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-ink-primary">核心假设与证伪红线</h3>
      <div className="mt-3 space-y-3">
        {thesis.hypotheses.map((item) => (
          <div key={item.id} className="rounded-control border border-hairline bg-surface p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-ink-primary">{item.title}</span>
              <span className="shrink-0 font-mono text-xs text-ink-secondary tabular-nums">
                {item.threshold}
              </span>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-secondary">{item.note}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SheetBody({ thesis }: { thesis: ThesisDetail }) {
  const { valuation } = thesis;
  return (
    <div className="space-y-6">
      <div className="rounded-card bg-titanium-subtle p-4">
        <div className="text-xs font-medium text-ink-muted">核心投资论点</div>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-primary">
          {thesis.convictionSummary}
        </p>
      </div>

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
        <Button asChild variant="primary" size="md">
          <Link href={`/thesis/${thesis.id}`}>
            <span>进入五步画布</span>
            <IconArrowUpRight size={15} stroke={1.5} />
          </Link>
        </Button>
        <a
          href={`/api/export/thesis/${thesis.id}?format=gdoc`}
          className="inline-flex h-9 items-center gap-1.5 rounded-control border border-hairline bg-surface px-3 text-xs font-medium text-ink-secondary hover:border-strong hover:text-ink-primary"
        >
          <IconDownload size={14} stroke={1.5} />
          <span>Google Doc</span>
        </a>
      </div>
      <Button variant="outline" size="md" onClick={onClose}>
        关闭
      </Button>
    </div>
  );
}

export function ThesisPreviewSheet({ thesis, onClose }: ThesisPreviewSheetProps) {
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
      {thesis ? <SheetBody thesis={thesis} /> : null}
    </Sheet>
  );
}
