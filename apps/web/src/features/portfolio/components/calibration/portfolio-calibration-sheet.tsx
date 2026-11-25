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
  data,
}: {
  tab: CalibrationTab;
  loading: boolean;
  data: { calibration: PortfolioCalibrationReport; digest: WeeklyIcDigest } | null;
}) {
  if (loading && !data) {
    return (
      <div className="rounded-card border border-hairline bg-surface p-6">
        <AgentThinking variant="wave" label="正在聚合组合交易纪律与复盘裁决" />
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
  const [data, setData] = useState<{
    calibration: PortfolioCalibrationReport;
    digest: WeeklyIcDigest;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void apiGetPortfolioCalibration().then((res) => {
      if (cancelled) return;
      if (res) setData(res);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  return { loading, data };
}

export function PortfolioCalibrationSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [tab, setTab] = useState<CalibrationTab>("attribution");
  const { loading, data } = useCalibrationReport(open);

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
        <CalibrationBody tab={tab} loading={loading} data={data} />
      </div>
    </Sheet>
  );
}
