"use client";

import type { GlossaryTerm, PublicUser, ThesisDetail, ThesisSummary } from "@kanon/core";
import { Button, CommandMenu, DialogModal, useTheme } from "@kanon/ui";
import { IconAlertTriangle, IconArrowLeft, IconArrowRight } from "@tabler/icons-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { useHasOpened } from "@/shared/hooks/use-has-opened";
import { buildCanvasCommandGroups } from "../data/canvas-commands";
import type { useResearchCanvas } from "../hooks/use-research-canvas";
import type { StepId } from "./canvas-chrome";

const AiSettingsModal = dynamic(
  () => import("@/features/ai-settings").then((m) => m.AiSettingsModal),
  { ssr: false },
);

const STEP_NAMES: Record<StepId, string> = {
  1: "商业质量评估",
  2: "核心假设拆解",
  3: "一阶资料印证",
  4: "三情景估值赔率",
  5: "交易纪律与复盘",
};

export function StepFooterNav({
  activeStep,
  onSelectStep,
}: {
  activeStep: StepId;
  onSelectStep: (step: StepId) => void;
}) {
  const prevStep = activeStep > 1 ? ((activeStep - 1) as StepId) : null;
  const nextStep = activeStep < 5 ? ((activeStep + 1) as StepId) : null;

  return (
    <div className="mt-10 flex items-center justify-between gap-4 border-t border-hairline pt-6">
      {prevStep ? (
        <Button variant="outline" size="md" onClick={() => onSelectStep(prevStep)}>
          <IconArrowLeft size={16} stroke={1.5} />
          <span>
            0{prevStep} · {STEP_NAMES[prevStep]}
          </span>
        </Button>
      ) : (
        <span aria-hidden="true" />
      )}
      {nextStep ? (
        <Button variant="titanium" size="md" onClick={() => onSelectStep(nextStep)}>
          <span>
            0{nextStep} · {STEP_NAMES[nextStep]}
          </span>
          <IconArrowRight size={16} stroke={1.5} />
        </Button>
      ) : (
        <span aria-hidden="true" />
      )}
    </div>
  );
}

function DeleteThesisDialog(p: {
  open: boolean;
  thesis: ThesisDetail;
  deleting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <DialogModal
      open={p.open}
      onOpenChange={p.onOpenChange}
      title={`永久删除 ${p.thesis.ticker} 研究档案？`}
      icon={<IconAlertTriangle size={18} stroke={1.5} />}
      footer={
        <>
          <Button variant="outline" size="md" onClick={() => p.onOpenChange(false)}>
            取消
          </Button>
          <Button variant="danger" size="md" disabled={p.deleting} onClick={p.onConfirm}>
            {p.deleting ? "正在删除..." : "确认删除标的"}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-ink-secondary">
        如果仅因商业质量暂未通过初筛，建议留在 Step 1
        点击「暂不纳入并归档」以保留研究复盘记忆；确认不再追踪{" "}
        <span className="font-semibold text-ink-primary">
          {p.thesis.companyName} ({p.thesis.ticker})
        </span>{" "}
        后再执行永久删除。
      </p>
    </DialogModal>
  );
}

export function useCanvasShellActions(params: {
  ctrl: ReturnType<typeof useResearchCanvas>;
  allTheses: readonly ThesisSummary[];
  glossary: readonly GlossaryTerm[];
  onSelectStep: (step: StepId) => void;
  onFlushPending?: () => Promise<void>;
  onToggleFocus: () => void;
  onOpenAgent: () => void;
  onOpenAi: () => void;
  onCloseDelete: () => void;
}) {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const { ctrl, onSelectStep, onFlushPending } = params;
  const commandGroups = useMemo(() => {
    const trigger = (step: StepId, action: "red_team" | "earnings_digest" | "investment_memo") => {
      onSelectStep(step);
      void ctrl.runCopilot(action);
    };
    const navigateSafe = (href: string) => {
      if (onFlushPending) void onFlushPending().finally(() => router.push(href));
      else router.push(href);
    };
    return buildCanvasCommandGroups({
      currentThesis: ctrl.thesis,
      allTheses: params.allTheses,
      glossary: params.glossary,
      theme,
      onSelectStep,
      onSwitchThesis: (id) => navigateSafe(`/thesis/${id}`),
      onGoHome: () => navigateSafe("/"),
      onOpenAgent: params.onOpenAgent,
      onRunRedTeam: () => trigger(2, "red_team"),
      onRunDigest: () => trigger(3, "earnings_digest"),
      onRunMemo: () => trigger(5, "investment_memo"),
      onOpenSettings: params.onOpenAi,
      onToggleFocus: params.onToggleFocus,
      onToggleTheme: toggleTheme,
    });
  }, [ctrl, params, router, onSelectStep, onFlushPending, theme, toggleTheme]);
  async function handleConfirmDelete() {
    if (!(await ctrl.deleteCurrentThesis())) return;
    params.onCloseDelete();
    router.push("/");
    router.refresh();
  }
  return { commandGroups, handleConfirmDelete };
}

export interface CanvasOverlaysProps {
  thesis: ThesisDetail;
  currentUser?: PublicUser;
  deleting: boolean;
  commandOpen: boolean;
  aiModalOpen: boolean;
  deleteOpen: boolean;
  commandGroups: ReturnType<typeof buildCanvasCommandGroups>;
  onCommandOpen: (open: boolean) => void;
  onAiModalOpen: (open: boolean) => void;
  onDeleteOpen: (open: boolean) => void;
  onByokChanged: () => void;
  onConfirmDelete: () => Promise<void>;
}

export function CanvasOverlays(props: CanvasOverlaysProps) {
  const aiMounted = useHasOpened(props.aiModalOpen);
  const ctx = {
    id: props.thesis.id,
    ticker: props.thesis.ticker,
    companyName: props.thesis.companyName,
  };
  return (
    <>
      <CommandMenu
        open={props.commandOpen}
        onOpenChange={props.onCommandOpen}
        groups={props.commandGroups}
        placeholder="搜索步骤、标的或术语..."
      />
      {aiMounted ? (
        <AiSettingsModal
          open={props.aiModalOpen}
          currentUser={props.currentUser}
          onOpenChange={props.onAiModalOpen}
          onChanged={props.onByokChanged}
          thesisContext={ctx}
          onRequestDelete={() => props.onDeleteOpen(true)}
        />
      ) : null}
      <DeleteThesisDialog
        open={props.deleteOpen}
        thesis={props.thesis}
        deleting={props.deleting}
        onOpenChange={props.onDeleteOpen}
        onConfirm={props.onConfirmDelete}
      />
    </>
  );
}
