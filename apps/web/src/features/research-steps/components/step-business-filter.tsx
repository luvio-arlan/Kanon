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
import { Badge, ButtonGroup, ButtonGroupItem, type ButtonGroupTone, Card } from "@kanon/ui";
import { useMemo } from "react";
import { GlossaryText } from "@/features/glossary";
import { DraftStatusBar } from "@/shared/components/draft-status-bar";
import { useThesisStepDraft } from "@/shared/hooks/use-thesis-step-draft";
import { BusinessFilterNotesCard } from "./business-filter-notes";
import { SecAnnualsTable } from "./sec-annuals-table";
import { VariantPerceptionCard } from "./variant-perception-card";

export interface StepBusinessFilterProps {
  thesis: ThesisDetail;
  glossary: readonly GlossaryTerm[];
  annuals?: readonly SecAnnualFinancial[];
  quarterlies?: readonly SecQuarterlyFinancial[];
  saving: boolean;
  onDirtyChange?: (dirty: boolean, saveAction: (() => Promise<void>) | null) => void;
  onSave: (payload: {
    status: ThesisStatus;
    convictionSummary: string;
    businessFilter: BusinessFilter;
  }) => Promise<void>;
}

type FilterKey = "recurringRevenue" | "pricingPower" | "capitalReturn" | "governance";

const DIMENSIONS: ReadonlyArray<{ code: string; key: FilterKey; title: string; prompt: string }> = [
  {
    code: "01",
    key: "recurringRevenue",
    title: "收入韧性与客户粘性",
    prompt: "客户是否具备高留存复购或长期合约特征，而非每年重新获客？",
  },
  {
    code: "02",
    key: "pricingPower",
    title: "定价权与竞争壁垒",
    prompt: "在成本通胀或行业低谷期，能否守住 Gross Margin 并向产业链传导成本？",
  },
  {
    code: "03",
    key: "capitalReturn",
    title: "资本回报与现金流质量",
    prompt: "账面盈利是否转化为真实 FCF，ROIC 能否持续高于资本成本且避免高强度 CapEx 消耗？",
  },
  {
    code: "04",
    key: "governance",
    title: "治理透明度与资本配置",
    prompt: "管理层是否坦诚披露 10-K 风险、审慎扩产并保持理性回购与研发投入？",
  },
];

const VERDICTS: ReadonlyArray<{ id: FilterVerdict; label: string; tone: ButtonGroupTone }> = [
  { id: "pass", label: "通过", tone: "pass" },
  { id: "watch", label: "观察", tone: "warn" },
  { id: "veto", label: "排除", tone: "fail" },
];

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
      <ButtonGroup ariaLabel={`${props.title} 判定`} className="shrink-0 self-start lg:self-center">
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

function StepOneMasthead({ status, filter }: { status: ThesisStatus; filter: BusinessFilter }) {
  const hasVeto = Object.values(filter).includes("veto");
  const statusText = status === "archived_veto" ? "已归档" : hasVeto ? "存在排除项" : "通过初筛";
  const statusTone = status === "archived_veto" ? "fail" : hasVeto ? "warn" : "pass";

  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-hairline pb-5">
      <div className="space-y-2">
        <div className="flex items-center gap-2.5">
          <span className="h-[1.5px] w-7 bg-accent-coral" />
          <span className="font-mono text-xs tracking-[0.12em] text-ink-muted">STEP 01</span>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.025em] text-ink-primary">
            商业质量评估
          </h1>
          <span className="kanon-editorial-subtitle text-xl">Quality Assessment</span>
        </div>
      </div>
      <Badge variant={statusTone} className="px-2.5 py-1.5 text-xs">
        {statusText}
      </Badge>
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
    canSave: !props.saving,
    onDirtyChange: props.onDirtyChange,
    validateStored: isStep1Draft,
    onSave: (val) =>
      props.onSave({
        status: props.thesis.status,
        convictionSummary: val.summary,
        businessFilter: val.filter,
      }),
  });
}

function DimensionsMatrixCard({
  filter,
  glossary,
  onSelect,
}: {
  filter: BusinessFilter;
  glossary: readonly GlossaryTerm[];
  onSelect: (key: FilterKey, verdict: FilterVerdict) => void;
}) {
  return (
    <Card className="divide-y divide-hairline px-6 py-4 sm:px-8">
      {DIMENSIONS.map((dim) => (
        <DimensionRow
          key={dim.key}
          code={dim.code}
          title={dim.title}
          prompt={dim.prompt}
          verdict={filter[dim.key]}
          glossary={glossary}
          onSelect={(v) => onSelect(dim.key, v)}
        />
      ))}
    </Card>
  );
}

export function StepBusinessFilter(props: StepBusinessFilterProps) {
  const { thesis, glossary, annuals = [], quarterlies = [], saving, onSave } = props;
  const d = useStep1Draft(props);
  const nextStatus: ThesisStatus = thesis.status === "archived_veto" ? "active" : "archived_veto";
  const vetoReason =
    nextStatus === "archived_veto" ? d.draft.filter.notes || "暂未通过商业质量初筛" : "";
  const patchFilter = (patch: Partial<BusinessFilter>) =>
    d.setDraft((prev) => ({ ...prev, filter: { ...prev.filter, ...patch } }));

  return (
    <div className="space-y-7">
      <DraftStatusBar draft={d} saving={saving} />
      <StepOneMasthead status={thesis.status} filter={d.draft.filter} />
      <DimensionsMatrixCard
        filter={d.draft.filter}
        glossary={glossary}
        onSelect={(key, verdict) => patchFilter({ [key]: verdict })}
      />
      <VariantPerceptionCard filter={d.draft.filter} onPatch={patchFilter} />
      {annuals.length > 0 ? (
        <SecAnnualsTable
          annuals={annuals}
          quarterlies={quarterlies}
          title="历史财务基本盘佐证（SEC 10-K/Q）"
        />
      ) : null}
      <BusinessFilterNotesCard
        status={thesis.status}
        summary={d.draft.summary}
        notes={d.draft.filter.notes}
        saving={saving}
        onSummary={(summary) => d.setDraft((prev) => ({ ...prev, summary }))}
        onNotes={(notes) => patchFilter({ notes })}
        onToggleArchive={() =>
          onSave({
            status: nextStatus,
            convictionSummary: d.draft.summary,
            businessFilter: { ...d.draft.filter, vetoReason },
          })
        }
        onSave={() => void d.save()}
      />
    </div>
  );
}
