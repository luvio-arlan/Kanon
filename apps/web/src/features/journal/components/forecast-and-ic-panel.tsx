"use client";

import { Badge, Button, Input } from "@kanon/ui";
import { IconCheck, IconLock, IconShieldCheck } from "@tabler/icons-react";
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

export interface ForecastAndIcPanelProps {
  thesisId: string;
  ticker: string;
}

const IC_STATE_LABEL: Record<IcApprovalRow["state"], string> = {
  draft: "草稿",
  in_review: "投委会审阅中",
  approved: "投委会已批准",
  rejected: "已驳回",
  archived: "已归档",
};

function ForecastRowCard({
  row,
  onResolve,
}: {
  row: ForecastRow;
  onResolve: (id: string, idx: number) => void;
}) {
  const yesPct = Math.round((row.probabilitiesJson[0] ?? 0.5) * 100);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs">
      <div className="min-w-0 space-y-1">
        <div className="font-medium text-ink-primary">{row.question}</div>
        <div className="flex flex-wrap items-center gap-2 font-mono text-ink-muted tabular-nums">
          <span>概率 {yesPct}%</span>
          <span>· 到期 {row.resolveBy}</span>
          <span>· SHA {row.lockedHash.slice(0, 8)}</span>
        </div>
      </div>
      {row.outcomeJson ? (
        <Badge variant={row.outcomeJson.outcomeIndex === 0 ? "pass" : "warn"}>
          {row.outcomeJson.outcomeIndex === 0 ? "已兑现" : "未兑现"}
        </Badge>
      ) : (
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={() => onResolve(row.id, 0)}>
            <span>兑现</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onResolve(row.id, 1)}>
            <span>证伪</span>
          </Button>
        </div>
      )}
    </div>
  );
}

function IcApprovalBar({
  latest,
  busy,
  onSubmit,
  onApprove,
}: {
  latest?: IcApprovalRow;
  busy: boolean;
  onSubmit: () => void;
  onApprove: (id: string) => void;
}) {
  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-hairline bg-surface p-5">
      <div className="flex items-center gap-2.5">
        <IconShieldCheck size={16} stroke={1.5} className="text-ink-muted" />
        <span className="text-sm font-semibold text-ink-primary">投委会 (IC) 审批流</span>
        {latest ? (
          <Badge variant={latest.state === "approved" ? "pass" : "titanium"}>
            {IC_STATE_LABEL[latest.state]}
          </Badge>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" loading={busy} onClick={onSubmit}>
          <span>提交审批</span>
        </Button>
        {latest?.state === "in_review" ? (
          <Button variant="primary" size="sm" onClick={() => onApprove(latest.id)}>
            <IconCheck size={14} stroke={1.5} />
            <span>批准</span>
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function ForecastComposerRow({
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
  const [resolveBy, setResolveBy] = useState("2027-06-30");
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

function useForecastsAndIcState(thesisId: string, ticker: string) {
  const [forecasts, setForecasts] = useState<ForecastRow[]>([]);
  const [brierScore, setBrierScore] = useState<number | null>(null);
  const [approvals, setApprovals] = useState<IcApprovalRow[]>([]);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    const data = await apiLoadForecastsAndIc(thesisId);
    setForecasts(data.forecasts);
    setBrierScore(data.brierScore);
    setApprovals(data.approvals);
  }, [thesisId]);
  useEffect(() => void refresh(), [refresh]);

  const runAction = async (fn: () => Promise<boolean>, okMsg: string, errMsg?: string) => {
    setBusy(true);
    const ok = await fn();
    setBusy(false);
    if (ok) {
      toast.success(okMsg);
      await refresh();
    } else if (errMsg) toast.error(errMsg);
    return ok;
  };
  return {
    forecasts,
    brierScore,
    approvals,
    busy,
    lockForecast: (q: string, pct: string, resolveBy: string) => {
      if (!q.trim()) return Promise.resolve(false);
      const p = Math.max(1, Math.min(99, Number(pct) || 50)) / 100;
      return runAction(
        () =>
          apiCreateForecast(thesisId, { question: q.trim(), probabilities: [p, 1 - p], resolveBy }),
        "已写入不可篡改预测账本（加密锁止）",
        "锁定预测失败",
      );
    },
    resolve: (id: string, idx: number) =>
      runAction(() => apiResolveForecast(thesisId, id, idx), "预测结局已结算，Brier 校准分已更新"),
    submitIc: () =>
      runAction(() => apiSubmitIcApproval(thesisId), `已提交 ${ticker} 投委会备忘录审批`),
    approveIc: (id: string) =>
      runAction(() => apiDecideIcApproval(thesisId, id, "approved"), "已批准投委会备忘录"),
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
            <h2 className="text-sm font-semibold text-ink-primary">不可篡改预测账本</h2>
          </div>
          <Badge variant="mono">
            {s.brierScore !== null ? `Brier ${s.brierScore.toFixed(3)}` : "待预测到期"}
          </Badge>
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
        onApprove={(id) => void s.approveIc(id)}
      />
    </div>
  );
}
