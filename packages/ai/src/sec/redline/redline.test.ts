import { describe, expect, it } from "vitest";
import {
  buildFilingRedline,
  type ComparableFilingCandidate,
  extractFilingSectionParagraphs,
  findComparablePriorFiling,
} from "./index";

const FY25_10K: ComparableFilingCandidate = {
  accession: "0001045810-25-000023",
  form: "10-K",
  filedAt: "2025-02-26",
  periodEnd: "2025-01-26",
  fiscalYear: 2025,
  fiscalPeriod: "FY",
  primaryDocUrl: "https://www.sec.gov/Archives/edgar/data/1045810/25/doc.htm",
};

const FY24_10K: ComparableFilingCandidate = {
  accession: "0001045810-24-000029",
  form: "10-K",
  filedAt: "2024-02-21",
  periodEnd: "2024-01-28",
  fiscalYear: 2024,
  fiscalPeriod: "FY",
  primaryDocUrl: "https://www.sec.gov/Archives/edgar/data/1045810/24/doc.htm",
};

describe("R1 Filing Redline Engine", () => {
  it("extracts full Item 1A skipping TOC and handles 10-Q no-material-changes + 20-F Item 3.D", () => {
    const htmlWithToc = `<html><body>
      <table><tr><td>Item 1A. Risk Factors</td><td>12</td></tr><tr><td>Item 7. MD&A</td><td>34</td></tr></table>
      <p>Item 1A. Risk Factors</p>
      <p>Our global semiconductor supply chain depends on specialized foundry partners and advanced packaging nodes.</p>
      <p>Customer concentration among major hyperscale cloud service providers could cause quarter-to-quarter volatility.</p>
      <p>Regulatory licensing changes affecting high-performance computing exports may restrict access to international markets.</p>
      <p>Item 1B. Unresolved Staff Comments</p>
    </body></html>`;
    const ext = extractFilingSectionParagraphs({
      rawHtml: htmlWithToc,
      form: "10-K",
      section: "risk_factors",
    });
    expect(ext.status).toBe("ok");
    expect(ext.paragraphs[0]).toContain("foundry partners");

    const q10NoChange = `<html><body>
      <p>Item 1A. Risk Factors</p>
      <p>There have been no material changes to the risk factors previously disclosed in our Annual Report on Form 10-K.</p>
      <p>Item 2. Unregistered Sales</p>
    </body></html>`;
    const qExt = extractFilingSectionParagraphs({
      rawHtml: q10NoChange,
      form: "10-Q",
      section: "risk_factors",
    });
    expect(qExt.status).toBe("no_material_changes");

    const f20Html = `<html><body>
      <p>Item 3.D. Risk Factors</p>
      <p>Geopolitical tensions across the Taiwan Strait could disrupt wafer fabrication operations and customer shipments.</p>
      <p>Leading-edge semiconductor lithography equipment requires substantial annual capital commitments and power availability.</p>
      <p>Foreign currency movements between the New Taiwan Dollar and the United States Dollar affect gross margins.</p>
      <p>Item 4. Information on the Company</p>
    </body></html>`;
    const f20 = extractFilingSectionParagraphs({
      rawHtml: f20Html,
      form: "20-F",
      section: "risk_factors",
    });
    expect(f20.status).toBe("ok");
    expect(f20.paragraphs[0]).toContain("Taiwan Strait");
  });

  it("enforces strict pairing: 10-Q MD&A never cross-pairs with 10-K and prefers original over 10-K/A", () => {
    const q3: ComparableFilingCandidate = {
      ...FY25_10K,
      accession: "0001045810-24-000210",
      form: "10-Q",
      filedAt: "2024-11-20",
      fiscalYear: 2025,
      fiscalPeriod: "Q3",
    };
    expect(
      findComparablePriorFiling({ target: q3, filings: [q3, FY24_10K], section: "mda" }),
    ).toBeNull();
    expect(
      findComparablePriorFiling({ target: q3, filings: [q3, FY24_10K], section: "risk_factors" })
        ?.accession,
    ).toBe(FY24_10K.accession);

    const fy24Amend: ComparableFilingCandidate = {
      ...FY24_10K,
      accession: "0001045810-24-000099",
      form: "10-K/A",
      filedAt: "2024-04-15",
    };
    expect(
      findComparablePriorFiling({
        target: FY25_10K,
        filings: [FY25_10K, fy24Amend, FY24_10K],
        section: "mda",
      })?.accession,
    ).toBe(FY24_10K.accession);
  });

  it("detects added_risk, numbers_only, hedging_up, definition_change, paragraph reordering, and too_large", () => {
    const prevHtml = `<html><body>
      <p>Item 1A. Risk Factors</p>
      <p>We generated $60.9 billion in total revenue across fiscal 2024 with gross margin of 72.7%.</p>
      <p>Our global semiconductor data center operations serve enterprise cloud customers across North America, Europe, and Asia Pacific with specialized GPU server architecture, networking fabrics, and software platforms.</p>
      <p>We define adjusted operating metric consistently across all reporting segments for enterprise software platforms, cloud computing services, and global hardware infrastructure deployments worldwide.</p>
      <p>Item 1B. Unresolved Staff Comments</p>
    </body></html>`;
    const currHtml = `<html><body>
      <p>Item 1A. Risk Factors</p>
      <p>We define adjusted operating metric on a non-GAAP reclassified basis across all reporting segments for enterprise software platforms, cloud computing services, and global hardware infrastructure deployments worldwide.</p>
      <p>Our global semiconductor data center operations serve enterprise cloud customers across North America, Europe, and Asia Pacific with specialized GPU server architecture, networking fabrics, and software platforms that may face adverse uncertainty and impairment risk.</p>
      <p>We generated $130.5 billion in total revenue across fiscal 2025 with gross margin of 75.0%.</p>
      <p>Expanded export control restrictions and licensing mandates on advanced accelerators could materially impair China revenue.</p>
      <p>Item 1B. Unresolved Staff Comments</p>
    </body></html>`;

    const out = buildFilingRedline({
      ticker: "NVDA",
      section: "risk_factors",
      current: FY25_10K,
      previous: FY24_10K,
      currentHtml: currHtml,
      previousHtml: prevHtml,
    });
    expect(out.response.status).toBe("ready");
    const kinds = new Set(out.response.changes.map((c) => c.kind));
    expect(kinds.has("added_risk")).toBe(true);
    expect(kinds.has("numbers_only")).toBe(true);
    expect(kinds.has("hedging_up")).toBe(true);
    expect(kinds.has("definition_change")).toBe(true);

    // Oversized HTML returns too_large cleanly (>12 MB)
    const huge = `<html><body>${"x".repeat(12_600_000)}</body></html>`;
    const hugeOut = buildFilingRedline({
      ticker: "NVDA",
      section: "risk_factors",
      current: FY25_10K,
      previous: FY24_10K,
      currentHtml: huge,
      previousHtml: prevHtml,
    });
    expect(hugeOut.response.status).toBe("too_large");
  });
});
