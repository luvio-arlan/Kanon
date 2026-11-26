"use client";

import { Badge } from "@kanon/ui";
import { IconLock } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  apiCreateForecast,
  apiDecideIcApproval,
  apiLoadForecastsAndIc,
  apiResolveForecast,
  apiSubmitIcApproval,
  type ForecastRow,
  type IcApprovalRow,
} from "../lib/forecasts-ic-api";
import { ForecastComposerRow, ForecastRowCard } from "./forecast-ic-parts";
import { IcApprovalBar } from "./ic-approval-bar";

export interface ForecastAndIcPanelProps {
  thesisId: string;
  ticker: string;
}

function formatBrierBadge(brierScore: number | null, resolvedCount: number): string {
  if (resolvedCount === 0 || brierScore === null) return "待预测到期";
  if (resolvedCount < 5) return `样本不足 (n=${resolvedCount})`;
  return `Brier ${brierScore.toFixed(3)} · n=${resolvedCount} · 基线 0.500`;
}

async function executeToastAction(
  fn: () => Promise<{ ok: true } | { ok: false; error: string }>,
  okMsg: string,
  setBusy: (b: boolean) => void,
  refresh: () => Promise<void>,
): Promise<boolean> {
  setBusy(true);
  const res = await fn();
  setBusy(false);
  if (res.ok) {
    toast.success(okMsg);
    await refresh();
    return true;
  }
  toast.error(res.error);
  return false;
}

function useForecastsAndIcState(thesisId: string, ticker: string) {
  const [forecasts, setForecasts] = useState<ForecastRow[]>([]);
  const [resolvedCount, setResolvedCount] = useState(0);
  const [brierScore, setBrierScore] = useState<number | null>(null);
  const [approvals, setApprovals] = useState<IcApprovalRow[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const data = await apiLoadForecastsAndIc(thesisId);
    setForecasts(data.forecasts);
    setResolvedCount(data.resolvedCount);
    setBrierScore(data.brierScore);
    setApprovals(data.approvals);
  }, [thesisId]);

  useEffect(() => void refresh(), [refresh]);

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, okMsg: string) =>
    executeToastAction(fn, okMsg, setBusy, refresh);

  return {
    forecasts,
    resolvedCount,
    brierScore,
    approvals,
    busy,
    lockForecast: (q: string, pct: string, resolveBy: string) => {
      if (!q.trim()) return Promise.resolve(false);
      const p = Math.max(1, Math.min(99, Number(pct) || 50)) / 100;
      return run(
        () =>
          apiCreateForecast(thesisId, { question: q.trim(), probabilities: [p, 1 - p], resolveBy }),
        "已锁定预测",
      );
    },
    resolve: (id: string, idx: number) =>
      run(() => apiResolveForecast(thesisId, id, idx), "已结算预测"),
    submitIc: () => run(() => apiSubmitIcApproval(thesisId), `已提交 ${ticker} 审阅`),
    decideIc: (id: string, decision: "approved" | "rejected", note?: string) =>
      run(
        () => apiDecideIcApproval(thesisId, id, decision, note),
        decision === "approved" ? "已批准" : "已驳回",
      ),
  };
}

export function ForecastAndIcPanel({ thesisId, ticker }: ForecastAndIcPanelProps) {
  const s = useForecastsAndIcState(thesisId, ticker);
  return (
    <div className="space-y-5">
      <section className="space-y-4 rounded-card border border-hairline bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <IconLock size={15} stroke={1.5} className="text-ink-muted" />
            <h2 className="text-sm font-semibold text-ink-primary">预测校准账本</h2>
          </div>
          <Badge variant="mono">{formatBrierBadge(s.brierScore, s.resolvedCount)}</Badge>
        </div>
        <ForecastComposerRow ticker={ticker} busy={s.busy} onLock={s.lockForecast} />
        {s.forecasts.length > 0 ? (
          <div className="divide-y divide-hairline border-t border-hairline">
            {s.forecasts.map((row) => (
              <ForecastRowCard
                key={row.id}
                row={row}
                onResolve={(id, idx) => void s.resolve(id, idx)}
              />
            ))}
          </div>
        ) : null}
      </section>
      <IcApprovalBar
        latest={s.approvals[0]}
        busy={s.busy}
        onSubmit={() => void s.submitIc()}
        onDecide={(id, decision, note) => void s.decideIc(id, decision, note)}
      />
    </div>
  );
}
