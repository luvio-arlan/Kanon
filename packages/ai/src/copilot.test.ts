import { createMemoryKanonDb, getSecSnapshot, getThesisById } from "@kanon/core/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runThesisCopilot } from "./copilot/run-copilot";
import { fetchSecEdgarSnapshot, formatUsdCompact } from "./sec/edgar-client";

describe("packages/ai SEC EDGAR & Copilot Contracts", () => {
  it("formats compact USD figures cleanly", () => {
    expect(formatUsdCompact(37_400_000_000)).toBe("$37.4B");
    expect(formatUsdCompact(450_000_000)).toBe("$450.0M");
    expect(formatUsdCompact(-12_500_000_000)).toBe("-$12.5B");
  });

  it("parses official SEC EDGAR submissions and XBRL facts with mocked fetch", async () => {
    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("/submissions/")) {
        return new Response(
          JSON.stringify({
            name: "MICRON TECHNOLOGY INC",
            filings: {
              recent: {
                form: ["10-K", "8-K", "10-Q"],
                filingDate: ["2025-10-06", "2025-10-01", "2025-06-27"],
                reportDate: ["2025-08-28", "2025-10-01", "2025-05-29"],
                accessionNumber: [
                  "0000723125-25-000041",
                  "0000723125-25-000039",
                  "0000723125-25-000022",
                ],
                primaryDocument: ["mu-20250828.htm", "ex.htm", "mu-20250529.htm"],
                primaryDocDescription: ["FY25 10-K", "8-K", "Q3 10-Q"],
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
                  USD: [{ val: 37_400_000_000, form: "10-K", fy: 2025, end: "2025-08-28" }],
                },
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
      expect(result.data.cik).toBe("0000723125");
      expect(result.data.filings).toHaveLength(2);
      expect(result.data.facts[0]?.valueFormatted).toBe("$37.4B");
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

    it("produces Zod-validated outputs for all 3 copilot actions", async () => {
      expect(thesis).not.toBeNull();
      if (!thesis) return;

      const digest = await runThesisCopilot({
        action: "earnings_digest",
        thesis,
        secSnapshot: sec,
      });
      expect(digest.data.ticker).toBe("MU");
      expect(digest.data.quotesWithAnchors.length).toBeGreaterThanOrEqual(1);

      const redTeam = await runThesisCopilot({ action: "red_team", thesis, secSnapshot: sec });
      expect(redTeam.data.challenges).toHaveLength(3);

      const script = await runThesisCopilot({ action: "video_script", thesis, secSnapshot: sec });
      expect(script.data.firstPrinciplesEvidence.length).toBeGreaterThanOrEqual(2);
    });
  });
});
