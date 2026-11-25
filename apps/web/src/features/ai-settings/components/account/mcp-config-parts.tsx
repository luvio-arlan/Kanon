"use client";

import { Button, SettingsSectionLabel } from "@kanon/ui";
import { IconCopy, IconPlugConnected } from "@tabler/icons-react";
import { toast } from "sonner";

export function buildMcpSnippet(origin: string, tokenHint: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        kanon: {
          url: `${origin}/api/mcp`,
          headers: { Authorization: `Bearer ${tokenHint}` },
        },
      },
    },
    null,
    2,
  );
}

async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`已复制 ${label}`);
  } catch (err) {
    void err;
    toast.error("剪贴板不可用，请手动复制");
  }
}

export function NewTokenBanner({ plaintext }: { plaintext: string }) {
  return (
    <div className="space-y-2 rounded-control border border-status-pass/40 bg-status-pass-soft/30 p-3.5">
      <div className="flex items-center justify-between gap-2 text-xs font-medium text-ink-primary">
        <span>新令牌已生成（仅展示这一次，请立即复制保存）</span>
        <Button variant="titanium" size="xs" onClick={() => void copyText(plaintext, "访问令牌")}>
          <IconCopy size={13} stroke={1.5} />
          <span>复制令牌</span>
        </Button>
      </div>
      <code className="block break-all rounded-badge bg-surface px-2.5 py-1.5 font-mono text-xs text-ink-primary">
        {plaintext}
      </code>
    </div>
  );
}

export function McpConfigCard({ snippet }: { snippet: string }) {
  return (
    <div>
      <SettingsSectionLabel>标准 MCP 接入配置</SettingsSectionLabel>
      <div className="space-y-3 rounded-panel border border-hairline bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-primary">
            <IconPlugConnected size={16} stroke={1.5} className="text-accent-coral" />
            <span>适配 Claude Desktop / Cursor / Antigravity</span>
          </span>
          <Button variant="outline" size="xs" onClick={() => void copyText(snippet, "MCP 配置")}>
            <IconCopy size={13} stroke={1.5} />
            <span>复制 JSON</span>
          </Button>
        </div>
        <pre className="overflow-x-auto rounded-control border border-hairline bg-muted/45 p-3 font-mono text-xs leading-relaxed text-ink-secondary">
          {snippet}
        </pre>
      </div>
    </div>
  );
}
