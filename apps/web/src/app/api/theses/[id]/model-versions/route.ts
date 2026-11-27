import { listModelVersions, saveModelVersion } from "@kanon/core/db";
import { requireWorkspaceContext } from "../../../_lib/auth-session";
import { jsonError, jsonOk } from "../../../_lib/http";
import { verifySameOrigin } from "../../../_lib/request-guards";
import { requireThesisAccess } from "../../../_lib/thesis-guard";

export const dynamic = "force-dynamic";

function parseSaveVersionBody(raw: unknown): {
  label: string;
  modelKind: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  notes: string;
} | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (!rec.inputs || typeof rec.inputs !== "object" || Array.isArray(rec.inputs)) return null;
  if (!rec.outputs || typeof rec.outputs !== "object" || Array.isArray(rec.outputs)) return null;
  return {
    label: typeof rec.label === "string" ? rec.label.slice(0, 80) : "",
    modelKind: typeof rec.modelKind === "string" ? rec.modelKind.slice(0, 40) : "fcff_dcf",
    inputs: rec.inputs as Record<string, unknown>,
    outputs: rec.outputs as Record<string, unknown>,
    notes: typeof rec.notes === "string" ? rec.notes.slice(0, 500) : "",
  };
}

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const startedAt = performance.now();
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  return auth.withDb(async (tx) => {
    const guard = await requireThesisAccess(tx, id, auth.user.id, "read", startedAt);
    if (!guard.ok) return guard.response;
    const versions = await listModelVersions(tx, id);
    return jsonOk({ versions }, startedAt);
  });
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const startedAt = performance.now();
  const csrfErr = verifySameOrigin(request, startedAt);
  if (csrfErr) return csrfErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const parsed = parseSaveVersionBody(await request.json().catch(() => null));
  if (!parsed) {
    return jsonError("请提供有效的模型输入与输出快照。", 400, startedAt, "INVALID_MODEL_VERSION");
  }
  return auth.withDb(async (tx) => {
    const guard = await requireThesisAccess(tx, id, auth.user.id, "write", startedAt);
    if (!guard.ok) return guard.response;
    const version = await saveModelVersion(tx, {
      thesisId: id,
      userId: auth.user.id,
      ...parsed,
    });
    return jsonOk({ version }, startedAt, 201);
  });
}
