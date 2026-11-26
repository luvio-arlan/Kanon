"use client";

import { Badge, Button, Input } from "@kanon/ui";
import { IconCheck, IconCopy, IconDownload, IconShieldLock } from "@tabler/icons-react";
import { useMemo } from "react";
import { toast } from "sonner";
import { encode as encodeQr } from "uqr";

export function TotpStatusAction({
  enabled,
  onToggleDisable,
  onEnroll,
}: {
  enabled: boolean;
  onToggleDisable: () => void;
  onEnroll: () => void;
}) {
  if (enabled) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="pass">已开启</Badge>
        <Button variant="ghost" size="sm" onClick={onToggleDisable}>
          <span>停用</span>
        </Button>
      </div>
    );
  }
  return (
    <Button variant="outline" size="sm" onClick={onEnroll}>
      <IconShieldLock size={14} stroke={1.5} />
      <span>配置 2FA</span>
    </Button>
  );
}

function TotpQrSvg({ uri }: { uri: string }) {
  const pathData = useMemo(() => {
    const { data, size } = encodeQr(uri, { ecc: "M" });
    const parts: string[] = [];
    for (let y = 0; y < size; y += 1) {
      const row = data[y];
      if (!row) continue;
      for (let x = 0; x < size; x += 1) {
        if (row[x]) parts.push(`M${x + 2},${y + 2}h1v1h-1z`);
      }
    }
    return { d: parts.join(""), viewBox: `0 0 ${size + 4} ${size + 4}` };
  }, [uri]);

  return (
    <svg
      viewBox={pathData.viewBox}
      className="h-32 w-32 shrink-0 rounded-item border border-hairline bg-canvas p-1 text-ink-primary"
      role="img"
      aria-label="两步验证二维码"
    >
      <path d={pathData.d} fill="currentColor" />
    </svg>
  );
}

export function TotpEnrollPanel({
  secret,
  otpauthUri,
  code,
  onCode,
  onConfirm,
}: {
  secret: string;
  otpauthUri: string;
  code: string;
  onCode: (v: string) => void;
  onConfirm: () => void;
}) {
  return (
    <div className="space-y-3 border-t border-hairline px-4 py-3 text-xs">
      <div className="flex flex-wrap items-center gap-4">
        <TotpQrSvg uri={otpauthUri} />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="text-ink-secondary">扫码或手动输入密钥</div>
          <div className="flex items-center gap-2">
            <code className="break-all font-mono text-ink-primary">{secret}</code>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(secret);
                toast.success("已复制密钥");
              }}
            >
              <IconCopy size={13} stroke={1.5} />
            </Button>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Input
              value={code}
              onChange={(e) => onCode(e.target.value)}
              placeholder="6 位验证码"
              className="w-36"
            />
            <Button variant="primary" size="sm" onClick={onConfirm}>
              <span>验证并启用</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function downloadRecoveryTxt(codes: readonly string[]) {
  const blob = new Blob([`${codes.join("\n")}\n`], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "kanon-2fa-recovery-codes.txt";
  a.click();
  URL.revokeObjectURL(url);
}

export function TotpRecoveryCodesPanel({
  codes,
  onAcknowledge,
}: {
  codes: readonly string[];
  onAcknowledge: () => void;
}) {
  return (
    <div className="space-y-3 border-t border-hairline bg-canvas/50 px-4 py-3 text-xs">
      <div className="font-medium text-ink-primary">请妥善保存以下一次性恢复码（仅展示一次）</div>
      <div className="grid grid-cols-2 gap-1.5 font-mono text-ink-primary sm:grid-cols-4">
        {codes.map((c) => (
          <span
            key={c}
            className="rounded-item border border-hairline bg-surface px-2 py-1 text-center"
          >
            {c}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void navigator.clipboard.writeText(codes.join("\n"));
            toast.success("已复制恢复码");
          }}
        >
          <IconCopy size={13} stroke={1.5} />
          <span>复制</span>
        </Button>
        <Button variant="outline" size="sm" onClick={() => downloadRecoveryTxt(codes)}>
          <IconDownload size={13} stroke={1.5} />
          <span>下载 .txt</span>
        </Button>
        <Button variant="primary" size="sm" onClick={onAcknowledge}>
          <IconCheck size={13} stroke={1.5} />
          <span>我已保存</span>
        </Button>
      </div>
    </div>
  );
}

export function TotpDisableRow({
  code,
  onCode,
  onDisable,
  onCancel,
}: {
  code: string;
  onCode: (v: string) => void;
  onDisable: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-hairline px-4 py-3 text-xs">
      <Input
        value={code}
        onChange={(e) => onCode(e.target.value)}
        placeholder="输入 6 位验证码或恢复码"
        className="w-48"
      />
      <Button variant="outline" size="sm" onClick={onDisable}>
        <span>确认停用</span>
      </Button>
      <Button variant="ghost" size="sm" onClick={onCancel}>
        <span>取消</span>
      </Button>
    </div>
  );
}
