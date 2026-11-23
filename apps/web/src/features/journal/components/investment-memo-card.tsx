"use client";

import type { InvestmentMemo } from "@kanon/ai";
import { Button, Card } from "@kanon/ui";
import { IconCopy, IconDownload, IconFileText, IconRefresh } from "@tabler/icons-react";
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

function MemoBulletColumn({ title, items }: { title: string; items: readonly string[] }) {
  return (
    <div>
      <div className="text-xs font-semibold tracking-wide text-ink-muted">{title}</div>
      <ul className="mt-2.5 space-y-2 text-sm leading-relaxed text-ink-secondary">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-pill bg-ink-muted" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MemoArticleBody({ memo }: { memo: InvestmentMemo }) {
  return (
    <article className="mt-6 space-y-6 border-t border-hairline pt-6">
      <div>
        <h4 className="text-lg font-semibold tracking-tight text-ink-primary">{memo.headline}</h4>
        <p className="mt-3 text-sm leading-relaxed text-ink-primary">{memo.verdictSummary}</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{memo.moatAndQuality}</p>
      </div>
      <div className="grid grid-cols-1 gap-6 border-t border-hairline pt-6 md:grid-cols-2">
        <MemoBulletColumn title="一阶事实与核心证据" items={memo.keyEvidence} />
        <MemoBulletColumn title="下季财报复盘必查清单" items={memo.nextQuarterChecklist} />
      </div>
      <div className="border-t border-hairline pt-5 text-sm leading-relaxed text-ink-primary">
        <span className="font-medium text-ink-muted">认错离场纪律：</span>
        {memo.exitDiscipline}
      </div>
    </article>
  );
}

function MemoActionButtons(props: {
  thesisId: string;
  hasMemo: boolean;
  loading: boolean;
  onCopy: () => void;
  onGenerate: () => Promise<void>;
}) {
  return (
    <div className="flex items-center gap-2">
      {props.hasMemo ? (
        <Button variant="ghost" size="sm" onClick={props.onCopy}>
          <IconCopy size={14} stroke={1.5} />
          <span>复制</span>
        </Button>
      ) : null}
      <a
        href={`/api/export/thesis/${props.thesisId}?format=gdoc`}
        className="inline-flex h-8 items-center gap-1.5 rounded-control border border-hairline bg-surface px-3 text-xs font-medium text-ink-secondary transition-colors hover:border-strong hover:text-ink-primary"
      >
        <IconDownload size={14} stroke={1.5} />
        <span>Google Doc</span>
      </a>
      <Button variant="primary" size="sm" disabled={props.loading} onClick={props.onGenerate}>
        {props.hasMemo ? (
          <IconRefresh size={14} stroke={1.5} />
        ) : (
          <IconFileText size={14} stroke={1.5} />
        )}
        <span>
          {props.loading ? "凝练中..." : props.hasMemo ? "刷新备忘录" : "生成一页纸备忘录"}
        </span>
      </Button>
    </div>
  );
}

export function InvestmentMemoCard({
  thesisId,
  memo,
  loading,
  onGenerate,
}: InvestmentMemoCardProps) {
  async function handleCopy() {
    if (!memo) return;
    await navigator.clipboard.writeText(formatMemoClipboard(memo));
    toast.success("一页纸投研备忘录已复制到剪贴板");
  }

  return (
    <Card className="p-6 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-ink-primary">一页纸投研备忘录（IC Memo）</h3>
          <p className="mt-0.5 text-xs text-ink-muted">
            将五步研究凝练为可跨季度回看的投委会归档文档
          </p>
        </div>
        <MemoActionButtons
          thesisId={thesisId}
          hasMemo={Boolean(memo)}
          loading={loading}
          onCopy={handleCopy}
          onGenerate={onGenerate}
        />
      </div>
      {memo ? (
        <MemoArticleBody memo={memo} />
      ) : (
        <div className="mt-6 border-t border-hairline pt-8 pb-4 text-center text-sm text-ink-muted">
          尚未生成投研备忘录。点击右上角按钮，基于前 4 步一阶档案一键凝练并落库。
        </div>
      )}
    </Card>
  );
}
