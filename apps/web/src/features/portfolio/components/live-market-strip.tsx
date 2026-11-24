"use client";

import type { MarketDataSource, MarketQuoteSnapshot, ThesisDetail } from "@kanon/core";
import { Badge, Button, cn, MarketSessionBadge, RollingNumber } from "@kanon/ui";
import { IconAdjustmentsHorizontal, IconRadar2, IconRefresh } from "@tabler/icons-react";

export interface LiveMarketStripProps {
  theses: readonly ThesisDetail[];
  quotes: Readonly<Record<string, MarketQuoteSnapshot>>;
  activeSource: MarketDataSource | "none";
  loadingQuotes: boolean;
  calibrating: boolean;
  onRefreshQuotes: () => void;
  onCalibratePrices: () => void;
  onOpenMarketSettings: () => void;
  onSelectThesis: (thesis: ThesisDetail) => void;
}

const SOURCE_LABELS: Record<MarketDataSource | "none", string> = {
  yahoo: "Yahoo 免费盘前/盘后",
  finnhub: "Finnhub 实时通道",
  fmp: "FMP 机构通道",
  polygon: "Polygon SIP 通道",
  none: "本地参考锚点",
};

function formatSignedPct(val: number | null): string {
  if (val === null) return "";
  return `${val > 0 ? "+" : ""}${val.toFixed(1)}%`;
}

function resolvePillMeta(quote: MarketQuoteSnapshot) {
  if (quote.sessionState === "PRE" && quote.preMarketPrice !== null) {
    return { pct: quote.preMarketChangePct, extTag: "盘前" as const };
  }
  if (quote.sessionState === "POST" && quote.postMarketPrice !== null) {
    return { pct: quote.postMarketChangePct, extTag: "盘后" as const };
  }
  return { pct: quote.regularChangePct, extTag: null };
}

function deltaToneClass(pct: number | null): string {
  if (pct === null) return "text-ink-muted";
  return pct > 0 ? "text-status-pass" : pct < 0 ? "text-accent-coral" : "text-ink-muted";
}

function QuotePill({
  thesis,
  quote,
  onSelect,
}: {
  thesis: ThesisDetail;
  quote: MarketQuoteSnapshot;
  onSelect: () => void;
}) {
  const { pct, extTag } = resolvePillMeta(quote);
  return (
    <button
      type="button"
      onClick={onSelect}
      className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-control border border-hairline bg-muted/45 px-2.5 py-1 font-mono text-xs tabular-nums transition-[background-color,border-color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-px hover:border-strong hover:bg-surface hover:shadow-button active:translate-y-0 active:bg-muted"
    >
      <span className="font-semibold text-ink-primary">{thesis.ticker}</span>
      <RollingNumber
        value={quote.effectivePrice}
        prefix="$"
        decimals={2}
        className="text-ink-primary"
      />
      {extTag ? <span className="text-ink-muted">{extTag}</span> : null}
      {pct !== null ? (
        <span className={cn("font-medium", deltaToneClass(pct))}>{formatSignedPct(pct)}</span>
      ) : null}
    </button>
  );
}

function StripActions(p: {
  loadingQuotes: boolean;
  calibrating: boolean;
  onRefreshQuotes: () => void;
  onCalibratePrices: () => void;
  onOpenMarketSettings: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <Button variant="ghost" size="xs" loading={p.loadingQuotes} onClick={p.onRefreshQuotes}>
        {!p.loadingQuotes ? <IconRefresh size={13} stroke={1.5} /> : null}
        <span>刷新盘口</span>
      </Button>
      <Button variant="titanium" size="xs" loading={p.calibrating} onClick={p.onCalibratePrices}>
        {!p.calibrating ? <IconRadar2 size={13} stroke={1.5} /> : null}
        <span>校准现价</span>
      </Button>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="行情数据源设置"
        title="行情数据源与付费升级"
        onClick={p.onOpenMarketSettings}
      >
        <IconAdjustmentsHorizontal size={14} stroke={1.5} />
      </Button>
    </div>
  );
}

export function LiveMarketStrip(p: LiveMarketStripProps) {
  const quotedItems = p.theses
    .filter((t) => t.status === "active")
    .map((t) => ({ thesis: t, quote: p.quotes[t.ticker] }))
    .filter((x): x is { thesis: ThesisDetail; quote: MarketQuoteSnapshot } => Boolean(x.quote));
  const primarySession = quotedItems[0]?.quote.sessionState ?? "CLOSED";

  return (
    <div className="kanon-surface-specular flex flex-wrap items-center justify-between gap-3 rounded-card border border-hairline bg-surface px-4 py-2.5">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
        <MarketSessionBadge session={primarySession} />
        <Badge variant="titanium" className="font-mono">
          {SOURCE_LABELS[p.activeSource]}
        </Badge>
        <div className="kanon-scroll-thin flex min-w-0 items-center gap-2 overflow-x-auto py-0.5">
          {quotedItems.slice(0, 6).map(({ thesis, quote }) => (
            <QuotePill
              key={thesis.id}
              thesis={thesis}
              quote={quote}
              onSelect={() => p.onSelectThesis(thesis)}
            />
          ))}
          {quotedItems.length === 0 ? (
            <span className="text-xs text-ink-muted">
              {p.loadingQuotes ? "正在拉取实时盘前/盘后报价..." : "点击右侧刷新获取盘前/盘后快照"}
            </span>
          ) : null}
        </div>
      </div>
      <StripActions
        loadingQuotes={p.loadingQuotes}
        calibrating={p.calibrating}
        onRefreshQuotes={p.onRefreshQuotes}
        onCalibratePrices={p.onCalibratePrices}
        onOpenMarketSettings={p.onOpenMarketSettings}
      />
    </div>
  );
}
