"use client";

import type { DisciplineEntry, EmotionState, TradeAction } from "@kanon/core";
import { Badge, Card } from "@kanon/ui";

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
  fomo: "FOMO 焦虑",
  fearful: "恐慌想割",
};

export function DisciplineTimeline({ entries }: { entries: readonly DisciplineEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-ink-primary">历史纪律与复盘记录</h3>
      {entries.map((entry) => (
        <Card key={entry.id} className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="titanium">{ACTION_LABEL[entry.action]}</Badge>
              <Badge variant={entry.emotion === "calm" ? "pass" : "warn"}>
                情绪：{EMOTION_LABEL[entry.emotion]}
              </Badge>
              {entry.noLeverageConfirmed ? <Badge variant="pass">已核验零杠杆</Badge> : null}
            </div>
            <span className="font-mono text-xs text-ink-muted tabular-nums">
              锚定价 ${entry.priceAnchor.toFixed(2)} · {entry.createdAt.slice(0, 10)}
            </span>
          </div>
          <p className="mt-2.5 text-sm text-ink-primary">
            <span className="font-medium text-ink-muted">认错离场红线：</span>
            {entry.exitRule}
          </p>
          {entry.note ? <p className="mt-1 text-xs text-ink-secondary">{entry.note}</p> : null}
        </Card>
      ))}
    </div>
  );
}
