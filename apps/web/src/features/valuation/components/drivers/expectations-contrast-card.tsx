"use client";

import { Badge, Card, cn } from "@kanon/ui";

interface ContrastBarItem {
  id: string;
  label: string;
  valuePct: number | null;
  tone: string;
}

function ContrastRow({ item, maxScale }: { item: ContrastBarItem; maxScale: number }) {
  const widthPct =
    item.valuePct === null
      ? 0
      : Math.min(100, Math.max(4, (Math.max(0, item.valuePct) / maxScale) * 100));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-ink-secondary">{item.label}</span>
        <span className="font-mono font-semibold text-ink-primary tabular-nums">
          {item.valuePct !== null ? `${item.valuePct.toFixed(1)}%` : "—"}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-pill bg-muted">
        {item.valuePct !== null ? (
          <div
            className={cn("h-full rounded-pill transition-all duration-200", item.tone)}
            style={{ width: `${widthPct}%` }}
          />
        ) : null}
      </div>
    </div>
  );
}

export function ExpectationsContrastCard(props: {
  historicalCagrPct: number | null;
  impliedCagrPct: number;
  baseCagrPct: number;
}) {
  const values = [props.historicalCagrPct ?? 0, props.impliedCagrPct, props.baseCagrPct, 25];
  const maxScale = Math.max(...values.map((v) => Math.abs(v)), 10);
  const spread = props.baseCagrPct - props.impliedCagrPct;
  const rows: ContrastBarItem[] = [
    {
      id: "hist",
      label: "历史 SEC 营收 CAGR",
      valuePct: props.historicalCagrPct,
      tone: "bg-ink-secondary",
    },
    {
      id: "implied",
      label: "现价隐含必须增速 (Reverse DCF)",
      valuePct: props.impliedCagrPct,
      tone: "bg-accent-coral",
    },
    {
      id: "base",
      label: "中性目标隐含年化 (Base CAGR)",
      valuePct: props.baseCagrPct,
      tone: "bg-status-pass",
    },
  ];
  return (
    <Card className="space-y-3.5 p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink-primary">预期差三轴对照</h3>
        <Badge
          variant={spread >= 0 ? "pass" : "warn"}
          className="font-mono tabular-nums whitespace-nowrap"
        >
          Base - 隐含 {spread >= 0 ? "+" : ""}
          {spread.toFixed(1)}pct
        </Badge>
      </div>
      <div className="space-y-3 border-t border-hairline pt-3">
        {rows.map((item) => (
          <ContrastRow key={item.id} item={item} maxScale={maxScale} />
        ))}
      </div>
    </Card>
  );
}
