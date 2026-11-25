"use client";

import type { DisciplineEntry, EmotionState, TradeAction } from "@kanon/core";
import { Card } from "@kanon/ui";
import { IconCheck } from "@tabler/icons-react";

const ACTION_LABEL: Record<TradeAction, string> = {
  buy: "首次建仓",
  add: "分批加仓",
  hold: "耐心持有",
  trim: "纪律减仓",
  pass: "放弃观望",
};

const EMOTION_LABEL: Record<EmotionState, string> = {
  calm: "冷静理性",
  hesitant: "犹豫观望",
  fomo: "追高焦虑",
  fearful: "恐慌承压",
};

function TimelineRow({ entry, currentPrice }: { entry: DisciplineEntry; currentPrice: number }) {
  const emotionWarn = entry.emotion === "fomo" || entry.emotion === "fearful";
  const deltaPct =
    entry.priceAnchor > 0 ? ((currentPrice - entry.priceAnchor) / entry.priceAnchor) * 100 : null;
  const deltaSign = deltaPct !== null && deltaPct > 0 ? "+" : "";

  return (
    <article className="py-5 first:pt-1 last:pb-1">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="font-semibold text-ink-primary">{ACTION_LABEL[entry.action]}</span>
          <span className="font-mono text-ink-secondary tabular-nums">
            ${entry.priceAnchor.toFixed(2)}
          </span>
          {deltaPct !== null && Math.abs(deltaPct) >= 0.1 ? (
            <span
              className={`font-mono tabular-nums ${deltaPct >= 0 ? "text-status-pass" : "text-status-fail"}`}
            >
              ({deltaSign}
              {deltaPct.toFixed(1)}%)
            </span>
          ) : null}
          <span aria-hidden="true" className="text-ink-muted">
            ·
          </span>
          <span className={emotionWarn ? "text-status-warn" : "text-ink-secondary"}>
            {EMOTION_LABEL[entry.emotion]}
          </span>
          {entry.noLeverageConfirmed ? (
            <span className="inline-flex items-center gap-1 text-ink-muted">
              <IconCheck size={13} stroke={1.5} />
              零杠杆
            </span>
          ) : null}
        </div>
        <time className="font-mono text-ink-muted tabular-nums">
          {entry.createdAt.slice(0, 10)}
        </time>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ink-primary">
        <span className="text-ink-muted">离场条件：</span>
        {entry.exitRule}
      </p>
      {entry.note ? (
        <p className="mt-1 text-xs leading-relaxed text-ink-secondary">{entry.note}</p>
      ) : null}
    </article>
  );
}

export function DisciplineTimeline({
  entries,
  currentPrice,
}: {
  entries: readonly DisciplineEntry[];
  currentPrice: number;
}) {
  if (entries.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-ink-secondary">
          暂无交易复盘留痕。每次仓位调整前请确认零杠杆约束与预设离场条件。
        </p>
      </Card>
    );
  }

  return (
    <Card className="px-6 py-4">
      <div className="divide-y divide-hairline">
        {entries.map((entry) => (
          <TimelineRow key={entry.id} entry={entry} currentPrice={currentPrice} />
        ))}
      </div>
    </Card>
  );
}
