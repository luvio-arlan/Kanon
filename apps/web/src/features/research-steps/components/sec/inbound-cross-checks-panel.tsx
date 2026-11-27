"use client";

import type { InboundCrossCheck } from "@kanon/core";
import { Badge, Card } from "@kanon/ui";
import { IconArrowUpRight, IconLink } from "@tabler/icons-react";
import Link from "next/link";

const ALIGNMENT_TONE: Record<InboundCrossCheck["alignment"], "pass" | "fail" | "warn"> = {
  aligned: "pass",
  divergent: "fail",
  pending: "warn",
};

export function InboundCrossChecksPanel({ items }: { items: readonly InboundCrossCheck[] }) {
  if (items.length === 0) return null;
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-hairline px-6 py-3.5 text-xs text-ink-muted">
        <span className="inline-flex items-center gap-1.5 font-medium text-ink-secondary">
          <IconLink size={14} stroke={1.5} />
          <span>关联标的互证</span>
        </span>
        <span className="font-mono tabular-nums">{items.length} 条</span>
      </div>
      <div className="divide-y divide-hairline">
        {items.map((item) => (
          <div key={item.id} className="space-y-1.5 px-6 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <Link
                href={`/thesis/${item.sourceThesisId}`}
                className="inline-flex items-center gap-1 font-semibold text-ink-primary hover:text-accent-coral"
              >
                <span>
                  {item.sourceCompanyName} ({item.sourceTicker})
                </span>
                <IconArrowUpRight size={13} stroke={1.5} />
              </Link>
              <Badge variant={ALIGNMENT_TONE[item.alignment]}>{item.topic}</Badge>
            </div>
            <p className="text-sm leading-relaxed text-ink-secondary">{item.statement}</p>
            <div className="text-xs text-ink-muted">
              {item.sourceAnchor} · {item.takeaway}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
