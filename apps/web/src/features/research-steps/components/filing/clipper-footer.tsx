"use client";

import { Button, Input } from "@kanon/ui";
import { IconAlertTriangle, IconQuote, IconScissors } from "@tabler/icons-react";

function ClipperQuotePreview({ quote, onClear }: { quote: string; onClear: () => void }) {
  return (
    <div className="rounded-control border border-hairline bg-surface px-3 py-2 text-xs">
      <div className="flex items-center justify-between gap-2 text-ink-muted">
        <span className="inline-flex items-center gap-1 font-medium text-ink-secondary">
          <IconQuote size={13} stroke={1.5} />
          <span>当前摘录片段</span>
        </span>
        {quote ? (
          <button
            type="button"
            onClick={onClear}
            className="cursor-pointer text-ink-muted hover:text-ink-primary"
          >
            清空
          </button>
        ) : null}
      </div>
      <p className="mt-1 line-clamp-2 text-ink-primary">
        {quote || "尚未选中片段：请在上方划词或点击任意段落"}
      </p>
    </div>
  );
}

export function ClipperFooter(p: {
  activeQuote: string;
  anchor: string;
  hasExitHandler: boolean;
  onClear: () => void;
  onAnchor: (v: string) => void;
  onClipCheck: () => void;
  onClipExit: () => void;
}) {
  return (
    <div className="space-y-3">
      <ClipperQuotePreview quote={p.activeQuote} onClear={p.onClear} />
      <div className="space-y-2">
        <Input
          value={p.anchor}
          onChange={(e) => p.onAnchor(e.target.value)}
          placeholder="出处锚点（如 FY26 Q4 Call / 10-K）"
          className="w-full"
        />
        <div className="flex items-center justify-end gap-2">
          <Button variant="titanium" size="sm" disabled={!p.activeQuote} onClick={p.onClipCheck}>
            <IconScissors size={14} stroke={1.5} />
            <span>摘录至 Step 3 互证</span>
          </Button>
          {p.hasExitHandler ? (
            <Button variant="primary" size="sm" disabled={!p.activeQuote} onClick={p.onClipExit}>
              <IconAlertTriangle size={14} stroke={1.5} />
              <span>带入 Step 5 红线</span>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
