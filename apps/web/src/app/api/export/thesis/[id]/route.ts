import { formatGoogleDocHtml, formatThesisMarkdown } from "@kanon/core";
import { getKanonDb, getThesisById } from "@kanon/core/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const format = new URL(request.url).searchParams.get("format") ?? "md";
  const db = await getKanonDb();
  const thesis = await getThesisById(db, id);
  if (!thesis) {
    return NextResponse.json({ error: "未找到该研究标的。" }, { status: 404 });
  }

  const safeSlug = thesis.ticker.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (format === "gdoc") {
    const html = formatGoogleDocHtml(thesis);
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="kanon-${safeSlug}-memo.html"`,
      },
    });
  }

  const markdown = formatThesisMarkdown(thesis);
  return new Response(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="kanon-${safeSlug}-memo.md"`,
    },
  });
}
