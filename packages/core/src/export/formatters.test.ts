import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMemoryKanonDb, type KanonDb } from "../db/client";
import { listTheses } from "../db/repositories/thesis-queries";
import {
  formatGoogleDocHtml,
  formatPortfolioCsv,
  formatThesisArchiveJson,
  formatThesisMarkdown,
} from "./formatters";

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
    expect(csv).toContain("安全边际(%)");
    expect(csv).toContain("仓位角色");

    const archive = JSON.parse(
      formatThesisArchiveJson(mu, {
        researchNotes: [
          {
            id: "note-export-1",
            thesisId: mu.id,
            kind: "earnings_call",
            periodLabel: "FY26 Q2",
            title: "HBM 产能与毛利指引",
            content: "管理层维持 HBM3E 良率稳步爬坡口径。",
            guidanceMetric: "毛利率",
            guidancePromised: "42%",
            guidanceDelivered: "43%",
            createdAt: "2026-08-01T00:00:00Z",
            updatedAt: "2026-08-01T00:00:00Z",
          },
        ],
      }),
    ) as {
      schemaVersion: string;
      expectations: { hurdleEntry15: number };
      quarterlyReviews: unknown[];
      researchNotes?: Array<{ id: string }>;
    };
    expect(archive.schemaVersion).toBe("kanon-archive/v3");
    expect(Array.isArray(archive.quarterlyReviews)).toBe(true);
    expect(archive.researchNotes?.[0]?.id).toBe("note-export-1");
    expect(archive.expectations.hurdleEntry15).toBeGreaterThan(100);
  });

  it("neutralizes spreadsheet formula-injection prefixes in CSV while keeping negative numbers intact", async () => {
    const theses = await listTheses(db);
    const base = theses[0];
    expect(base).toBeDefined();
    if (!base) return;

    const csv = formatPortfolioCsv([
      {
        ...base,
        companyName: '=HYPERLINK("https://evil.example")',
        sectorTag: "-1+cmd|' /C calc'!A0",
        convictionSummary: "\t+SUM(A1:A2)",
        valuation: { ...base.valuation, upsidePct: -42.5 },
      },
    ]);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'-1+cmd");
    expect(csv).toContain(",-42.5,");
  });
});
