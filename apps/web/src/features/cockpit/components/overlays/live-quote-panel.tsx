"use client";

import type { MarketQuoteSnapshot } from "@kanon/core";
import { MarketSessionBadge, RangePositionBar } from "@kanon/ui";

export function LiveQuoteSnapshotPanel({ quote }: { quote?: MarketQuoteSnapshot }) {
  if (!quote) return null;
  return (
    <div className="space-y-2 rounded-panel border border-hairline bg-surface p-3.5 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MarketSessionBadge session={quote.sessionState} compact />
          <span className="font-mono text-xs text-ink-muted uppercase">{quote.source}</span>
        </div>
        <span className="font-mono text-sm font-semibold text-ink-primary tabular-nums">
          ${quote.effectivePrice.toFixed(2)}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-xs text-ink-secondary tabular-nums">
        <span>常规 ${quote.regularPrice.toFixed(2)}</span>
        {quote.preMarketPrice !== null ? (
          <span>盘前 ${quote.preMarketPrice.toFixed(2)}</span>
        ) : null}
        {quote.postMarketPrice !== null ? (
          <span>盘后 ${quote.postMarketPrice.toFixed(2)}</span>
        ) : null}
      </div>
      {quote.fiftyTwoWeekPositionPct !== null && quote.fiftyTwoWeekLow && quote.fiftyTwoWeekHigh ? (
        <RangePositionBar
          positionPct={quote.fiftyTwoWeekPositionPct}
          lowLabel={`52W $${quote.fiftyTwoWeekLow.toFixed(0)}`}
          highLabel={`$${quote.fiftyTwoWeekHigh.toFixed(0)}`}
        />
      ) : null}
    </div>
  );
}
