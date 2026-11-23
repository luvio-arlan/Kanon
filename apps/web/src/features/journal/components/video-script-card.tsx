"use client";

import type { VideoScript } from "@kanon/ai";
import { Button, Card } from "@kanon/ui";
import { IconCopy, IconDownload, IconMicrophone } from "@tabler/icons-react";
import { toast } from "sonner";

export interface VideoScriptCardProps {
  thesisId: string;
  script: VideoScript | null;
  loading: boolean;
  onGenerate: () => Promise<void>;
}

function formatScriptClipboard(script: VideoScript): string {
  return [
    `【标题】${script.title}`,
    `\n【开场钩子】\n${script.hook}`,
    `\n【商业模式对比】\n${script.businessContrast}`,
    `\n【一阶数据证据】\n${script.firstPrinciplesEvidence.map((e, i) => `${i + 1}. ${e}`).join("\n")}`,
    `\n【风险提示与认错红线】\n${script.riskDisclosure}`,
    `\n【结尾】${script.closingLine}`,
  ].join("\n");
}

function ScriptPreviewBox({ script }: { script: VideoScript }) {
  async function handleCopy() {
    await navigator.clipboard.writeText(formatScriptClipboard(script));
    toast.success("口播大纲已复制到剪贴板");
  }

  return (
    <div className="mt-5 space-y-3 rounded-card border border-hairline bg-surface p-5 text-sm">
      <div className="flex items-start justify-between gap-3">
        <h4 className="font-semibold text-ink-primary">{script.title}</h4>
        <Button variant="outline" size="sm" onClick={handleCopy}>
          <IconCopy size={14} stroke={1.5} />
          <span>复制脚本</span>
        </Button>
      </div>
      <p className="text-ink-secondary">
        <strong className="text-ink-primary">钩子：</strong>
        {script.hook}
      </p>
      <p className="text-ink-secondary">
        <strong className="text-ink-primary">商业模式：</strong>
        {script.businessContrast}
      </p>
      <ul className="list-disc space-y-1 pl-5 text-ink-secondary">
        {script.firstPrinciplesEvidence.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p className="text-xs text-ink-muted">{script.riskDisclosure}</p>
    </div>
  );
}

export function VideoScriptCard({ thesisId, script, loading, onGenerate }: VideoScriptCardProps) {
  return (
    <Card tone="titanium" className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-ink-primary">内容沉淀 · 一键转口播大纲</h3>
          <p className="mt-0.5 text-xs text-ink-secondary">
            将 5 步研究画布提炼为结构化视频脚本，或导出 Google Doc 长期归档
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="primary" size="sm" disabled={loading} onClick={onGenerate}>
            <IconMicrophone size={15} stroke={1.5} />
            <span>{loading ? "提炼中..." : script ? "重新提炼口播稿" : "一键转口播大纲"}</span>
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
      {script ? <ScriptPreviewBox script={script} /> : null}
    </Card>
  );
}
