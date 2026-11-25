import { buttonVariants, Card, KanonMark } from "@kanon/ui";
import { IconArrowLeft } from "@tabler/icons-react";
import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-5 py-12">
      <Card className="w-full max-w-md space-y-5 p-7 shadow-elevated">
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center gap-2 text-ink-primary">
            <KanonMark size={18} accent />
            <span className="text-xs font-semibold tracking-[0.22em]">KANON</span>
          </div>
          <span className="font-mono text-xs text-ink-muted">404</span>
        </div>
        <div className="space-y-1.5">
          <h1 className="text-lg font-semibold tracking-tight text-ink-primary">
            未找到对应的研究档案
          </h1>
          <p className="text-sm leading-relaxed text-ink-secondary">
            该链接可能已失效，或标的档案已被移出当前工作空间。
          </p>
        </div>
        <div className="flex justify-end pt-1">
          <Link href="/" className={buttonVariants({ variant: "primary", size: "sm" })}>
            <IconArrowLeft size={15} stroke={1.5} />
            <span>返回全局驾驶舱</span>
          </Link>
        </div>
      </Card>
    </main>
  );
}
