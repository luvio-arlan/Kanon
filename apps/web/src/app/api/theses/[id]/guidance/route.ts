import { extractGuidanceDraftsFromText } from "@kanon/ai";
import {
  computeGuidanceCredibility,
  GuidanceLedgerResponseSchema,
  GuidancePatchRequestSchema,
  type GuidancePostRequest,
  GuidancePostRequestSchema,
} from "@kanon/core";
import {
  adoptGuidanceCandidate,
  confirmGuidanceCommitment,
  createGuidanceDraft,
  GuidancePolicyError,
  getSecurityByTicker,
  getThesisById,
  insertAiGuidanceDrafts,
  type KanonDb,
  listGuidanceCommitments,
  listResearchNotes,
  listUnadoptedGuidanceCandidates,
  patchGuidanceDraft,
  recordManualGuidanceActual,
  withdrawGuidanceCommitment,
} from "@kanon/core/db";
import { requireWorkspaceContext } from "../../../_lib/auth-session";
import { formatZodError, jsonError, jsonOk, readJsonBody } from "../../../_lib/http";
import { verifySameOrigin } from "../../../_lib/request-guards";
import { requireThesisAccess } from "../../../_lib/thesis-guard";

export const dynamic = "force-dynamic";

function handlePolicyError(err: unknown, startedAt: number): Response {
  if (err instanceof GuidancePolicyError)
    return jsonError(err.message, err.status, startedAt, err.code);
  throw err;
}

async function loadLedgerPayload(tx: KanonDb, thesisId: string, userId?: string) {
  const [items, thesis] = await Promise.all([
    listGuidanceCommitments(tx, thesisId),
    userId ? getThesisById(tx, thesisId, userId) : Promise.resolve(null),
  ]);
  const sec = thesis ? await getSecurityByTicker(tx, thesis.ticker) : null;
  const candidates = sec ? await listUnadoptedGuidanceCandidates(tx, thesisId, sec.id) : [];
  return GuidanceLedgerResponseSchema.parse({
    items,
    credibility: computeGuidanceCredibility(items),
    candidates,
  });
}

async function applyGuidanceOp(
  tx: KanonDb,
  params: {
    thesisId: string;
    userId: string;
    req: Exclude<GuidancePostRequest, { op: "draft_from_note" }>;
  },
): Promise<boolean> {
  const { thesisId, userId, req } = params;
  if (req.op === "create") {
    const thesis = await getThesisById(tx, thesisId, userId);
    const sec = thesis ? await getSecurityByTicker(tx, thesis.ticker) : null;
    await createGuidanceDraft(tx, {
      thesisId,
      securityId: sec?.id ?? null,
      createdBy: userId,
      input: req.input,
    });
    return true;
  }
  if (req.op === "confirm") {
    await confirmGuidanceCommitment(tx, {
      id: req.id,
      thesisId,
      confirmedBy: userId,
      expectedUpdatedAt: req.expectedUpdatedAt,
    });
    return true;
  }
  if (req.op === "adopt_candidate") {
    await adoptGuidanceCandidate(tx, { thesisId, userId, candidateId: req.candidateId });
    return true;
  }
  if (req.op === "withdraw") return withdrawGuidanceCommitment(tx, { id: req.id, thesisId });
  await recordManualGuidanceActual(tx, {
    id: req.id,
    thesisId,
    actualValue: req.actualValue,
    source: req.source,
  });
  return true;
}

async function loadNoteForExtraction(
  tx: KanonDb,
  params: { thesisId: string; userId: string; noteId: string; startedAt: number },
) {
  const guard = await requireThesisAccess(
    tx,
    params.thesisId,
    params.userId,
    "write",
    params.startedAt,
  );
  if (!guard.ok) return { ok: false as const, response: guard.response };
  const [thesis, notes] = await Promise.all([
    getThesisById(tx, params.thesisId, params.userId),
    listResearchNotes(tx, params.thesisId, 100),
  ]);
  const note = notes.find((n) => n.id === params.noteId);
  if (!thesis || !note) {
    return {
      ok: false as const,
      response: jsonError("未找到对应研究纪要。", 404, params.startedAt, "NOT_FOUND"),
    };
  }
  const sec = await getSecurityByTicker(tx, thesis.ticker);
  return { ok: true as const, note, securityId: sec?.id ?? null };
}

