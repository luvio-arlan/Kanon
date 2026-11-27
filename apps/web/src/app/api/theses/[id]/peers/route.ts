import { TickerSymbolSchema } from "@kanon/core";
import {
  getKanonDb,
  listThesisPeers,
  removeThesisPeer,
  type ThesisPeerRole,
  upsertThesisPeer,
} from "@kanon/core/db";
import { requireWorkspaceContext } from "../../../_lib/auth-session";
import { jsonError, jsonOk } from "../../../_lib/http";
import { verifySameOrigin } from "../../../_lib/request-guards";
import { requireThesisAccess } from "../../../_lib/thesis-guard";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = new Set<ThesisPeerRole>(["peer", "customer", "supplier", "competitor"]);

function parseAddPeerBody(raw: unknown): { ticker: string; role: ThesisPeerRole } | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const parsedTicker = TickerSymbolSchema.safeParse(rec.ticker);
  if (!parsedTicker.success) return null;
  const roleRaw = typeof rec.role === "string" ? rec.role : "peer";
  const role: ThesisPeerRole = ALLOWED_ROLES.has(roleRaw as ThesisPeerRole)
    ? (roleRaw as ThesisPeerRole)
    : "peer";
  return { ticker: parsedTicker.data, role };
}

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const startedAt = performance.now();
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const db = await getKanonDb();
  const guard = await requireThesisAccess(db, id, auth.user.id, "read", startedAt);
  if (!guard.ok) return guard.response;
  const peers = await listThesisPeers(db, id);
  return jsonOk({ peers }, startedAt);
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const startedAt = performance.now();
  const csrfErr = verifySameOrigin(request, startedAt);
  if (csrfErr) return csrfErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const db = await getKanonDb();
  const guard = await requireThesisAccess(db, id, auth.user.id, "write", startedAt);
  if (!guard.ok) return guard.response;
  const raw = await request.json().catch(() => null);
  const parsed = parseAddPeerBody(raw);
  if (!parsed) {
    return jsonError("请输入有效的同行标的代码。", 400, startedAt, "INVALID_PEER");
  }
  const peer = await upsertThesisPeer(db, {
    thesisId: id,
    ticker: parsed.ticker,
    role: parsed.role,
    addedBy: auth.user.id,
  });
  const peers = await listThesisPeers(db, id);
  return jsonOk({ peer, peers }, startedAt, 201);
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const startedAt = performance.now();
  const csrfErr = verifySameOrigin(request, startedAt);
  if (csrfErr) return csrfErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const db = await getKanonDb();
  const guard = await requireThesisAccess(db, id, auth.user.id, "write", startedAt);
  if (!guard.ok) return guard.response;
  const ticker = new URL(request.url).searchParams.get("ticker") ?? "";
  const parsedTicker = TickerSymbolSchema.safeParse(ticker);
  if (!parsedTicker.success) {
    return jsonError("请提供需移除的同行标的代码 ticker。", 400, startedAt, "INVALID_PEER");
  }
  const removed = await removeThesisPeer(db, id, parsedTicker.data);
  return jsonOk({ ok: true, removed }, startedAt);
}
