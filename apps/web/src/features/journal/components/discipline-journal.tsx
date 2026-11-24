"use client";

import type {
  CreateDisciplineEntryInput,
  CreateQuarterlyReviewInput,
  InvestmentMemo,
  QuarterlyReview,
  ThesisDetail,
  ThesisRevision,
} from "@kanon/core";
import { Button, KANON_LENS_VARIANTS, KANON_TRANSITION_FAST, SegmentedTabs } from "@kanon/ui";
import { IconPlus } from "@tabler/icons-react";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { DecisionComposerCard } from "./discipline-composer";
import { DisciplineTimeline } from "./discipline-timeline";
import { InvestmentMemoCard } from "./investment-memo-card";
import { QuarterlyReviewPanel } from "./quarterly-review-panel";
import { RevisionTimeline } from "./revision-timeline";

export interface DisciplineJournalProps {
  thesis: ThesisDetail;
  revisions: readonly ThesisRevision[];
  reviews: readonly QuarterlyReview[];
  submitting: boolean;
  memoLoading: boolean;
  investmentMemo: InvestmentMemo | null;
  redTeamExitSuggestion?: string;
  promotedExitRule?: string | null;
  onClearPromotedRule?: () => void;
  onSubmitDiscipline: (entry: CreateDisciplineEntryInput) => Promise<void>;
  onSubmitReview: (input: CreateQuarterlyReviewInput) => Promise<void>;
  onGenerateMemo: () => Promise<void>;
}

type Step5Tab = "ledger" | "reviews" | "memo" | "revisions";

function Step5Header() {
  return (
    <div>
      <h2 className="text-lg font-semibold text-ink-primary">Step 5 · 交易纪律与投研备忘录</h2>
      <p className="mt-0.5 text-sm text-ink-secondary">
        每次建仓或调仓前先签零杠杆铁律与离场红线，凝练一页纸 IC Memo 并追踪跨季度研究演进
      </p>
    </div>
  );
}

function LedgerPanel(
  props: DisciplineJournalProps & { composerOpen: boolean; onCloseComposer: () => void },
) {
  const motionKey = props.promotedExitRule
    ? `promo-${props.promotedExitRule.slice(0, 12)}`
    : "composer";
  return (
    <div className="space-y-5">
      <AnimatePresence initial={false}>
        {props.composerOpen ? (
          <motion.div
            key={motionKey}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={KANON_TRANSITION_FAST}
          >
            <DecisionComposerCard
              defaultPrice={props.thesis.currentPrice}
              initialExitRule={props.promotedExitRule}
              submitting={props.submitting}
              redTeamExitSuggestion={props.redTeamExitSuggestion}
              canCollapse={props.thesis.disciplineEntries.length > 0}
              onClose={props.onCloseComposer}
              onSubmit={props.onSubmitDiscipline}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
      <DisciplineTimeline
        entries={props.thesis.disciplineEntries}
        currentPrice={props.thesis.currentPrice}
      />
    </div>
  );
}

function Step5TabContent(
  props: DisciplineJournalProps & {
    tab: Step5Tab;
    composerOpen: boolean;
    onCloseComposer: () => void;
  },
) {
  if (props.tab === "reviews") {
    return (
      <QuarterlyReviewPanel
        thesis={props.thesis}
        reviews={props.reviews}
        submitting={props.submitting}
        onSubmitReview={props.onSubmitReview}
      />
    );
  }
  if (props.tab === "memo") {
    return (
      <InvestmentMemoCard
        thesisId={props.thesis.id}
        memo={props.investmentMemo}
        loading={props.memoLoading}
        onGenerate={props.onGenerateMemo}
      />
    );
  }
  if (props.tab === "revisions") {
    return <RevisionTimeline revisions={props.revisions} />;
  }
  return <LedgerPanel {...props} />;
}

function Step5AnimatedTab(
  props: DisciplineJournalProps & {
    tab: Step5Tab;
    composerOpen: boolean;
    onCloseComposer: () => void;
  },
) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={props.tab}
        variants={KANON_LENS_VARIANTS}
        initial="enter"
        animate="center"
        exit="exit"
      >
        <Step5TabContent {...props} />
      </motion.div>
    </AnimatePresence>
  );
}

export function DisciplineJournal(props: DisciplineJournalProps) {
  const [tab, setTab] = useState<Step5Tab>("ledger");
  const [composerOpen, setComposerOpen] = useState(
    props.thesis.disciplineEntries.length === 0 || Boolean(props.promotedExitRule),
  );
  const closeComposer = () => {
    setComposerOpen(false);
    props.onClearPromotedRule?.();
  };

  return (
    <div className="space-y-6">
      <Step5Header />
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <SegmentedTabs
          layoutId="step5-mode-tabs"
          value={tab}
          onChange={setTab}
          items={[
            { id: "ledger", label: "交易纪律台账", count: props.thesis.disciplineEntries.length },
            { id: "reviews", label: "季度复盘", count: props.reviews.length },
            { id: "memo", label: "投研备忘录" },
            { id: "revisions", label: "演进日志", count: props.revisions.length },
          ]}
        />
        {tab === "ledger" ? (
          <Button variant="primary" size="sm" onClick={() => setComposerOpen((v) => !v)}>
            <IconPlus size={14} stroke={1.5} />
            <span>{composerOpen ? "收起记录单" : "记录新决策"}</span>
          </Button>
        ) : null}
      </div>
      <Step5AnimatedTab
        {...props}
        tab={tab}
        composerOpen={composerOpen}
        onCloseComposer={closeComposer}
      />
    </div>
  );
}
