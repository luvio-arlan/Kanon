"use client";

import { Button, Input } from "@kanon/ui";
import { useState } from "react";

function ProbNumberInput(p: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <Input
      aria-label={p.label}
      type="number"
      min={5}
      max={90}
      value={p.value}
      onChange={(e) => p.onChange(Number(e.target.value) || 0)}
      className="h-6 w-12 px-1.5 font-mono text-xs tabular-nums"
    />
  );
}

export function CustomProbabilityPopover(props: {
  bearProb: number;
  baseProb: number;
  bullProb: number;
  onApply: (bearPct: number, basePct: number, bullPct: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [bear, setBear] = useState(() => Math.round(props.bearProb * 100));
  const [base, setBase] = useState(() => Math.round(props.baseProb * 100));
  const [bull, setBull] = useState(() => Math.round(props.bullProb * 100));
  const openEditor = () => {
    setBear(Math.round(props.bearProb * 100));
    setBase(Math.round(props.baseProb * 100));
    setBull(Math.round(props.bullProb * 100));
    setOpen(true);
  };
  if (!open) {
    return (
      <button
        type="button"
        onClick={openEditor}
        className="cursor-pointer rounded-pill border border-hairline bg-surface px-2.5 py-1 text-xs text-ink-secondary hover:border-strong hover:text-ink-primary"
      >
        自定义
      </button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-pill border border-strong bg-surface px-2.5 py-1">
      <ProbNumberInput label="悲观概率" value={bear} onChange={setBear} />
      <span className="text-xs text-ink-muted">/</span>
      <ProbNumberInput label="中性概率" value={base} onChange={setBase} />
      <span className="text-xs text-ink-muted">/</span>
      <ProbNumberInput label="乐观概率" value={bull} onChange={setBull} />
      <Button
        variant="titanium"
        size="xs"
        onClick={() => {
          props.onApply(bear, base, bull);
          setOpen(false);
        }}
      >
        应用
      </Button>
      <Button variant="ghost" size="xs" onClick={() => setOpen(false)}>
        取消
      </Button>
    </div>
  );
}
