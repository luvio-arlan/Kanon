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
import { IconKey, IconPlus, IconTrash } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { apiCreateApiToken, apiListApiTokens, apiRevokeApiToken } from "../../lib/account-api";
import { buildMcpSnippet, McpConfigCard, NewTokenBanner } from "./mcp-config-parts";

function TokenRow({
  token,
  revoking,
  onRevoke,
}: {
  token: ApiTokenSummary;
  revoking: boolean;
  onRevoke: (id: string) => void;
}) {
  const usedLabel = token.lastUsedAt ? `最近调用 ${token.lastUsedAt.slice(0, 10)}` : "尚未调用";
  return (
    <SettingsRow label={token.name} description={`${token.tokenPrefix} · ${usedLabel}`}>
      <div className="flex items-center gap-2">
        <Badge variant="titanium">{token.scope === "read" ? "只读" : "读写"}</Badge>
        <Button variant="ghost" size="xs" disabled={revoking} onClick={() => onRevoke(token.id)}>
          <IconTrash size={14} stroke={1.5} className="text-status-fail" />
          <span>{revoking ? "撤销中" : "撤销"}</span>
        </Button>
      </div>
    </SettingsRow>
  );
}

function useTokensQuery() {
  const [tokens, setTokens] = useState<ApiTokenSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const reload = async () => {
    setLoading(true);
    setLoadError(false);
    const res = await apiListApiTokens();
    if (res.ok) setTokens(res.tokens);
    else setLoadError(true);
    setLoading(false);
  };

  useEffect(() => {
    let active = true;
    void apiListApiTokens().then((res) => {
      if (!active) return;
      if (res.ok) setTokens(res.tokens);
      else setLoadError(true);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  return { tokens, setTokens, loading, loadError, retry: () => void reload() };
}

function useMcpTokensController() {
  const q = useTokensQuery();
  const [name, setName] = useState("");
  const [scope, setScope] = useState<ApiTokenScope>("read");
  const [creating, setCreating] = useState(false);
  const [revokingIds, setRevokingIds] = useState<string[]>([]);
  const [freshToken, setFreshToken] = useState<string | null>(null);

  async function create() {
    const clean = name.trim();
    if (clean.length < 2) return void toast.error("请输入至少 2 个字符的令牌名称");
    setCreating(true);
    try {
      const res = await apiCreateApiToken({ name: clean, scope, expiresInDays: 90 });
      if (!res.ok) return void toast.error(res.error);
      setFreshToken(res.data.plaintextToken);
      q.setTokens((prev) => [res.data.token, ...prev]);
      setName("");
      toast.success("已创建个人 MCP 访问令牌");
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    if (revokingIds.includes(id)) return;
    setRevokingIds((prev) => [...prev, id]);
    try {
      const res = await apiRevokeApiToken(id);
      if (!res.ok) return void toast.error(res.error);
      q.setTokens((prev) => prev.filter((t) => t.id !== id));
      toast.success("已撤销该访问令牌");
    } finally {
      setRevokingIds((prev) => prev.filter((item) => item !== id));
    }
  }

  return {
    ...q,
    revokingIds,
    name,
    setName,
    scope,
    setScope,
    creating,
    freshToken,
    create,
    revoke,
  };
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

function TokenListCard({ ctrl }: { ctrl: ReturnType<typeof useMcpTokensController> }) {
  if (ctrl.loading) {
    return <div className="px-4 py-5 text-xs text-ink-muted">正在读取访问令牌…</div>;
  }
  if (ctrl.loadError) {
    return (
      <div className="flex items-center justify-between gap-2 px-4 py-4 text-xs text-ink-muted">
        <span>访问令牌读取失败</span>
        <Button variant="outline" size="xs" onClick={ctrl.retry}>
          重试
        </Button>
      </div>
    );
  }
  if (ctrl.tokens.length === 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-5 text-xs text-ink-muted">
        <IconKey size={14} stroke={1.5} />
        <span>暂无已创建的访问令牌</span>
      </div>
    );
  }
  return ctrl.tokens.map((token) => (
    <TokenRow
      key={token.id}
      token={token}
      revoking={ctrl.revokingIds.includes(token.id)}
      onRevoke={(id) => void ctrl.revoke(id)}
    />
  ));
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
            <TokenListCard ctrl={ctrl} />
          </SettingsCard>
        </div>
      </div>
    </div>
  );
}
