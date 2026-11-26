export interface SavedModelVersion {
  id: string;
  versionNum: number;
  label: string;
  createdAt: string;
  outputs: Record<string, unknown>;
}

export async function apiListModelVersions(thesisId: string): Promise<SavedModelVersion[]> {
  const res = await fetch(`/api/theses/${thesisId}/model-versions`).catch(() => null);
  if (!res?.ok) return [];
  const raw: unknown = await res.json().catch(() => null);
  if (raw && typeof raw === "object" && Array.isArray((raw as { versions?: unknown }).versions)) {
    return (raw as { versions: SavedModelVersion[] }).versions;
  }
  return [];
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
  const res = await fetch(`/api/theses/${thesisId}/model-versions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => null);
  return Boolean(res?.ok);
}
