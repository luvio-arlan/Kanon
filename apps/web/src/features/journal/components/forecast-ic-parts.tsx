"use client";

import { Badge, Button, Input } from "@kanon/ui";
import { useState } from "react";
import type { ForecastRow } from "../lib/forecasts-ic-api";

function defaultResolveByDate(): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

function ForecastResolveActions({
  row,
  isDue,
  confirmEarly,
  onToggleEarly,
  onResolve,
}: {
  row: ForecastRow;
  isDue: boolean;
  confirmEarly: boolean;
  onToggleEarly: (v: boolean) => void;
  onResolve: (id: string, idx: number) => void;
}) {
  if (row.outcomeJson) {
    return (
      <Badge variant={row.outcomeJson.outcomeIndex === 0 ? "pass" : "warn"}>
        {row.outcomeJson.outcomeIndex === 0 ? "已兑现" : "未兑现"}
      </Badge>
    );
  }
  if (!isDue && !confirmEarly) {
    return (
      <Button variant="ghost" size="sm" onClick={() => onToggleEarly(true)}>
        <span>提前结算</span>
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-ink-muted">结算后不可撤销</span>
      <Button variant="outline" size="sm" onClick={() => onResolve(row.id, 0)}>
        <span>兑现</span>
      </Button>
      <Button variant="ghost" size="sm" onClick={() => onResolve(row.id, 1)}>
        <span>证伪</span>
      </Button>
      {!isDue ? (
        <Button variant="ghost" size="sm" onClick={() => onToggleEarly(false)}>
          <span>取消</span>
        </Button>
      ) : null}
    </div>
  );
}

export function ForecastRowCard({
  row,
  onResolve,
}: {
  row: ForecastRow;
  onResolve: (id: string, idx: number) => void;
}) {
  const [confirmEarly, setConfirmEarly] = useState(false);
  const yesPct = Math.round((row.probabilitiesJson[0] ?? 0.5) * 100);
  const isDue = row.resolveBy <= new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs">
      <div className="min-w-0 space-y-1">
        <div className="font-medium text-ink-primary">{row.question}</div>
        <div
          className="flex flex-wrap items-center gap-2 font-mono text-ink-muted tabular-nums"
          title={`锁定指纹 ${row.lockedHash}`}
        >
          <span>概率 {yesPct}%</span>
          <span>· 到期 {row.resolveBy}</span>
        </div>
      </div>
      <ForecastResolveActions
        row={row}
        isDue={isDue}
        confirmEarly={confirmEarly}
        onToggleEarly={setConfirmEarly}
        onResolve={onResolve}
      />
    </div>
  );
}

export function ForecastComposerRow({
  ticker,
  busy,
  onLock,
}: {
  ticker: string;
  busy: boolean;
  onLock: (q: string, pct: string, by: string) => Promise<boolean>;
}) {
  const [question, setQuestion] = useState("");
  const [probPct, setProbPct] = useState("70");
  const [resolveBy, setResolveBy] = useState(defaultResolveByDate);
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[1fr_92px_132px_auto]">
      <Input
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder={`例如：${ticker} 未来 4 季毛利率维持 65% 以上`}
      />
      <Input
        type="number"
        min={1}
        max={99}
        value={probPct}
        onChange={(e) => setProbPct(e.target.value)}
        placeholder="概率%"
      />
      <Input type="date" value={resolveBy} onChange={(e) => setResolveBy(e.target.value)} />
      <Button
        variant="primary"
        size="sm"
        loading={busy}
        onClick={() =>
          void onLock(question, probPct, resolveBy).then((ok) => ok && setQuestion(""))
        }
      >
        <span>锁定预测</span>
      </Button>
    </div>
  );
}
