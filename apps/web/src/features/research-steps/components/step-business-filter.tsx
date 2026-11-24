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
import { Badge, Card, cn } from "@kanon/ui";
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

const DIMENSIONS: ReadonlyArray<{ key: FilterKey; title: string; prompt: string }> = [
  {
    key: "recurringRevenue",
    title: "复购性与「水电煤」属性",
    prompt: "客户是否具备高粘性复购或长期锁单特征，还是每年必须从零重新找客户？",
  },
  {
    key: "pricingPower",
    title: "上下游定价权与 Moat 护城河",
    prompt: "在成本通胀或行业低谷时，公司能否守住 Gross Margin 并把压力传导给上下游？",
  },
  {
    key: "capitalReturn",
    title: "ROIC 与自由现金流（FCF）质量",
    prompt: "赚到的是真金白银的 FCF，还是不断靠巨额 CapEx 续命的纸面利润？",
  },
  {
    key: "governance",
    title: "管理层诚信与资本配置纪律",
    prompt: "管理层是否诚实面对 10-K 风险、审慎扩产，并合理执行回购与研发投入？",
  },
];

const VERDICTS: ReadonlyArray<{ id: FilterVerdict; label: string; activeClass: string }> = [
  {
    id: "pass",
    label: "通过",
    activeClass: "border-status-pass bg-status-pass-soft text-status-pass",
  },
  {
    id: "watch",
    label: "待观察",
    activeClass: "border-status-warn bg-status-warn-soft text-status-warn",
  },
  {
    id: "veto",
    label: "一票否决",
    activeClass: "border-status-fail bg-status-fail-soft text-status-fail",
  },
];

function DimensionRow(props: {
  title: string;
  prompt: string;
  verdict: FilterVerdict;
  glossary: readonly GlossaryTerm[];
  onSelect: (next: FilterVerdict) => void;
}) {
  return (
    <div className="flex flex-col justify-between gap-4 border-b border-hairline py-4 last:border-none sm:flex-row sm:items-center">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-ink-primary">
          <GlossaryText text={props.title} terms={props.glossary} />
        </div>
        <div className="mt-1 text-xs leading-relaxed text-ink-secondary">
          <GlossaryText text={props.prompt} terms={props.glossary} />
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {VERDICTS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => props.onSelect(opt.id)}
            className={cn(
              "cursor-pointer rounded-pill border px-3 py-1 text-xs font-medium transition-colors",
              props.verdict === opt.id
                ? opt.activeClass
                : "border-hairline bg-surface text-ink-secondary hover:border-strong hover:text-ink-primary",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function FilterMatrixCard(props: {
  status: ThesisStatus;
  filter: BusinessFilter;
  glossary: readonly GlossaryTerm[];
  onSelect: (key: FilterKey, verdict: FilterVerdict) => void;
}) {
  const hasVeto = Object.values(props.filter).includes("veto");
  const statusText =
    props.status === "archived_veto" ? "已否决归档" : hasVeto ? "存在否决项" : "通过初筛";
  const statusTone = props.status === "archived_veto" ? "fail" : hasVeto ? "warn" : "pass";

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
        <div>
          <h2 className="text-lg font-semibold text-ink-primary">Step 1 · 商业模式滤镜</h2>
          <p className="mt-0.5 text-xs text-ink-muted">先排除烂生意，再投入深度研究</p>
        </div>
        <Badge variant={statusTone}>{statusText}</Badge>
      </div>
      <div className="mt-3">
        {DIMENSIONS.map((dim) => (
          <DimensionRow
            key={dim.key}
            title={dim.title}
            prompt={dim.prompt}
            verdict={props.filter[dim.key]}
            glossary={props.glossary}
            onSelect={(v) => props.onSelect(dim.key, v)}
          />
        ))}
      </div>
    </Card>
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

export function StepBusinessFilter(props: StepBusinessFilterProps) {
  const { thesis, glossary, annuals = [], quarterlies = [], saving, onSave } = props;
  const d = useStep1Draft(props);
  const nextStatus: ThesisStatus = thesis.status === "archived_veto" ? "active" : "archived_veto";
  const vetoReason = nextStatus === "archived_veto" ? d.draft.filter.notes || "商业模式未通过" : "";
  const patchFilter = (patch: Partial<BusinessFilter>) =>
    d.setDraft((prev) => ({ ...prev, filter: { ...prev.filter, ...patch } }));

  return (
    <div className="space-y-6">
      <DraftStatusBar draft={d} saving={saving} />
      <FilterMatrixCard
        status={thesis.status}
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
