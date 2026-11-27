"use client";

import type { calculatePiotroskiFScore, SecAnnualFinancial } from "@kanon/core";
import { useMemo } from "react";
import { computeHonestForensics } from "./forensic-scorecard-helpers";

function resolveAltmanTone(zone: "safe" | "grey" | "distress") {
  if (zone === "safe") return "text-status-pass";
  if (zone === "distress") return "text-status-fail";
  return "text-ink-secondary";
}

function resolvePiotroskiTone(grade: ReturnType<typeof calculatePiotroskiFScore>["grade"]) {
  if (grade === "strong") return "text-status-pass";
  if (grade === "weak") return "text-status-fail";
  return "text-ink-primary";
}

function buildAvailableItems(s: NonNullable<ReturnType<typeof computeHonestForensics>>) {
  const items: Array<{ label: string; value: string; tone: string }> = [];
  if (s.beneish) {
    items.push({
      label: "Beneish M",
      value: s.beneish.mScore.toFixed(2),
      tone: s.beneish.flaggedManipulator ? "text-status-warn" : "text-status-pass",
    });
  }
  if (s.altman) {
    items.push({
      label: "Altman Z",
      value: s.altman.score.toFixed(2),
      tone: resolveAltmanTone(s.altman.zone),
    });
  }
  if (s.piotroski) {
    items.push({
      label: "Piotroski F",
      value: `${s.piotroski.score}/9`,
      tone: resolvePiotroskiTone(s.piotroski.grade),
    });
  }
  if (s.dupont) {
    items.push({
      label: "DuPont ROE",
      value: `${s.dupont.roePct.toFixed(1)}%`,
      tone: "text-ink-primary",
    });
  }
  return items;
}

export function ForensicScorecardStrip({
  annuals,
  currentPrice,
  sicCode,
}: {
  annuals: readonly SecAnnualFinancial[];
  currentPrice?: number;
  sicCode?: string;
}) {
  const s = useMemo(
    () => computeHonestForensics(annuals, currentPrice, sicCode),
    [annuals, currentPrice, sicCode],
  );
  if (!s) return null;
  const items = buildAvailableItems(s);
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-hairline bg-canvas/30 px-6 py-2.5 font-mono text-xs tabular-nums">
      {items.map((item) => (
        <span key={item.label} className="text-ink-muted">
          {item.label} <strong className={item.tone}>{item.value}</strong>
        </span>
      ))}
    </div>
  );
}
