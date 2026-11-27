import type { ThesisDetail, ThesisRevision, UpdateThesisStepInput } from "@kanon/core";
import { apiGetThesis, apiPatchStep, type ThesisMutationResult } from "./canvas-api";

export interface SerializedPatchDeps {
  thesisId: string;
  latestUpdatedAtRef: React.MutableRefObject<string>;
  patchChainRef: React.MutableRefObject<Promise<void>>;
  withFlag: <T>(key: "saving" | "deleting" | "secSyncing", task: () => Promise<T>) => Promise<T>;
  applyMutation: (res: ThesisMutationResult | null) => void;
  setThesis: React.Dispatch<React.SetStateAction<ThesisDetail>>;
  setRevisions: React.Dispatch<React.SetStateAction<ThesisRevision[]>>;
}

async function syncLatestOnConflict(deps: SerializedPatchDeps) {
  const fresh = await apiGetThesis(deps.thesisId);
  if (!fresh) return;
  deps.latestUpdatedAtRef.current = fresh.thesis.updatedAt;
  deps.setThesis(fresh.thesis);
  if (fresh.revisions) deps.setRevisions(fresh.revisions);
}

export function createSerializedPatchStep(deps: SerializedPatchDeps) {
  const execute = async (
    payload: UpdateThesisStepInput,
    okMessage?: string,
    options?: { silent?: boolean },
  ): Promise<boolean> => {
    const run = () =>
      apiPatchStep(deps.thesisId, payload, okMessage, {
        ...options,
        expectedUpdatedAt: deps.latestUpdatedAtRef.current,
      });
    const out = options?.silent ? await run() : await deps.withFlag("saving", run);
    if (out.kind === "conflict") {
      await syncLatestOnConflict(deps);
      return false;
    }
    if (out.kind !== "ok") return false;
    deps.applyMutation({ thesis: out.thesis, revisions: out.revisions });
    return true;
  };
  return (payload: UpdateThesisStepInput, okMessage?: string, options?: { silent?: boolean }) => {
    const task = deps.patchChainRef.current.then(() => execute(payload, okMessage, options));
    deps.patchChainRef.current = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  };
}
