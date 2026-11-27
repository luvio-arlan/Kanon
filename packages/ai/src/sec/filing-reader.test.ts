import type { SecSnapshot } from "@kanon/core";
import { describe, expect, it } from "vitest";
import { resolveByokModel, sanitizeProviderBaseUrl } from "../copilot/run-copilot";
import { fetchSecFilingReaderData } from "./filing-reader";
import {
  computeFilingSectionDiff,
  extractSecKeySections,
  stripSecHtmlToParagraphs,
} from "./filing-text-parser";

const MOCK_FILING_HTML_CURRENT = `
<html>
  <head><style>.hidden { display:none; }</style><script>var x = 1;</script></head>
  <body>
    <p>Item 7. Management's Discussion and Analysis of Financial Condition and Results of Operations</p>
    <p>Data center revenue expanded 78% year over year driven by Blackwell rack scale demand and higher gross margin across enterprise AI deployments.</p>
    <p>Capital expenditure guidance increased to reflect advanced packaging capacity reservations and sovereign AI cloud backlog expansion through fiscal 2027.</p>
    <p>Item 1A. Risk Factors</p>
    <p>Export control restrictions and new tariff frameworks could limit our ability to ship advanced accelerator products to specific international regions.</p>
  </body>
</html>
`;

const MOCK_FILING_HTML_PREVIOUS = `
<html>
  <body>
    <p>Item 7. Management's Discussion and Analysis of Financial Condition and Results of Operations</p>
    <p>Data center revenue expanded 78% year over year driven by Blackwell rack scale demand and higher gross margin across enterprise AI deployments.</p>
    <p>Inventory levels normalized as Hopper transition progressed smoothly across hyperscale customers.</p>
  </body>
</html>
`;

const MOCK_SNAPSHOT: SecSnapshot = {
  ticker: "NVDA",
  cik: "0001045810",
  entityName: "NVIDIA CORP",
  source: "cached-seed",
  fetchedAt: "2026-11-24T00:00:00.000Z",
  facts: [
    {
      metric: "revenue",
      label: "营业收入",
      valueFormatted: "$130.0B",
      period: "FY2026",
      sourceTag: "us-gaap:Revenues",
    },
  ],
  annuals: [],
  quarterlies: [],
  filings: [
    {
      form: "10-Q",
      filingDate: "2026-08-28",
      reportDate: "2026-07-28",
      accessionNumber: "0001045810-26-000102",
      documentUrl: "https://www.sec.gov/Archives/edgar/data/1045810/000104581026000102/nvda-q2.htm",
      description: "Q2 FY27 10-Q",
    },
    {
      form: "10-Q",
      filingDate: "2026-05-28",
      reportDate: "2026-04-28",
      accessionNumber: "0001045810-26-000081",
      documentUrl: "https://www.sec.gov/Archives/edgar/data/1045810/000104581026000081/nvda-q1.htm",
      description: "Q1 FY27 10-Q",
    },
  ],
};

describe("SEC Filing Reader & Custom BYOK Providers", () => {
  it("strips SEC HTML noise and extracts MD&A + Risk Factors sections", () => {
    const paragraphs = stripSecHtmlToParagraphs(MOCK_FILING_HTML_CURRENT);
    expect(paragraphs.length).toBeGreaterThanOrEqual(4);
    expect(paragraphs.some((p) => p.includes("var x = 1"))).toBe(false);

    const sections = extractSecKeySections(paragraphs);
    expect(sections.some((s) => s.category === "mda")).toBe(true);
    expect(sections.some((s) => s.category === "risk_factors")).toBe(true);
  });

  it("computes cross-quarter wording diffs between consecutive filings", () => {
    const cur = stripSecHtmlToParagraphs(MOCK_FILING_HTML_CURRENT);
    const prev = stripSecHtmlToParagraphs(MOCK_FILING_HTML_PREVIOUS);
    const diff = computeFilingSectionDiff({
      sectionHeading: "MD&A",
      previousForm: "10-Q",
      previousFilingDate: "2026-05-28",
      currentParagraphs: cur,
      previousParagraphs: prev,
    });
    expect(diff).not.toBeNull();
    expect(diff?.addedSnippets.some((s) => s.includes("Capital expenditure guidance"))).toBe(true);
    expect(diff?.removedSnippets.some((s) => s.includes("Inventory levels normalized"))).toBe(true);
  });

  it("fetches live SEC filing HTML with cross-quarter diff and falls back safely offline", async () => {
    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("nvda-q2")) return new Response(MOCK_FILING_HTML_CURRENT, { status: 200 });
      return new Response(MOCK_FILING_HTML_PREVIOUS, { status: 200 });
    };
    const live = await fetchSecFilingReaderData({
      ticker: "NVDA",
      snapshot: MOCK_SNAPSHOT,
      fetchImpl: mockFetch,
    });
    expect(live.source).toBe("sec-edgar-live");
    expect(live.sections.length).toBeGreaterThanOrEqual(2);
    expect(live.diff).toBeNull();

    const failingFetch: typeof fetch = async () => new Response("rate limited", { status: 429 });
    const fallback = await fetchSecFilingReaderData({
      ticker: "NVDA",
      snapshot: MOCK_SNAPSHOT,
      fetchImpl: failingFetch,
    });
    expect(fallback.source).toBe("cached-summary");
    expect(fallback.fullExcerpt).toContain("$130.0B");
  });

  it("sanitizes custom BYOK provider URLs against SSRF and resolves openai_compatible models", () => {
    expect(sanitizeProviderBaseUrl("https://openrouter.ai/api/v1/")).toBe(
      "https://openrouter.ai/api/v1",
    );
    expect(sanitizeProviderBaseUrl("http://localhost:11434/v1")).toBe("http://localhost:11434/v1");
    expect(sanitizeProviderBaseUrl("http://169.254.169.254/latest/meta-data")).toBeUndefined();
    expect(sanitizeProviderBaseUrl("http://evil.example.com/v1")).toBeUndefined();

    const model = resolveByokModel({
      provider: "openai_compatible",
      apiKey: "sk-test-key",
      model: "deepseek-reasoner",
      baseUrl: "https://api.deepseek.com/v1",
    });
    expect(model).not.toBeNull();
  });
});
