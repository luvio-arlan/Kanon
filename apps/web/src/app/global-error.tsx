"use client";

export default function GlobalErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body className="flex min-h-dvh items-center justify-center bg-canvas px-5 py-12 text-ink-primary antialiased">
        <div className="w-full max-w-md space-y-4 rounded-card border border-hairline bg-surface p-7 shadow-elevated">
          <div className="font-mono text-xs tracking-[0.2em] text-ink-muted">KANON</div>
          <h1 className="text-lg font-semibold text-ink-primary">工作台服务暂时不可用</h1>
          <p className="text-sm leading-relaxed text-ink-secondary">
            系统发生意外中断，请点击下方按钮重新建立会话。
          </p>
          {error.digest ? (
            <div className="font-mono text-xs text-ink-muted">Ref · {error.digest}</div>
          ) : null}
          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={reset}
              className="cursor-pointer rounded-control bg-ink-primary px-4 py-2 text-sm font-medium text-ink-inverse transition-opacity hover:opacity-90"
            >
              重新加载
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