async function handleDraftFromNote(params: {
  withDb: <T>(fn: (tx: KanonDb) => Promise<T>) => Promise<T>;
  thesisId: string;
  userId: string;
  noteId: string;
  startedAt: number;
}): Promise<Response> {
  const loaded = await params.withDb((tx) => loadNoteForExtraction(tx, params));
  if (!loaded.ok) return loaded.response;
  const extracted = extractGuidanceDraftsFromText(loaded.note.content);
  const payload = await params.withDb(async (tx) => {
    const inserted = await insertAiGuidanceDrafts(tx, {
      thesisId: params.thesisId,
      securityId: loaded.securityId,
      createdBy: params.userId,
      noteId: loaded.note.id,
      issuedOn: loaded.note.createdAt.slice(0, 10),
      model: extracted.model,
      promptVersion: extracted.promptVersion,
      drafts: extracted.accepted,
    });
    return {
      ...(await loadLedgerPayload(tx, params.thesisId, params.userId)),
      createdCount: inserted.length,
      rejectedCount: extracted.rejectedCount,
    };
  });
  return jsonOk(payload, params.startedAt, 201);
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const startedAt = performance.now();
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const { id: thesisId } = await context.params;
  const result = await auth.withDb(async (tx) => {
    const guard = await requireThesisAccess(tx, thesisId, auth.user.id, "read", startedAt);
    if (!guard.ok) return { ok: false as const, response: guard.response };
    return { ok: true as const, data: await loadLedgerPayload(tx, thesisId, auth.user.id) };
  });
  return result.ok ? jsonOk(result.data, startedAt) : result.response;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const startedAt = performance.now();
  const originErr = verifySameOrigin(request, startedAt);
  if (originErr) return originErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const { id: thesisId } = await context.params;
  const body = await readJsonBody(request, startedAt);
  if (!body.ok) return body.response;
  const parsed = GuidancePostRequestSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(formatZodError(parsed.error, "指引参数不合法。"), 400, startedAt, "INVALID");
  }
  if (parsed.data.op === "draft_from_note") {
    return handleDraftFromNote({
      withDb: auth.withDb,
      thesisId,
      userId: auth.user.id,
      noteId: parsed.data.noteId,
      startedAt,
    });
  }
  const opReq = parsed.data;
  try {
    const result = await auth.withDb(async (tx) => {
      const guard = await requireThesisAccess(tx, thesisId, auth.user.id, "write", startedAt);
      if (!guard.ok) return { ok: false as const, response: guard.response };
      const ok = await applyGuidanceOp(tx, { thesisId, userId: auth.user.id, req: opReq });
      if (!ok)
        return {
          ok: false as const,
          response: jsonError("指引条目不存在。", 404, startedAt, "NOT_FOUND"),
        };
      return { ok: true as const, data: await loadLedgerPayload(tx, thesisId, auth.user.id) };
    });
    return result.ok
      ? jsonOk(result.data, startedAt, opReq.op === "create" ? 201 : 200)
      : result.response;
  } catch (err) {
    return handlePolicyError(err, startedAt);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const startedAt = performance.now();
  const originErr = verifySameOrigin(request, startedAt);
  if (originErr) return originErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const { id: thesisId } = await context.params;
  const body = await readJsonBody(request, startedAt);
  if (!body.ok) return body.response;
  const parsed = GuidancePatchRequestSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(
      formatZodError(parsed.error, "草稿更新参数不合法。"),
      400,
      startedAt,
      "INVALID",
    );
  }
  try {
    const result = await auth.withDb(async (tx) => {
      const guard = await requireThesisAccess(tx, thesisId, auth.user.id, "write", startedAt);
      if (!guard.ok) return { ok: false as const, response: guard.response };
      await patchGuidanceDraft(tx, thesisId, parsed.data);
      return { ok: true as const, data: await loadLedgerPayload(tx, thesisId, auth.user.id) };
    });
    return result.ok ? jsonOk(result.data, startedAt) : result.response;
  } catch (err) {
    return handlePolicyError(err, startedAt);
  }
}
