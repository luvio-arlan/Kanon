import { createMemoryKanonDb, getSecSnapshot, getThesisById } from "@kanon/core/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runThesisCopilot } from "./copilot/run-copilot";
import { fetchSecEdgarSnapshot, formatUsdCompact } from "./sec/edgar-client";

describe("packages/ai SEC EDGAR Multi-Year XBRL & Copilot Contracts", () => {
  it("formats compact USD figures cleanly", () => {
    expect(formatUsdCompact(37_400_000_000)).toBe("$37.4B");
    expect(formatUsdCompact(450_000_000)).toBe("$450.0M");
    expect(formatUsdCompact(-12_500_000_000)).toBe("-$12.5B");
  });

  it("extracts multi-year annual fundamentals, FCF, and diluted EPS from SEC XBRL", async () => {
    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("/submissions/")) {
        return new Response(
          JSON.stringify({
            name: "MICRON TECHNOLOGY INC",
            filings: {
              recent: {
                form: ["10-K", "10-Q"],
                filingDate: ["2025-10-06", "2025-06-27"],
                reportDate: ["2025-08-28", "2025-05-29"],
                accessionNumber: ["0000723125-25-000041", "0000723125-25-000022"],
                primaryDocument: ["mu-20250828.htm", "mu-20250529.htm"],
                primaryDocDescription: ["FY25 10-K", "Q3 10-Q"],
              },
            },
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          facts: {
            "us-gaap": {
              Revenues: {
                units: {
                  USD: [
                    { val: 25_111_000_000, form: "10-K", fy: 2024, end: "2024-08-29" },
                    { val: 37_378_000_000, form: "10-K", fy: 2025, end: "2025-08-28" },
                  ],
                },
              },
              GrossProfit: {
                units: {
                  USD: [{ val: 15_920_000_000, form: "10-K", fy: 2025, end: "2025-08-28" }],
                },
              },
              NetCashProvidedByUsedInOperatingActivities: {
                units: {
                  USD: [{ val: 16_820_000_000, form: "10-K", fy: 2025, end: "2025-08-28" }],
                },
              },
              PaymentsToAcquirePropertyPlantAndEquipment: {
                units: {
                  USD: [{ val: 13_800_000_000, form: "10-K", fy: 2025, end: "2025-08-28" }],
                },
              },
              EarningsPerShareDiluted: {
                units: { "USD/shares": [{ val: 7.59, form: "10-K", fy: 2025, end: "2025-08-28" }] },
              },
            },
          },
        }),
        { status: 200 },
      );
    };

    const result = await fetchSecEdgarSnapshot("MU", mockFetch);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.annuals).toHaveLength(2);
      const fy25 = result.data.annuals[1];
      expect(fy25?.grossMarginPct).toBe(42.6);
      expect(fy25?.freeCashFlow).toBe(3_020_000_000);
      expect(fy25?.dilutedEps).toBe(7.59);
    }
  });

  describe("runThesisCopilot grounded Zod execution", () => {
    let closeDb: () => Promise<void>;
    let thesis: Awaited<ReturnType<typeof getThesisById>>;
    let sec: Awaited<ReturnType<typeof getSecSnapshot>>;

    beforeAll(async () => {
      const mem = await createMemoryKanonDb();
      closeDb = mem.close;
      thesis = await getThesisById(mem.db, "thesis-mu");
      sec = await getSecSnapshot(mem.db, "MU");
    });

    afterAll(async () => {
      await closeDb();
    });

    it("produces Zod-validated outputs for earnings_digest, red_team, and investment_memo", async () => {
      expect(thesis).not.toBeNull();
      if (!thesis) return;

      const digest = await runThesisCopilot({
        action: "earnings_digest",
        thesis,
        secSnapshot: sec,
        sourceText:
          "Management expects HBM3E supply to remain sold out through 2026.\nCapEx intensity rises to support cleanroom expansion.",
      });
      expect(digest.data.quarterLabel).toContain("原文");

      const redTeam = await runThesisCopilot({ action: "red_team", thesis, secSnapshot: sec });
      expect(redTeam.data.challenges).toHaveLength(3);

      const memo = await runThesisCopilot({ action: "investment_memo", thesis, secSnapshot: sec });
      expect(memo.data.ticker).toBe("MU");
      expect(memo.data.nextQuarterChecklist.length).toBeGreaterThanOrEqual(2);
    });
  });
});
