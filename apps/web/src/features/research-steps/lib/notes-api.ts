import {
  type CreateResearchNoteInput,
  DeleteOkResponseSchema,
  ManualSecSaveResponseSchema,
  type ResearchNote,
  ResearchNoteCreateResponseSchema,
  type SecSnapshot,
  type UpsertManualSecSnapshotInput,
} from "@kanon/core";
import { toast } from "sonner";
import { kanonFetch } from "@/shared/lib/kanon-fetch";

export async function apiCreateResearchNote(
  thesisId: string,
  input: CreateResearchNoteInput,
): Promise<ResearchNote | null> {
  const res = await kanonFetch(`/api/theses/${thesisId}/notes`, ResearchNoteCreateResponseSchema, {
    method: "POST",
    body: input,
    fallbackError: "归档一手资料失败",
  });
  if (!res.ok) {
    toast.error(res.error);
    return null;
  }
  toast.success(`已归档「${res.data.note.periodLabel} · ${res.data.note.title}」`);
  return res.data.note;
}

export async function apiDeleteResearchNote(thesisId: string, noteId: string): Promise<boolean> {
  const res = await kanonFetch(
    `/api/theses/${thesisId}/notes?noteId=${encodeURIComponent(noteId)}`,
    DeleteOkResponseSchema,
    { method: "DELETE", fallbackError: "移除资料失败" },
  );
  if (!res.ok) {
    toast.error(res.error);
    return false;
  }
  return true;
}

export async function apiSaveManualSecSnapshot(
  ticker: string,
  input: UpsertManualSecSnapshotInput,
): Promise<SecSnapshot | null> {
  const res = await kanonFetch(
    `/api/sec/${encodeURIComponent(ticker)}`,
    ManualSecSaveResponseSchema,
    { method: "PUT", body: input, fallbackError: "保存财务数据失败" },
  );
  if (!res.ok) {
    toast.error(res.error);
    return null;
  }
  toast.success(res.data.notice ?? "已保存手动核验财务数据");
  return res.data.snapshot;
}
