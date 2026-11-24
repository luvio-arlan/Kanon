import type { Hypothesis } from "@kanon/core";

export function isHypothesisArray(val: unknown): val is Hypothesis[] {
  return Array.isArray(val) && val.length >= 3 && val.length <= 5;
}

export function buildExtraHypothesis(thesisId: string, nextNum: number): Hypothesis {
  return {
    id: `${thesisId}-h${nextNum}-${Date.now().toString(36).slice(-4)}`,
    title: "补充核心增长引擎或竞争格局假设",
    metricLabel: "分部收入 / 份额",
    threshold: "待设定量化红线",
    status: "watching",
    note: "记录未来 2–4 个季度用于验证该前提的一阶财报指标。",
  };
}

export function swapHypotheses(prev: Hypothesis[], idx: number, delta: -1 | 1): Hypothesis[] {
  const target = idx + delta;
  if (target < 0 || target >= prev.length) return prev;
  const copy = [...prev];
  const moved = copy[idx];
  const swapped = copy[target];
  if (!moved || !swapped) return prev;
  copy[idx] = swapped;
  copy[target] = moved;
  return copy;
}
