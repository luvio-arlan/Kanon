"use client";

import type {
  BusinessFilter,
  FilterVerdict,
  GlossaryTerm,
  SecAnnualFinancial,
  SecQuarterlyFinancial,
  ThesisDetail,
  ThesisStatus,
} from "@kanon/core";
import { Badge, ButtonGroup, ButtonGroupItem, Card } from "@kanon/ui";
import { useMemo } from "react";
import { GlossaryText } from "@/features/glossary";
import { type AutoSaveStatus, useThesisStepDraft } from "@/shared/hooks/use-thesis-step-draft";
import {
  BUSINESS_FILTER_DIMENSIONS as DIMENSIONS,
  type FilterKey,
  BUSINESS_FILTER_VERDICTS as VERDICTS,
} from "../lib/business-filter-config";
import { BusinessFilterNotesCard } from "./business-filter-notes";
import { SecAnnualsTable } from "./sec-annuals-table";
import { VariantPerceptionCard } from "./variant-perception-card";

export interface StepBusinessFilterProps {
  thesis: ThesisDetail;
  glossary: readonly GlossaryTerm[];
  annuals?: readonly SecAnnualFinancial[];
  quarterlies?: readonly SecQuarterlyFinancial[];
  saving: boolean;
  onJumpToStep?: (step: 1 | 2 | 3 | 4 | 5) => void;
  onSyncChange?: (status: AutoSaveStatus, flush: (() => Promise<void>) | null) => void;
  onSave: (
    payload: {
      status: ThesisStatus;
      convictionSummary: string;
      businessFilter: BusinessFilter;
    },
    options?: { silent?: boolean },
  ) => Promise<boolean>;
}

function DimensionRow(props: {
  code: string;
  title: string;
  prompt: string;
  verdict: FilterVerdict;
  glossary: readonly GlossaryTerm[];
  onSelect: (next: FilterVerdict) => void;
}) {
  return (
    <div className="flex flex-col justify-between gap-4 py-5 first:pt-1 last:pb-1 lg:flex-row lg:items-center lg:gap-8">
      <div className="flex min-w-0 items-baseline gap-3.5">
        <span className="w-5 shrink-0 font-mono text-xs text-ink-muted tabular-nums">
          {props.code}
        </span>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold tracking-[-0.01em] text-ink-primary">
            <GlossaryText text={props.title} terms={props.glossary} />
          </div>
          <div className="mt-1 text-sm leading-relaxed text-ink-secondary">
            <GlossaryText text={props.prompt} terms={props.glossary} />
          </div>
        </div>
      </div>
      <ButtonGroup
        ariaLabel={`${props.title} 判定`}
        equalWidth
        className="shrink-0 self-start lg:self-center"
      >
        {VERDICTS.map((opt) => (
          <ButtonGroupItem
            key={opt.id}
            tone={opt.tone}
            showDot
            selected={props.verdict === opt.id}
            onClick={() => props.onSelect(opt.id)}
          >
            {opt.label}
          </ButtonGroupItem>
        ))}
      </ButtonGroup>
    </div>
  );
}

