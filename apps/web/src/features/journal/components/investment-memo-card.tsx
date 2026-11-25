"use client";

import type { InvestmentMemo } from "@kanon/ai";
import { AgentThinking, Button, Card, ComposerLoader } from "@kanon/ui";
import { IconCopy, IconFileText, IconPrinter, IconRefresh } from "@tabler/icons-react";
import { toast } from "sonner";

export interface InvestmentMemoCardProps {
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
    `\n【交易纪律与离场条件】\n${memo.exitDiscipline}`,
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
        <h4 className="text-xl font-semibold tracking-tight text-ink-primary">{memo.headline}</h4>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-primary">{memo.verdictSummary}</p>
        <p className="mt-2.5 text-[15px] leading-relaxed text-ink-secondary">
          {memo.moatAndQuality}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-6 border-t border-hairline pt-6 md:grid-cols-2">
        <MemoBulletColumn title="一阶事实与核心证据" items={memo.keyEvidence} />
        <MemoBulletColumn title="下季财报复盘必查清单" items={memo.nextQuarterChecklist} />
      </div>
      <div className="border-t border-hairline pt-5 text-[15px] leading-relaxed text-ink-primary">
        <span className="font-medium text-ink-muted">离场执行纪律：</span>
        {memo.exitDiscipline}
      </div>
      <div className="print-only border-t border-hairline pt-4 font-mono text-xs text-ink-muted">
        零杠杆风控原则确认 · 决策留痕归档 ({new Date().toISOString().slice(0, 10)})
      </div>
    </article>
  );
}

function MemoActionButtons(props: {
  hasMemo: boolean;
  loading: boolean;
  onCopy: () => void;
  onGenerate: () => Promise<void>;
}) {
  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      {props.hasMemo ? (
        <>
          <Button variant="outline" size="sm" onClick={props.onCopy}>
            <IconCopy size={15} stroke={1.5} />
            <span>复制全文</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <IconPrinter size={15} stroke={1.5} />
            <span>打印 PDF</span>
          </Button>
        </>
      ) : null}
      <Button variant="primary" size="sm" disabled={props.loading} onClick={props.onGenerate}>
        {props.hasMemo ? (
          <IconRefresh size={15} stroke={1.5} />
        ) : (
          <IconFileText size={15} stroke={1.5} />
        )}
        <span>
          {props.loading ? "凝练中..." : props.hasMemo ? "刷新备忘录" : "生成一页纸备忘录"}
        </span>
      </Button>
    </div>
  );
}

export function InvestmentMemoCard({ memo, loading, onGenerate }: InvestmentMemoCardProps) {
  async function handleCopy() {
    if (!memo) return;
    await navigator.clipboard.writeText(formatMemoClipboard(memo));
    toast.success("一页纸投研备忘录已复制到剪贴板");
  }

  return (
    <Card className="p-6 sm:p-8">
      <div className="print-only mb-4 flex items-center justify-between border-b border-hairline pb-2 font-mono text-xs tracking-wider text-ink-muted">
        <span>KANON · IC RESEARCH MEMORANDUM</span>
        <span>{new Date().toISOString().slice(0, 10)}</span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-ink-primary">投研备忘录</h3>
        <MemoActionButtons
          hasMemo={Boolean(memo)}
          loading={loading}
          onCopy={handleCopy}
          onGenerate={onGenerate}
        />
      </div>
      {loading ? (
        <ComposerLoader active radius={16} className="mt-5">
          <div className="flex items-center justify-center rounded-card border border-hairline bg-muted/45 px-5 py-8">
            <AgentThinking variant="infinity" label="正在基于前 4 步一阶档案凝练 IC 投研备忘录" />
          </div>
        </ComposerLoader>
      ) : memo ? (
        <MemoArticleBody memo={memo} />
      ) : (
        <div className="mt-6 border-t border-hairline pb-4 pt-8 text-center text-sm text-ink-muted">
          尚未生成投研备忘录
        </div>
      )}
    </Card>
  );
}
