import { ModelVersionSaveResponseSchema, ModelVersionsListResponseSchema } from "@kanon/core";
import { kanonFetch } from "@/shared/lib/kanon-fetch";

export interface SavedModelVersion {
  id: string;
  versionNum: number;
  label: string;
  createdAt: string;
  outputs: Record<string, unknown>;
}

export async function apiListModelVersions(thesisId: string): Promise<SavedModelVersion[]> {
  const res = await kanonFetch(
    `/api/theses/${thesisId}/model-versions`,
    ModelVersionsListResponseSchema,
  );
  return res.ok ? res.data.versions : [];
}

export async function apiSaveModelVersion(
  thesisId: string,
  payload: {
    label: string;
    modelKind: string;
    inputs: Record<string, unknown>;
    outputs: Record<string, unknown>;
  },
): Promise<boolean> {
  const res = await kanonFetch(
    `/api/theses/${thesisId}/model-versions`,
    ModelVersionSaveResponseSchema,
    { method: "POST", body: payload },
  );
  return res.ok;
}
