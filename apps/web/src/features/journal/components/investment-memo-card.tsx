"use client";

import type { InvestmentMemo } from "@kanon/ai";
import { Button, Card } from "@kanon/ui";
import { IconCopy, IconDownload, IconFileText } from "@tabler/icons-react";
import { toast } from "sonner";

export interface InvestmentMemoCardProps {
  thesisId: string;
  memo: InvestmentMemo | null;
  loading: boolean;
  onGenerate: () => Promise<void>;
}

function formatMemoClipboard(memo: InvestmentMemo): string {
  return [
    `# ${memo.headline}`,
    `\n【核心估值与赔率结论】\n${memo.verdictSummary}`,
    `\n【护城河与商业质量】\n${memo.moatAndQuality}`,
    `\n【一阶关键证据】\n${memo.keyEvidence.map((e, i) => `${i + 1}. ${e}`).join("\n")}`,
    `\n【下季财报复盘必查清单】\n${memo.nextQuarterChecklist.map((c, i) => `${i + 1}. ${c}`).join("\n")}`,
    `\n【交易铁律与认错红线】\n${memo.exitDiscipline}`,
  ].join("\n");
}

function MemoPreviewBox({ memo }: { memo: InvestmentMemo }) {
  async function handleCopy() {
    await navigator.clipboard.writeText(formatMemoClipboard(memo));
    toast.success("一页纸投研备忘录已复制到剪贴板");
  }

  return (
    <div className="mt-5 space-y-4 rounded-card border border-hairline bg-surface p-5 text-sm">
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-base font-semibold text-ink-primary">{memo.headline}</h4>
        <Button variant="outline" size="sm" onClick={handleCopy}>
          <IconCopy size={14} stroke={1.5} />
          <span>复制备忘录</span>
        </Button>
      </div>
      <p className="leading-relaxed text-ink-primary">{memo.verdictSummary}</p>
      <p className="leading-relaxed text-ink-secondary">{memo.moatAndQuality}</p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-control bg-muted/60 p-4">
          <div className="text-xs font-semibold text-ink-primary">一阶事实与核心证据</div>
          <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-ink-secondary">
            {memo.keyEvidence.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-control bg-muted/60 p-4">
          <div className="text-xs font-semibold text-ink-primary">下季财报复盘必查清单</div>
          <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-ink-secondary">
            {memo.nextQuarterChecklist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="rounded-control border border-hairline bg-titanium-subtle/60 px-4 py-3 text-xs text-ink-primary">
        <span className="font-semibold">认错离场纪律：</span>
        {memo.exitDiscipline}
      </div>
    </div>
  );
}

export function InvestmentMemoCard({
  thesisId,
  memo,
  loading,
  onGenerate,
}: InvestmentMemoCardProps) {
  return (
    <Card tone="titanium" className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-ink-primary">
            研究记忆沉淀 · 一页纸投研备忘录
          </h3>
          <p className="mt-0.5 text-xs text-ink-secondary">
            凝练 5 步深度研究为投委会级复盘备忘录，持久留存并在下季财报时逐项对照
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="primary" size="sm" disabled={loading} onClick={onGenerate}>
            <IconFileText size={15} stroke={1.5} />
            <span>{loading ? "凝练中..." : memo ? "刷新投研备忘录" : "生成一页纸备忘录"}</span>
          </Button>
          <a
            href={`/api/export/thesis/${thesisId}?format=gdoc`}
            className="inline-flex h-8 items-center gap-1.5 rounded-control border border-hairline bg-surface px-3 text-xs font-medium text-ink-primary shadow-card transition-colors hover:border-strong"
          >
            <IconDownload size={14} stroke={1.5} />
            <span>导出 Google Doc</span>
          </a>
        </div>
      </div>
      {memo ? <MemoPreviewBox memo={memo} /> : null}
    </Card>
  );
}
