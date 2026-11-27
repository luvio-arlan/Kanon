import {
  getThesisAccess,
  hasThesisCapability,
  type KanonDb,
  type ThesisAccess,
  type ThesisCapability,
} from "@kanon/core/db";
import type { NextResponse } from "next/server";
import { jsonError } from "./http";

export type { ThesisAccess, ThesisCapability };

export async function requireThesisAccess(
  db: KanonDb,
  thesisId: string,
  userId: string,
  need: ThesisCapability,
  startedAt: number,
): Promise<{ ok: true; access: ThesisAccess } | { ok: false; response: NextResponse }> {
  const access = await getThesisAccess(db, thesisId, userId);
  if (!access) {
    return {
      ok: false,
      response: jsonError("未找到对应研究标的。", 404, startedAt, "NOT_FOUND"),
    };
  }
  if (!hasThesisCapability(access, need)) {
    return {
      ok: false,
      response: jsonError("权限不足：当前角色无权执行此操作。", 403, startedAt, "FORBIDDEN"),
    };
  }
  return { ok: true, access };
}
