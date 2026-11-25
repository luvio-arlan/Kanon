"use client";

import { Button, buttonVariants, Card, KanonMark } from "@kanon/ui";
import { IconAlertTriangle, IconHome, IconRefresh } from "@tabler/icons-react";
import Link from "next/link";

export default function AppErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-5 py-12">
      <Card className="w-full max-w-md space-y-5 p-7 shadow-elevated">
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center gap-2 text-ink-primary">
            <KanonMark size={18} accent />
            <span className="text-xs font-semibold tracking-[0.22em]">KANON</span>
          </div>
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-control border border-hairline bg-muted/60 text-accent-coral">
            <IconAlertTriangle size={16} stroke={1.5} />
          </span>
        </div>
        <div className="space-y-1.5">
          <h1 className="text-lg font-semibold tracking-tight text-ink-primary">
            页面加载暂时中断
          </h1>
          <p className="text-sm leading-relaxed text-ink-secondary">
            请重试当前视图，或返回驾驶舱继续投研。您的草稿与档案数据均已安全保留。
          </p>
          {error.digest ? (
            <div className="pt-1 font-mono text-xs text-ink-muted">Ref · {error.digest}</div>
          ) : null}
        </div>
        <div className="flex items-center justify-end gap-2 pt-1">
          <Link href="/" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <IconHome size={15} stroke={1.5} />
            <span>返回驾驶舱</span>
          </Link>
          <Button variant="primary" size="sm" onClick={reset}>
            <IconRefresh size={15} stroke={1.5} />
            <span>重新加载</span>
          </Button>
        </div>
      </Card>
    </main>
  );
}
