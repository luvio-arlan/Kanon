"use client";

import {
  calculateImpliedExpectations,
  type MarketQuoteSnapshot,
  type ThesisDetail,
} from "@kanon/core";
import {
  Badge,
  Button,
  KANON_TRANSITION_FAST,
  MarketSessionBadge,
  RollingNumber,
  Spinner,
} from "@kanon/ui";
import { IconCheck } from "@tabler/icons-react";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo } from "react";
import type { AutoSaveStatus } from "@/shared/hooks/use-thesis-step-draft";

function RibbonPriceTelemetry({
  thesis,
  quote,
}: {
  thesis: ThesisDetail;
  quote: MarketQuoteSnapshot | null;
}) {
  const exp = useMemo(
    () => calculateImpliedExpectations({ summary: thesis.valuation }),
    [thesis.valuation],
  );
  const live = quote?.effectivePrice ?? thesis.currentPrice;
  const below15 = live <= exp.hurdleEntry15;
  const ratioText =
    thesis.valuation.riskRewardRatio !== null
      ? `${thesis.valuation.riskRewardRatio.toFixed(2)}×`
      : "∞";

  return (
    <div className="flex shrink-0 items-center gap-2 whitespace-nowrap font-mono text-xs tabular-nums">
      <span className="font-semibold text-ink-primary">{thesis.ticker}</span>
      {quote ? <MarketSessionBadge session={quote.sessionState} compact /> : null}
      <RollingNumber
        value={live}
        prefix="$"
        decimals={2}
        className="font-medium text-ink-primary"
      />
      <span className="inline-flex items-center gap-1 text-ink-muted">
        <span>→</span>
        <RollingNumber value={thesis.valuation.base.targetPrice} prefix="$" decimals={1} />
      </span>
      <Badge variant={below15 ? "pass" : "titanium"}>
        {below15 ? "买点内" : `赔率 ${ratioText}`}
      </Badge>
    </div>
  );
}

function QuietSyncIndicator({ status, onRetry }: { status: AutoSaveStatus; onRetry: () => void }) {
  return (
    <span className="relative flex h-7 w-[72px] shrink-0 items-center justify-end pr-0.5">
      <AnimatePresence initial={false}>
        {status !== "idle" ? (
          <motion.span
            key={status}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={KANON_TRANSITION_FAST}
            className="absolute inset-0 flex items-center justify-end whitespace-nowrap text-xs"
          >
            {status === "saving" ? (
              <span className="inline-flex items-center gap-1.5 text-ink-muted">
                <Spinner size="xs" decorative className="text-ink-muted" />
                <span>保存中</span>
              </span>
            ) : status === "saved" ? (
              <span className="inline-flex items-center gap-1 text-ink-muted">
                <IconCheck size={12} stroke={1.5} className="text-status-pass" />
                <span>已保存</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={onRetry}
                className="cursor-pointer rounded-badge px-1.5 py-0.5 font-medium text-accent-coral transition-colors duration-150 hover:bg-accent-coral-soft"
              >
                重试保存
              </button>
            )}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </span>
  );
}

export function CanvasContextRibbon({
  thesis,
  liveQuote,
  syncStatus = "idle",
  readOnly = false,
  onRetrySave,
  onOpenAgent,
}: {
  thesis: ThesisDetail;
  liveQuote: MarketQuoteSnapshot | null;
  syncStatus?: AutoSaveStatus;
  readOnly?: boolean;
  onRetrySave?: () => void;
  onOpenAgent: () => void;
}) {
  return (
    <div className="no-print kanon-glass-ribbon sticky top-3 z-20 mb-6 rounded-card border border-hairline">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2.5">
        <RibbonPriceTelemetry thesis={thesis} quote={liveQuote} />
        <div className="flex shrink-0 items-center gap-2">
          {readOnly ? (
            <Badge variant="titanium">只读</Badge>
          ) : (
            <QuietSyncIndicator status={syncStatus} onRetry={onRetrySave ?? (() => undefined)} />
          )}
          <Button variant="outline" size="xs" onClick={onOpenAgent}>
            <span>IC Agent</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
