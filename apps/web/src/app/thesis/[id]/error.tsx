"use client";

import { Button, buttonVariants, Card } from "@kanon/ui";
import { IconAlertTriangle, IconArrowLeft, IconRefresh } from "@tabler/icons-react";
import Link from "next/link";

export default function ThesisErrorBoundary({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-5 py-12">
      <Card className="w-full max-w-md space-y-5 p-7 shadow-elevated">
        <div className="flex items-center gap-2.5 text-accent-coral">
          <IconAlertTriangle size={18} stroke={1.5} />
          <span className="font-mono text-xs tracking-[0.14em] text-ink-muted">
            CANVAS RECOVERY
          </span>
        </div>
        <div className="space-y-1.5">
          <h1 className="text-lg font-semibold text-ink-primary">研究画布渲染中断</h1>
          <p className="text-sm leading-relaxed text-ink-secondary">
            本机未保存草稿已自动留存，可直接重载当前标的画布或返回驾驶舱。
          </p>
        </div>
        <div className="flex items-center justify-end gap-2">
          <Link href="/" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <IconArrowLeft size={15} stroke={1.5} />
            <span>返回驾驶舱</span>
          </Link>
          <Button variant="primary" size="sm" onClick={reset}>
            <IconRefresh size={15} stroke={1.5} />
            <span>恢复画布</span>
          </Button>
        </div>
      </Card>
    </main>
  );
}
