import { describe, expect, it, vi } from "vitest";
import { extractPitFactsFromCompanyFacts, fetchSecEdgarWithPitFacts } from "./edgar-client";
import { fetchSecWithRetry } from "./sec-http";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Wave W0 SEC EDGAR Hardening (Q5-8 & Q5-10)", () => {
  it("resolves BRK.B via canonical normalization to BRK-B CIK 0001067983 and includes 10-K/A in filings", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("company_tickers.json")) {
        return jsonResponse({
          "0": { ticker: "BRK-B", cik_str: 1067983 },
        });
      }
      if (url.includes("submissions/CIK0001067983.json")) {
        return jsonResponse({
          name: "BERKSHIRE HATHAWAY INC",
          filings: {
            recent: {
              form: ["10-K/A", "6-K"],
              filingDate: ["2025-03-10", "2025-02-01"],
              reportDate: ["2024-12-31", "2024-12-31"],
              accessionNumber: ["0001067983-25-000002", "0001067983-25-000001"],
              primaryDocument: ["brkb-10ka.htm", "brkb-6k.htm"],
              primaryDocDescription: ["10-K/A Amendment", "Foreign Report"],
            },
          },
        });
      }
      if (url.includes("companyfacts/CIK0001067983.json")) {
        return jsonResponse({ facts: { "us-gaap": {} } });
      }
      return jsonResponse({}, 404);
    }) as unknown as typeof fetch;

    const res = await fetchSecEdgarWithPitFacts("BRK.B", fetchMock);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.cik).toBe("0001067983");
    expect(res.data.filings.some((f) => f.form === "10-K/A")).toBe(true);
    expect(res.data.filings.some((f) => f.form === "6-K")).toBe(true);
  });

  it("classifies non-SEC issuer (0700.HK) as not_sec_registrant and excludes 6-K from PIT facts", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("company_tickers.json")) {
        return jsonResponse({ "0": { ticker: "BRK-B", cik_str: 1067983 } });
      }
      return jsonResponse({}, 404);
    }) as unknown as typeof fetch;

    const nonSec = await fetchSecEdgarWithPitFacts("0700.HK", fetchMock);
    expect(nonSec.ok).toBe(false);
    if (nonSec.ok) return;
    expect(nonSec.errorKind).toBe("not_sec_registrant");

    const pit = extractPitFactsFromCompanyFacts(
      {
        "us-gaap": {
          Revenues: {
            units: {
              USD: [
                {
                  accn: "acc-6k",
                  form: "6-K",
                  val: 10_000_000_000,
                  start: "2024-01-01",
                  end: "2024-12-31",
                  filed: "2025-02-01",
                },
                {
                  accn: "acc-10ka",
                  form: "10-K/A",
                  val: 12_000_000_000,
                  start: "2024-01-01",
                  end: "2024-12-31",
                  filed: "2025-03-01",
                },
              ],
            },
          },
        },
      },
      { currency: "USD", fxToUsd: 1, adrRatio: 1 },
    );
    expect(pit.map((f) => f.form)).toEqual(["10-K/A"]);
  });

  it("aborts immediately on AbortSignal and invokes acquireGlobalSlot callback", async () => {
    const slotSpy = vi.fn(async () => undefined);
    const controller = new AbortController();
    controller.abort(new Error("timeout"));
    await expect(
      fetchSecWithRetry(
        "https://data.sec.gov/submissions/CIK0001045810.json",
        { signal: controller.signal, acquireGlobalSlot: slotSpy },
        vi.fn() as unknown as typeof fetch,
      ),
    ).rejects.toThrow(/timeout/);
    expect(slotSpy).not.toHaveBeenCalled();

    const okFetch = vi.fn(async () => jsonResponse({ ok: true })) as unknown as typeof fetch;
    const res = await fetchSecWithRetry(
      "https://data.sec.gov/submissions/CIK0001045810.json",
      { acquireGlobalSlot: slotSpy },
      okFetch,
    );
    expect(res.ok).toBe(true);
    expect(slotSpy).toHaveBeenCalledTimes(1);
  });
});