function StepOneMasthead({
  status,
  filter,
  onJumpToStep,
}: {
  status: ThesisStatus;
  filter: BusinessFilter;
  onJumpToStep?: (step: 1 | 2 | 3 | 4 | 5) => void;
}) {
  const hasVeto = Object.values(filter).includes("veto");
  const statusText = status === "archived_veto" ? "已归档" : hasVeto ? "存在排除项" : "通过初筛";
  const statusTone = status === "archived_veto" ? "fail" : hasVeto ? "warn" : "pass";

  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-hairline pb-4">
      <div className="flex items-center gap-3">
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.025em] text-ink-primary">
          商业质量评估
        </h1>
        <Badge variant={statusTone} className="px-2.5 py-1 text-xs">
          {statusText}
        </Badge>
      </div>
      {onJumpToStep ? (
        <div className="flex items-center gap-1.5 text-xs">
          {(
            [
              [3, "先看财务事实 →"],
              [4, "先看隐含预期 →"],
            ] as const
          ).map(([step, label]) => (
            <button
              key={step}
              type="button"
              onClick={() => onJumpToStep(step)}
              className="cursor-pointer rounded-pill border border-hairline bg-surface px-3 py-1 text-ink-secondary transition-[border-color,color,background-color] duration-150 ease-[var(--ease-kanon)] hover:border-strong hover:text-ink-primary active:bg-muted/70"
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </header>
  );
}

interface Step1Draft {
  filter: BusinessFilter;
  summary: string;
}

function isStep1Draft(val: unknown): val is Step1Draft {
  if (!val || typeof val !== "object") return false;
  const rec = val as { filter?: unknown; summary?: unknown };
  return typeof rec.summary === "string" && Boolean(rec.filter && typeof rec.filter === "object");
}

function useStep1Draft(props: StepBusinessFilterProps) {
  const serverValue = useMemo<Step1Draft>(
    () => ({ filter: props.thesis.businessFilter, summary: props.thesis.convictionSummary }),
    [props.thesis.businessFilter, props.thesis.convictionSummary],
  );
  return useThesisStepDraft({
    storageKey: `kanon-draft:${props.thesis.id}:step1`,
    serverValue,
    serverVersion: props.thesis.updatedAt,
    canSaveDraft: (val) => Boolean(val.summary.trim()),
    onSyncChange: props.onSyncChange,
    validateStored: isStep1Draft,
    onSave: (val) =>
      props.onSave(
        { status: props.thesis.status, convictionSummary: val.summary, businessFilter: val.filter },
        { silent: true },
      ),
  });
}

function DimensionsCard({
  filter,
  glossary,
  onSelect,
}: {
  filter: BusinessFilter;
  glossary: readonly GlossaryTerm[];
  onSelect: (key: FilterKey, v: FilterVerdict) => void;
}) {
  return (
    <Card className="divide-y divide-hairline px-6 py-4 sm:px-7">
      {DIMENSIONS.map(({ key, code, title, prompt }) => (
        <DimensionRow
          key={key}
          code={code}
          title={title}
          prompt={prompt}
          verdict={filter[key]}
          glossary={glossary}
          onSelect={(v) => onSelect(key, v)}
        />
      ))}
    </Card>
  );
}

export function StepBusinessFilter(props: StepBusinessFilterProps) {
  const { thesis, glossary, annuals = [], quarterlies = [], saving, onSave } = props;
  const d = useStep1Draft(props);
  const nextStatus: ThesisStatus = thesis.status === "archived_veto" ? "active" : "archived_veto";
  const patchFilter = (patch: Partial<BusinessFilter>) =>
    d.setDraft((prev) => ({ ...prev, filter: { ...prev.filter, ...patch } }));
  const toggleArchive = () =>
    void onSave({
      status: nextStatus,
      convictionSummary: d.draft.summary.trim() || thesis.convictionSummary,
      businessFilter: {
        ...d.draft.filter,
        vetoReason:
          nextStatus === "archived_veto" ? d.draft.filter.notes || "暂未通过商业质量初筛" : "",
      },
    });
  return (
    <div className="space-y-6">
      <StepOneMasthead
        status={thesis.status}
        filter={d.draft.filter}
        onJumpToStep={props.onJumpToStep}
      />
      <DimensionsCard
        filter={d.draft.filter}
        glossary={glossary}
        onSelect={(k, v) => patchFilter({ [k]: v })}
      />
      <VariantPerceptionCard filter={d.draft.filter} onPatch={patchFilter} />
      {annuals.length > 0 ? (
        <SecAnnualsTable annuals={annuals} quarterlies={quarterlies} title="历史财务佐证" />
      ) : null}
      <BusinessFilterNotesCard
        status={thesis.status}
        summary={d.draft.summary}
        notes={d.draft.filter.notes}
        saving={saving}
        onSummary={(summary) => d.setDraft((prev) => ({ ...prev, summary }))}
        onNotes={(notes) => patchFilter({ notes })}
        onToggleArchive={toggleArchive}
      />
    </div>
  );
}
