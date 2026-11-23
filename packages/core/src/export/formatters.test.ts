import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMemoryKanonDb, type KanonDb } from "../db/client";
import { listTheses } from "../db/thesis-queries";
import { formatGoogleDocHtml, formatPortfolioCsv, formatThesisMarkdown } from "./formatters";

describe("KANON Export Formatters", () => {
  let db: KanonDb;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const mem = await createMemoryKanonDb();
    db = mem.db;
    close = mem.close;
  });

  afterAll(async () => {
    await close();
  });

  it("formats Markdown, escaped Google Doc HTML, and UTF-8 BOM CSV accurately", async () => {
    const theses = await listTheses(db);
    const mu = theses[0];
    expect(mu).toBeDefined();
    if (!mu) return;

    const md = formatThesisMarkdown(mu);
    expect(md).toContain("美光科技 (MU)");
    expect(md).toContain("$175.00");
    expect(md).toContain("3.72×");

    const html = formatGoogleDocHtml({ ...mu, convictionSummary: "<script>alert(1)</script>" });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");

    const csv = formatPortfolioCsv(theses);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("MU,美光科技");
    expect(csv).toContain("NVDA,英伟达");
  });
});
