"use client";

import type { CreateQuarterlyReviewInput, QuarterlyReview, ThesisDetail } from "@kanon/core";
import { Badge, Button, Card } from "@kanon/ui";
import { IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { QuarterlyReviewComposer, VERDICT_META } from "./quarterly-review-composer";

export interface QuarterlyReviewPanelProps {
  thesis: ThesisDetail;
  reviews: readonly QuarterlyReview[];
  submitting: boolean;
  onSubmitReview: (input: CreateQuarterlyReviewInput) => Promise<void>;
}

function ReviewHistoryItem({ review }: { review: QuarterlyReview }) {
  return (
    <article className="space-y-3 py-5 first:pt-1 last:pb-1">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="titanium">{review.quarterLabel}</Badge>
          <span className="font-mono text-ink-secondary tabular-nums">
            复盘现价 ${review.priceAtReview.toFixed(2)} → 当期目标 $
            {review.baseTargetAtReview.toFixed(1)}
          </span>
        </div>
        <time className="font-mono text-ink-muted tabular-nums">
          {review.createdAt.slice(0, 16).replace("T", " ")}
        </time>
      </div>
      <p className="text-sm leading-relaxed text-ink-primary">{review.summary}</p>
      <div className="space-y-1.5 rounded-control bg-muted/50 px-3.5 py-3">
        {review.hypothesisVerdicts.map((v) => (
          <div key={v.hypothesisId} className="flex flex-wrap items-baseline gap-2 text-xs">
            <Badge variant={VERDICT_META[v.verdict].badge}>{VERDICT_META[v.verdict].label}</Badge>
            <span className="font-medium text-ink-primary">{v.title}：</span>
            <span className="text-ink-secondary">{v.evidence}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

export function QuarterlyReviewPanel(props: QuarterlyReviewPanelProps) {
  const [composerOpen, setComposerOpen] = useState(props.reviews.length === 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-end">
        <Button variant="primary" size="sm" onClick={() => setComposerOpen((v) => !v)}>
          <IconPlus size={14} stroke={1.5} />
          <span>{composerOpen ? "收起复盘单" : "记录季度复盘"}</span>
        </Button>
      </div>
      {composerOpen ? (
        <QuarterlyReviewComposer
          thesis={props.thesis}
          submitting={props.submitting}
          canCollapse={props.reviews.length > 0}
          onClose={() => setComposerOpen(false)}
          onSubmit={props.onSubmitReview}
        />
      ) : null}
      {props.reviews.length > 0 ? (
        <Card className="px-6 py-4">
          <div className="divide-y divide-hairline">
            {props.reviews.map((r) => (
              <ReviewHistoryItem key={r.id} review={r} />
            ))}
          </div>
        </Card>
      ) : !composerOpen ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-ink-secondary">
            暂无季度复盘记录。点击右上角「记录季度复盘」追踪跨季度基本面演进。
          </p>
        </Card>
      ) : null}
    </div>
  );
}
