"use client";

import type { PortfolioCalibrationReport, WeeklyIcDigest } from "@kanon/core";
import { AgentThinking, Button, SegmentedTabs, Sheet } from "@kanon/ui";
import { useEffect, useState } from "react";
import { apiGetPortfolioCalibration } from "../../lib/portfolio-api";
import { CalibrationMetricsView } from "./calibration-metrics-view";
import { WeeklyDigestView } from "./weekly-digest-view";

type CalibrationTab = "attribution" | "digest";

function CalibrationBody({
  tab,
  loading,
  error,
  data,
  onRetry,
}: {
  tab: CalibrationTab;
  loading: boolean;
  error: boolean;
  data: { calibration: PortfolioCalibrationReport; digest: WeeklyIcDigest } | null;
  onRetry: () => void;
}) {
  if (loading && !data) {
    return (
      <div className="rounded-card border border-hairline bg-surface p-6">
        <AgentThinking variant="wave" label="正在聚合组合交易纪律与复盘裁决" />
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-card border border-hairline bg-surface p-8 text-center">
        <p className="text-sm text-ink-secondary">组合校准数据加载失败，请重试。</p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          重新加载
        </Button>
      </div>
    );
  }
  if (!data) return null;
  return tab === "attribution" ? (
    <CalibrationMetricsView report={data.calibration} />
  ) : (
    <WeeklyDigestView digest={data.digest} />
  );
}

function useCalibrationReport(open: boolean) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [data, setData] = useState<{
    calibration: PortfolioCalibrationReport;
    digest: WeeklyIcDigest;
  } | null>(null);

  const load = async (isCancelled: () => boolean = () => false) => {
    setLoading(true);
    setError(false);
    const res = await apiGetPortfolioCalibration();
    if (isCancelled()) return;
    if (res) setData(res);
    else setError(true);
    setLoading(false);
  };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    void apiGetPortfolioCalibration().then((res) => {
      if (cancelled) return;
      if (res) setData(res);
      else setError(true);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  return { loading, error, data, retry: () => void load() };
}

export function PortfolioCalibrationSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [tab, setTab] = useState<CalibrationTab>("attribution");
  const { loading, error, data, retry } = useCalibrationReport(open);

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="组合认知校准与周报"
      footer={
        <div className="flex items-center justify-end">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <SegmentedTabs
          layoutId="calibration-sheet-tabs"
          value={tab}
          onChange={setTab}
          items={[
            { id: "attribution", label: "行为归因与效率" },
            { id: "digest", label: "IC 投研周报" },
          ]}
        />
        <CalibrationBody tab={tab} loading={loading} error={error} data={data} onRetry={retry} />
      </div>
    </Sheet>
  );
}
