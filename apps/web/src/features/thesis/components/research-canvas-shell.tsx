"use client";

import type { GlossaryTerm, SecSnapshot, ThesisDetail } from "@kanon/core";
import { useState } from "react";
import { DisciplineJournal } from "@/features/journal";
import { ValuationWorkbench } from "@/features/valuation";
import { useResearchCanvas } from "../hooks/use-research-canvas";
import { CanvasTopbar, type StepId, StepRail } from "./canvas-chrome";
import { StepBusinessFilter } from "./step-business-filter";
import { StepFirstPrinciples } from "./step-first-principles";
import { StepHypotheses } from "./step-hypotheses";

export interface ResearchCanvasShellProps {
  initialThesis: ThesisDetail;
  glossary: readonly GlossaryTerm[];
  initialSecSnapshot: SecSnapshot | null;
}

type CanvasController = ReturnType<typeof useResearchCanvas>;

function renderEarlySteps(
  step: 1 | 2 | 3,
  ctrl: CanvasController,
  glossary: readonly GlossaryTerm[],
) {
  if (step === 1) {
    return (
      <StepBusinessFilter
        thesis={ctrl.thesis}
        glossary={glossary}
        saving={ctrl.saving}
        onSave={(p) =>
          ctrl.patchStep({ step: "business_filter", ...p }, "Step 1 商业模式滤镜已保存")
        }
      />
    );
  }
  if (step === 2) {
    return (
      <StepHypotheses
        thesis={ctrl.thesis}
        glossary={glossary}
        saving={ctrl.saving}
        redTeamLoading={ctrl.copilot.busy === "red_team"}
        redTeam={ctrl.copilot.redTeam}
        onSave={(hypotheses) =>
          ctrl.patchStep({ step: "hypotheses", hypotheses }, "3 条核心假设已保存")
        }
        onRunRedTeam={() => ctrl.runCopilot("red_team")}
      />
    );
  }
  return (
    <StepFirstPrinciples
      thesis={ctrl.thesis}
      glossary={glossary}
      secSnapshot={ctrl.secSnapshot}
      secSyncing={ctrl.secSyncing}
      digestLoading={ctrl.copilot.busy === "earnings_digest"}
      digest={ctrl.copilot.digest}
      saving={ctrl.saving}
      onSyncSec={ctrl.syncSec}
      onRunDigest={() => ctrl.runCopilot("earnings_digest")}
      onSaveCrossChecks={(crossChecks) =>
        ctrl.patchStep({ step: "cross_checks", crossChecks }, "交叉验证记录已保存")
      }
    />
  );
}

function renderLateSteps(step: 4 | 5, ctrl: CanvasController) {
  if (step === 4) {
    return (
      <ValuationWorkbench
        thesis={ctrl.thesis}
        saving={ctrl.saving}
        onSave={(valuationInput) =>
          ctrl.patchStep({ step: "valuation", valuationInput }, "三情景估值赔率已写入数据库")
        }
      />
    );
  }
  return (
    <DisciplineJournal
      thesis={ctrl.thesis}
      submitting={ctrl.saving}
      scriptLoading={ctrl.copilot.busy === "video_script"}
      videoScript={ctrl.copilot.videoScript}
      onSubmitDiscipline={ctrl.submitDiscipline}
      onGenerateScript={() => ctrl.runCopilot("video_script")}
    />
  );
}

export function ResearchCanvasShell({
  initialThesis,
  glossary,
  initialSecSnapshot,
}: ResearchCanvasShellProps) {
  const [activeStep, setActiveStep] = useState<StepId>(1);
  const ctrl = useResearchCanvas(initialThesis, initialSecSnapshot);

  return (
    <div className="kanon-ambient-canvas min-h-dvh">
      <CanvasTopbar thesis={ctrl.thesis} />
      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-6 py-8 sm:px-10 lg:grid-cols-[248px_minmax(0,1fr)]">
        <StepRail activeStep={activeStep} thesis={ctrl.thesis} onSelect={setActiveStep} />
        <section className="min-w-0">
          {activeStep <= 3
            ? renderEarlySteps(activeStep as 1 | 2 | 3, ctrl, glossary)
            : renderLateSteps(activeStep as 4 | 5, ctrl)}
        </section>
      </main>
    </div>
  );
}
