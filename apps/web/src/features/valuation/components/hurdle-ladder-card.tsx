"use client";

import { calculateHurdleLadder, type HurdleRung, type ValuationScenarioSummary } from "@kanon/core";
import { Badge, Card, cn, RollingNumber } from "@kanon/ui";
import { IconCheck, IconClockHour4 } from "@tabler/icons-react";

function HurdleRungCell({ rung }: { rung: HurdleRung }) {
  const gapSign = rung.gapFromCurrentPct > 0 ? "+" : "";
  return (
    <div
      className={cn(
        "rounded-control border px-3.5 py-3 transition-colors",
        rung.met ? "border-status-pass/35 bg-status-pass-soft/40" : "border-hairline bg-surface",
      )}
    >
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-mono font-semibold text-ink-primary tabular-nums">
          {rung.hurdlePct}% IRR 买点
        </span>
        {rung.met ? (
          <IconCheck size={14} stroke={1.5} className="text-status-pass" />
        ) : (
          <IconClockHour4 size={14} stroke={1.5} className="text-ink-muted" />
        )}
      </div>
      <div className="mt-1.5 font-mono text-lg font-semibold text-ink-primary tabular-nums">
        <RollingNumber value={rung.entryPrice} prefix="$" decimals={1} />
      </div>
      <div
        className={cn(
          "mt-1 whitespace-nowrap font-mono text-xs tabular-nums",
          rung.met ? "text-status-pass" : "text-ink-muted",
        )}
      >
        {rung.met
          ? `已达买点 · 垫 ${gapSign}${rung.gapFromCurrentPct.toFixed(1)}%`
          : `需回调 ${rung.gapFromCurrentPct.toFixed(1)}%`}
      </div>
    </div>
  );
}

export function HurdleLadderCard({ summary }: { summary: ValuationScenarioSummary }) {
  const ladder = calculateHurdleLadder(summary);
  const breakevenLabel =
    ladder.kellyBreakevenWinRatePct !== null
      ? `${ladder.kellyBreakevenWinRatePct.toFixed(1)}%`
      : "—";

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[15px] font-semibold tracking-[-0.015em] text-ink-primary">
          复利门槛买点阶梯
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="titanium" className="font-mono tabular-nums">
            期望回报 {ladder.expectedValueReturnPct >= 0 ? "+" : ""}
            {ladder.expectedValueReturnPct.toFixed(1)}%
          </Badge>
          <Badge variant="default" className="font-mono tabular-nums">
            p* = {breakevenLabel}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ladder.rungs.map((rung) => (
          <HurdleRungCell key={rung.hurdlePct} rung={rung} />
        ))}
      </div>
    </Card>
  );
}
