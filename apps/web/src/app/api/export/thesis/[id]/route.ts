import { formatGoogleDocHtml, formatThesisArchiveJson, formatThesisMarkdown } from "@kanon/core";
import {
  getSecSnapshotForUser,
  getThesisById,
  listAgentRuns,
  listCopilotOutputs,
  listQuarterlyReviews,
  listResearchNotes,
  listThesisRevisions,
} from "@kanon/core/db";
import { requireWorkspaceContext } from "../../../_lib/auth-session";
import { apiHeaders, jsonError } from "../../../_lib/http";
import { requireThesisAccess } from "../../../_lib/thesis-guard";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function buildExportResponse(
  format: string,
  thesis: NonNullable<Awaited<ReturnType<typeof getThesisById>>>,
  extras: Parameters<typeof formatThesisMarkdown>[1],
  startedAt: number,
) {
  const safeSlug = thesis.ticker.toLowerCase().replace(/[^a-z0-9]/g, "") || "thesis";
  if (format === "json") {
    return new Response(formatThesisArchiveJson(thesis, extras), {
      headers: {
        ...apiHeaders(startedAt),
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="kanon-${safeSlug}-archive.json"`,
      },
    });
  }
  if (format === "gdoc") {
    return new Response(formatGoogleDocHtml(thesis, extras), {
      headers: {
        ...apiHeaders(startedAt),
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="kanon-${safeSlug}-memo.html"`,
      },
    });
  }
  return new Response(formatThesisMarkdown(thesis, extras), {
    headers: {
      ...apiHeaders(startedAt),
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="kanon-${safeSlug}-memo.md"`,
    },
  });
}

export async function GET(request: Request, context: RouteContext) {
  const startedAt = performance.now();
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const format = new URL(request.url).searchParams.get("format") ?? "md";
  return auth.withDb(async (tx) => {
    const guard = await requireThesisAccess(tx, id, auth.user.id, "read", startedAt);
    if (!guard.ok) return guard.response;
    const thesis = await getThesisById(tx, id, auth.user.id);
    if (!thesis) return jsonError("未找到该研究标的。", 404, startedAt, "NOT_FOUND");

    const [secSnapshot, revisions, quarterlyReviews, copilotOutputs, agentRuns, researchNotes] =
      await Promise.all([
        getSecSnapshotForUser(tx, thesis.ticker, auth.user.id),
        listThesisRevisions(tx, id, 30),
        listQuarterlyReviews(tx, id),
        listCopilotOutputs(tx, id),
        listAgentRuns(tx, id, 5),
        listResearchNotes(tx, id, 200),
      ]);
    return buildExportResponse(
      format,
      thesis,
      { secSnapshot, revisions, quarterlyReviews, copilotOutputs, agentRuns, researchNotes },
      startedAt,
    );
  });
}
