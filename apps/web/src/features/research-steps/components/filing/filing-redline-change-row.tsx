"use client";

import type { RedlineChange, RedlineChangeKind } from "@kanon/core";
import { Badge, cn } from "@kanon/ui";
import { IconScissors } from "@tabler/icons-react";

const KIND_LABELS: Record<RedlineChangeKind, string> = {
  added_risk: "新增风险",
  removed_risk: "移除风险",
  hedging_up: "措辞趋紧",
  optimism_removed: "收紧乐观",
  definition_change: "口径变更",
  rewritten: "段落重写",
  numbers_only: "纯数字变动",
};

function badgeVariantForSeverity(
  severity: RedlineChange["severity"],
): "fail" | "warn" | "titanium" {
  if (severity === "critical") return "fail";
  if (severity === "warn") return "warn";
  return "titanium";
}

function buildClipText(change: RedlineChange): string {
  return change.tokens
    .filter((t) => t.op !== "del")
    .map((t) => t.text)
    .join(" ")
    .trim();
}

function ChangeRowHeader({
  change,
  onClip,
}: {
  change: RedlineChange;
  onClip?: (snippet: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={badgeVariantForSeverity(change.severity)}>{KIND_LABELS[change.kind]}</Badge>
        {change.cues.slice(0, 3).map((cue) => (
          <span key={cue} className="font-mono text-xs text-ink-muted">
            {cue}
          </span>
        ))}
      </div>
      {onClip ? (
        <button
          type="button"
          onClick={() => onClip(buildClipText(change))}
          className="inline-flex cursor-pointer items-center gap-1 text-xs text-ink-muted hover:text-ink-primary"
        >
          <IconScissors size={12} stroke={1.5} />
          <span>摘录</span>
        </button>
      ) : null}
    </div>
  );
}

export function FilingRedlineChangeRow({
  change,
  onClip,
}: {
  change: RedlineChange;
  onClip?: (snippet: string) => void;
}) {
  const keyed = change.tokens.reduce<
    Array<{ key: string; op: RedlineChange["tokens"][number]["op"]; text: string }>
  >((acc, tok) => {
    acc.push({ key: `${change.id}:${tok.op}:${acc.length}:${tok.text.slice(0, 16)}`, ...tok });
    return acc;
  }, []);
  return (
    <div className="space-y-1.5 border-b border-hairline py-2.5 last:border-b-0">
      <ChangeRowHeader change={change} onClip={onClip} />
      <p className="text-xs leading-relaxed text-ink-primary">
        {keyed.map((tok) => (
          <span
            key={tok.key}
            className={cn(
              tok.op === "ins" && "rounded-xs bg-status-pass-soft px-0.5 text-status-pass",
              tok.op === "del" &&
                "rounded-xs bg-status-fail-soft px-0.5 text-status-fail line-through",
            )}
          >
            {tok.text}{" "}
          </span>
        ))}
      </p>
    </div>
  );
}
