"use client";

import type { GlossaryTerm, ThesisDetail, ThesisSummary } from "@kanon/core";
import { Button, CommandMenu, DialogModal, useTheme } from "@kanon/ui";
import { IconAlertTriangle, IconArrowLeft, IconArrowRight } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { AiSettingsModal } from "@/features/ai-settings";
import { buildCanvasCommandGroups } from "../data/canvas-commands";
import type { useResearchCanvas } from "../hooks/use-research-canvas";
import type { StepId } from "./canvas-chrome";

const STEP_NAMES: Record<StepId, string> = {
  1: "商业模式滤镜",
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
    <div className="mt-8 flex items-center justify-between gap-4 border-t border-hairline pt-6">
      {prevStep ? (
        <Button variant="outline" size="md" onClick={() => onSelectStep(prevStep)}>
          <IconArrowLeft size={15} stroke={1.5} />
          <span>上一步：{STEP_NAMES[prevStep]}</span>
        </Button>
      ) : (
        <span className="text-xs text-ink-muted">已完成起点：请先排除烂生意，再拆解核心假设</span>
      )}
      {nextStep ? (
        <Button variant="titanium" size="md" onClick={() => onSelectStep(nextStep)}>
          <span>下一步：{STEP_NAMES[nextStep]}</span>
          <IconArrowRight size={15} stroke={1.5} />
        </Button>
      ) : (
        <span className="text-xs text-ink-muted">已抵达五步闭环终点 · 可生成备忘录归档</span>
      )}
    </div>
  );
}

function DeleteThesisDialog({
  open,
  companyName,
  ticker,
  deleting,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  companyName: string;
  ticker: string;
  deleting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <DialogModal
      open={open}
      onOpenChange={onOpenChange}
      title={`永久删除 ${ticker} 研究档案？`}
      subtitle="删除后该标的的滤镜、假设、估值与纪律记录将被彻底清除"
      icon={<IconAlertTriangle size={18} stroke={1.5} />}
      footer={
        <>
          <Button variant="outline" size="md" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            variant="coral"
            size="md"
            disabled={deleting}
            onClick={onConfirm}
            className="border-status-fail/40 bg-status-fail-soft text-status-fail hover:border-status-fail"
          >
            {deleting ? "正在删除..." : "确认删除标的"}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-ink-secondary">
        如果只是商业模式未通过初筛，建议留在 Step 1
        点击「一票否决归档」以保留您的研究复盘记忆；确认不再追踪{" "}
        <span className="font-semibold text-ink-primary">
          {companyName} ({ticker})
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
  onToggleFocus: () => void;
  onOpenAgent: () => void;
  onOpenAi: () => void;
  onCloseDelete: () => void;
}) {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const { ctrl, onSelectStep } = params;
  const trigger = (step: StepId, action: "red_team" | "earnings_digest" | "investment_memo") => {
    onSelectStep(step);
    void ctrl.runCopilot(action);
  };
  const commandGroups = buildCanvasCommandGroups({
    currentThesis: ctrl.thesis,
    allTheses: params.allTheses,
    glossary: params.glossary,
    theme,
    onSelectStep,
    onSwitchThesis: (id) => router.push(`/thesis/${id}`),
    onGoHome: () => router.push("/"),
    onOpenAgent: params.onOpenAgent,
    onRunRedTeam: () => trigger(2, "red_team"),
    onRunDigest: () => trigger(3, "earnings_digest"),
    onRunMemo: () => trigger(5, "investment_memo"),
    onOpenAiSettings: params.onOpenAi,
    onToggleFocus: params.onToggleFocus,
    onExportMd: () => window.location.assign(`/api/export/thesis/${ctrl.thesis.id}?format=md`),
    onExportGdoc: () => window.location.assign(`/api/export/thesis/${ctrl.thesis.id}?format=gdoc`),
    onToggleTheme: toggleTheme,
  });
  async function handleConfirmDelete() {
    if (!(await ctrl.deleteCurrentThesis())) return;
    params.onCloseDelete();
    router.push("/");
    router.refresh();
  }
  return { commandGroups, handleConfirmDelete };
}

function UnsavedChangesDialog(props: {
  open: boolean;
  saving: boolean;
  onResolve: (mode: "save" | "discard" | "cancel") => Promise<void>;
}) {
  return (
    <DialogModal
      open={props.open}
      onOpenChange={(open) => {
        if (!open) void props.onResolve("cancel");
      }}
      title="当前步骤有未保存修改"
      subtitle="草稿已暂存本地，建议保存后再切换"
      icon={<IconAlertTriangle size={18} stroke={1.5} />}
      footer={
        <>
          <Button variant="ghost" size="md" onClick={() => void props.onResolve("discard")}>
            放弃修改
          </Button>
          <Button variant="outline" size="md" onClick={() => void props.onResolve("cancel")}>
            继续编辑
          </Button>
          <Button
            variant="primary"
            size="md"
            disabled={props.saving}
            onClick={() => void props.onResolve("save")}
          >
            {props.saving ? "保存中..." : "保存并切换"}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-ink-secondary">
        你可以点击「保存并切换」同步保存后跳转，或按 <kbd className="font-mono">⌘S</kbd> 快速保存。
      </p>
    </DialogModal>
  );
}

export function CanvasOverlays(props: {
  thesis: ThesisDetail;
  deleting: boolean;
  saving: boolean;
  commandOpen: boolean;
  aiModalOpen: boolean;
  deleteOpen: boolean;
  unsavedOpen: boolean;
  commandGroups: ReturnType<typeof buildCanvasCommandGroups>;
  onCommandOpen: (open: boolean) => void;
  onAiModalOpen: (open: boolean) => void;
  onDeleteOpen: (open: boolean) => void;
  onResolveUnsaved: (mode: "save" | "discard" | "cancel") => Promise<void>;
  onByokChanged: () => void;
  onConfirmDelete: () => Promise<void>;
}) {
  return (
    <>
      <CommandMenu
        open={props.commandOpen}
        onOpenChange={props.onCommandOpen}
        groups={props.commandGroups}
        placeholder="跳转五步画布、触发副驾驶、切换标的或速查行业术语..."
      />
      <AiSettingsModal
        open={props.aiModalOpen}
        onOpenChange={props.onAiModalOpen}
        onChanged={props.onByokChanged}
      />
      <DeleteThesisDialog
        open={props.deleteOpen}
        companyName={props.thesis.companyName}
        ticker={props.thesis.ticker}
        deleting={props.deleting}
        onOpenChange={props.onDeleteOpen}
        onConfirm={props.onConfirmDelete}
      />
      <UnsavedChangesDialog
        open={props.unsavedOpen}
        saving={props.saving}
        onResolve={props.onResolveUnsaved}
      />
    </>
  );
}
