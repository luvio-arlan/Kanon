"use client";

import type { ApiTokenScope, ApiTokenSummary } from "@kanon/core";
import {
  Badge,
  Button,
  ButtonGroup,
  ButtonGroupItem,
  Input,
  SettingsCard,
  SettingsRow,
  SettingsSectionLabel,
} from "@kanon/ui";
import { IconCopy, IconKey, IconPlugConnected, IconPlus, IconTrash } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { apiCreateApiToken, apiListApiTokens, apiRevokeApiToken } from "../../lib/account-api";

function buildMcpSnippet(origin: string, tokenHint: string): string {
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

function NewTokenBanner({ plaintext }: { plaintext: string }) {
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

function TokenRow({ token, onRevoke }: { token: ApiTokenSummary; onRevoke: (id: string) => void }) {
  const usedLabel = token.lastUsedAt ? `最近调用 ${token.lastUsedAt.slice(0, 10)}` : "尚未调用";
  return (
    <SettingsRow label={token.name} description={`${token.tokenPrefix} · ${usedLabel}`}>
      <div className="flex items-center gap-2">
        <Badge variant="titanium">{token.scope === "read" ? "只读" : "读写"}</Badge>
        <Button variant="ghost" size="xs" onClick={() => onRevoke(token.id)}>
          <IconTrash size={14} stroke={1.5} className="text-status-fail" />
          <span>撤销</span>
        </Button>
      </div>
    </SettingsRow>
  );
}

function McpConfigCard({ snippet }: { snippet: string }) {
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

function useMcpTokensController() {
  const [tokens, setTokens] = useState<ApiTokenSummary[]>([]);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<ApiTokenScope>("read");
  const [creating, setCreating] = useState(false);
  const [freshToken, setFreshToken] = useState<string | null>(null);

  useEffect(() => {
    void apiListApiTokens().then((res) => {
      if (res.ok) setTokens(res.tokens);
    });
  }, []);

  async function create() {
    const clean = name.trim();
    if (clean.length < 2) {
      toast.error("请输入至少 2 个字符的令牌名称");
      return;
    }
    setCreating(true);
    try {
      const res = await apiCreateApiToken({ name: clean, scope, expiresInDays: 90 });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setFreshToken(res.data.plaintextToken);
      setTokens((prev) => [res.data.token, ...prev]);
      setName("");
      toast.success("已创建个人 MCP 访问令牌");
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    const res = await apiRevokeApiToken(id);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setTokens((prev) => prev.filter((t) => t.id !== id));
    toast.success("已撤销该访问令牌");
  }

  return { tokens, name, setName, scope, setScope, creating, freshToken, create, revoke };
}

function CreateTokenBar(p: { ctrl: ReturnType<typeof useMcpTokensController> }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={p.ctrl.name}
        maxLength={40}
        onChange={(e) => p.ctrl.setName(e.target.value)}
        placeholder="令牌用途（如 Antigravity 桌面端）"
        className="min-w-[180px] flex-1"
      />
      <ButtonGroup ariaLabel="访问令牌权限">
        <ButtonGroupItem
          size="sm"
          selected={p.ctrl.scope === "read"}
          onClick={() => p.ctrl.setScope("read")}
        >
          只读
        </ButtonGroupItem>
        <ButtonGroupItem
          size="sm"
          selected={p.ctrl.scope === "read_write"}
          onClick={() => p.ctrl.setScope("read_write")}
        >
          读写
        </ButtonGroupItem>
      </ButtonGroup>
      <Button
        variant="primary"
        size="sm"
        loading={p.ctrl.creating}
        onClick={() => void p.ctrl.create()}
      >
        {!p.ctrl.creating ? <IconPlus size={14} stroke={1.5} /> : null}
        <span>生成令牌</span>
      </Button>
    </div>
  );
}

export function McpTokensPane() {
  const ctrl = useMcpTokensController();
  const origin = typeof window !== "undefined" ? window.location.origin : "https://app.kanon.hk";
  const snippet = buildMcpSnippet(origin, ctrl.freshToken ?? "kanon_pat_YOUR_TOKEN");

  return (
    <div className="space-y-6">
      <McpConfigCard snippet={snippet} />
      <div>
        <SettingsSectionLabel>个人访问令牌（PAT）</SettingsSectionLabel>
        <div className="space-y-3">
          <CreateTokenBar ctrl={ctrl} />
          {ctrl.freshToken ? <NewTokenBanner plaintext={ctrl.freshToken} /> : null}
          <SettingsCard>
            {ctrl.tokens.length === 0 ? (
              <div className="flex items-center gap-2 px-4 py-5 text-xs text-ink-muted">
                <IconKey size={14} stroke={1.5} />
                <span>暂无已创建的访问令牌</span>
              </div>
            ) : (
              ctrl.tokens.map((token) => (
                <TokenRow key={token.id} token={token} onRevoke={(id) => void ctrl.revoke(id)} />
              ))
            )}
          </SettingsCard>
        </div>
      </div>
    </div>
  );
}
