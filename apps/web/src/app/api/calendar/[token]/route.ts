import { buildCatalystIcsFeedForUser, resolveCalendarTokenUserId } from "@kanon/core/db";
import { withSystemDb, withUserDb } from "../../_lib/db-context";
import { jsonError } from "../../_lib/http";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ token: string }> }) {
  const startedAt = performance.now();
  const { token } = await ctx.params;
  const clean = token.replace(/\.ics$/i, "").trim();
  if (!clean) return jsonError("日历订阅令牌无效。", 400, startedAt, "INVALID_TOKEN");
  const ownerUserId = await withSystemDb("calendar_feed", (tx) =>
    resolveCalendarTokenUserId(tx, clean),
  );
  if (!ownerUserId) return jsonError("日历订阅令牌不存在。", 404, startedAt, "NOT_FOUND");
  const ics = await withUserDb(ownerUserId, (tx) => buildCatalystIcsFeedForUser(tx, ownerUserId));
  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="kanon-catalysts.ics"',
      "Cache-Control": "private, max-age=300",
    },
  });
}
