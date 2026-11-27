"use client";

import type { ThesisDetail } from "@kanon/core";
import { SidebarNavItem, SidebarSection } from "@kanon/ui";
import { IconActivityHeartbeat, IconRefresh, IconScale, IconWallet } from "@tabler/icons-react";
import { useRouter } from "next/navigation";

export function QuickThesesNav(p: {
  theses: readonly ThesisDetail[];
  collapsed: boolean;
  onCloseMobile: () => void;
}) {
  const router = useRouter();
  const active = p.theses.filter((t) => t.status !== "archived_veto").slice(0, 6);
  if (p.collapsed || active.length === 0) return null;
  return (
    <SidebarSection title="研究档案" collapsed={false}>
      {active.map((t) => {
        const rr = t.valuation.riskRewardRatio;
        return (
          <SidebarNavItem
            key={t.id}
            label={t.companyName}
            code={t.ticker}
            badge={rr !== null ? `${rr.toFixed(1)}×` : "∞"}
            onClick={() => {
              p.onCloseMobile();
              router.push(`/thesis/${t.id}`);
            }}
          />
        );
      })}
    </SidebarSection>
  );
}

export function CockpitToolsNav(p: {
  refreshingPrices: boolean;
  collapsed: boolean;
  onCloseMobile: () => void;
  onRefreshPrices: () => void;
  onOpenStressTest: () => void;
  onOpenCalibration: () => void;
  onOpenLedger?: () => void;
}) {
  const spin = p.refreshingPrices ? "animate-spin text-accent-coral" : undefined;
  return (
    <SidebarSection title="组合风控" collapsed={p.collapsed}>
      {p.onOpenLedger ? (
        <SidebarNavItem
          label="实盘零杠杆账本"
          icon={<IconWallet size={17} stroke={1.5} />}
          collapsed={p.collapsed}
          onClick={() => {
            p.onCloseMobile();
            p.onOpenLedger?.();
          }}
        />
      ) : null}
      <SidebarNavItem
        label="组合压力测试"
        icon={<IconActivityHeartbeat size={17} stroke={1.5} />}
        collapsed={p.collapsed}
        onClick={() => {
          p.onCloseMobile();
          p.onOpenStressTest();
        }}
      />
      <SidebarNavItem
        label="组合校准与周报"
        icon={<IconScale size={17} stroke={1.5} />}
        collapsed={p.collapsed}
        onClick={() => {
          p.onCloseMobile();
          p.onOpenCalibration();
        }}
      />
      <SidebarNavItem
        label={p.refreshingPrices ? "校准收盘价中..." : "校准收盘参考价"}
        icon={<IconRefresh size={17} stroke={1.5} className={spin} />}
        collapsed={p.collapsed}
        onClick={p.onRefreshPrices}
      />
    </SidebarSection>
  );
}
