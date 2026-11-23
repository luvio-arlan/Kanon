"use client";

import type { Hypothesis, HypothesisStatus } from "@kanon/core";
import { cn, KANON_SPRING } from "@kanon/ui";
import { IconChevronDown } from "@tabler/icons-react";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";

export interface HypothesisLedgerProps {
  hypotheses: readonly [Hypothesis, Hypothesis, Hypothesis];
}

const STATUS_META: Record<
  HypothesisStatus,
  { dotClass: string; label: string; textClass: string }
> = {
  validated: {
    dotClass: "bg-status-pass ring-4 ring-status-pass-soft",
    label: "已验证",
    textClass: "text-status-pass",
  },
  watching: {
    dotClass: "bg-status-warn ring-4 ring-status-warn-soft",
    label: "待观察",
    textClass: "text-status-warn",
  },
  warning: {
    dotClass: "bg-status-fail ring-4 ring-status-fail-soft",
    label: "预警",
    textClass: "text-status-fail",
  },
};

function HypothesisDetailPanel({
  item,
  meta,
}: {
  item: Hypothesis;
  meta: { label: string; textClass: string };
}) {
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={KANON_SPRING}
      className="overflow-hidden"
    >
      <div className="border-t border-hairline px-3.5 pb-3 pt-2.5">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-ink-muted">观测指标：{item.metricLabel}</span>
          <span className={cn("font-mono font-medium tabular-nums", meta.textClass)}>
            {item.threshold}
          </span>
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-secondary">{item.note}</p>
      </div>
    </motion.div>
  );
}

interface HypothesisRowProps {
  item: Hypothesis;
  expanded: boolean;
  onToggle: () => void;
}

function HypothesisRow({ item, expanded, onToggle }: HypothesisRowProps) {
  const meta = STATUS_META[item.status];
  return (
    <div
      className={cn(
        "rounded-control transition-colors duration-150",
        expanded ? "bg-muted/70" : "hover:bg-muted/50",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-left"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            title={meta.label}
            className={cn("h-2 w-2 shrink-0 rounded-pill", meta.dotClass)}
          />
          <span className="text-sm font-medium leading-snug text-ink-primary">{item.title}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={cn("text-xs font-medium", meta.textClass)}>{meta.label}</span>
          <IconChevronDown
            size={15}
            stroke={1.5}
            className={cn(
              "text-ink-muted transition-transform duration-150",
              expanded && "rotate-180 text-ink-primary",
            )}
          />
        </div>
      </button>
      <AnimatePresence initial={false}>
        {expanded ? <HypothesisDetailPanel item={item} meta={meta} /> : null}
      </AnimatePresence>
    </div>
  );
}

export function HypothesisLedger({ hypotheses }: HypothesisLedgerProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="border-t border-hairline px-4 py-3.5">
      <div className="space-y-1">
        {hypotheses.map((item) => (
          <HypothesisRow
            key={item.id}
            item={item}
            expanded={openId === item.id}
            onToggle={() => setOpenId(openId === item.id ? null : item.id)}
          />
        ))}
      </div>
    </div>
  );
}
