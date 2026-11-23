"use client";

export interface DisciplineFooterStripProps {
  onOpenCommand: () => void;
}

export function DisciplineFooterStrip({ onOpenCommand }: DisciplineFooterStripProps) {
  return (
    <footer className="mt-10 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-xs text-ink-muted">
      <span>交易铁律：永不使用杠杆</span>
      <span aria-hidden="true">·</span>
      <span>每笔仓位必须写清证伪红线</span>
      <span aria-hidden="true">·</span>
      <button
        type="button"
        onClick={onOpenCommand}
        className="cursor-pointer font-medium text-ink-secondary underline-offset-4 transition-colors hover:text-ink-primary hover:underline"
      >
        按 ⌘K 随时呼出指令
      </button>
    </footer>
  );
}
