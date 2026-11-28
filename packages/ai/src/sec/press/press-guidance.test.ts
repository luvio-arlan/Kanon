import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { convertEcbCsvToUsdPerUnit } from "../../market/fx-ecb";
import { findEx991InFilingIndex } from "./exhibit-locator";
import { extractPressReleaseGuidanceCandidates } from "./press-guidance-rules";

describe("U1-2 R3b 8-K Ex-99.1 Press Guidance Extractor & U1-1 ECB FX Parser", () => {
  it("extracts '$37.5 billion, plus or minus 2%' into exact low=36.75e9 / high=38.25e9 usd bounds", () => {
    const html = `
      <html><body>
        <h2>Outlook for the Fourth Quarter of Fiscal 2025</h2>
        <p>Revenue is expected to be $37.5 billion, plus or minus 2%.</p>
        <p>GAAP and non-GAAP gross margins are expected to be 73.0% and 73.5%, respectively, plus or minus 50 basis points.</p>
        <p>Management expects strong AI demand without quoting any numeric target.</p>
      </body></html>
    `;
    const res = extractPressReleaseGuidanceCandidates({
      accession: "0001045810-24-000250",
      issuedOn: "2024-11-20",
      html,
    });
    const rev = res.candidates.find((c) => c.metric === "revenue");
    expect(rev).toBeDefined();
    expect(rev?.unit).toBe("usd");
    expect(rev?.targetFiscalYear).toBe(2025);
    expect(rev?.targetFiscalPeriod).toBe("Q4");
    expect(rev?.low).toBeCloseTo(36.75e9, -4);
    expect(rev?.high).toBeCloseTo(38.25e9, -4);
    const gm = res.candidates.filter((c) => c.metric === "gross_margin");
    expect(gm.map((c) => [c.basis, c.low, c.high])).toEqual([
      ["gaap", 72.5, 73.5],
      ["non_gaap", 73, 74],
    ]);
  });

  it("G36: real NVDA EX-99.1 (0001045810-26-000088) yields the 5 outlook candidates, split by basis", () => {
    const fixture = (name: string) =>
      fs.readFileSync(
        path.join(__dirname, "fixtures", `nvda-0001045810-26-000088-${name}`),
        "utf8",
      );
    expect(findEx991InFilingIndex(fixture("index.html"))).toBe("q3fy27pr.htm");
    const res = extractPressReleaseGuidanceCandidates({
      accession: "0001045810-26-000088",
      issuedOn: "2026-11-17",
      html: fixture("ex99-1.htm"),
    });
    const rows = res.candidates.map((c) => [
      c.metric,
      c.basis,
      `${c.targetFiscalPeriod} FY${c.targetFiscalYear}`,
      Math.round(c.low * 100) / 100,
      Math.round(c.high * 100) / 100,
    ]);
    expect(rows).toEqual([
      ["revenue", "unspecified", "Q4 FY2027", 126.1e9, 133.9e9],
      ["gross_margin", "gaap", "Q4 FY2027", 71, 72],
      ["gross_margin", "non_gaap", "Q4 FY2027", 71, 72],
      ["operating_expenses", "gaap", "Q4 FY2027", 11e9, 11e9],
      ["operating_expenses", "non_gaap", "Q4 FY2027", 10.7e9, 10.7e9],
    ]);
    for (const c of res.candidates)
      expect(res.chunks.some((k) => k.text.includes(c.quote))).toBe(true);
  });

  it("drops unpairable dual-basis sentences instead of merging GAAP and non-GAAP into one range", () => {
    const html = `<p>Outlook for fiscal 2026</p>
      <p>GAAP and non-GAAP operating expenses are expected to be $4.8 billion, $3.4 billion and $1.2 billion, respectively.</p>`;
    const res = extractPressReleaseGuidanceCandidates({
      accession: "x",
      issuedOn: "2025-01-01",
      html,
    });
    expect(res.candidates).toHaveLength(0);
  });

  it("rejects sentences without a resolvable target fiscal period", () => {
    const html = `<p>Revenue is expected to be $10.0 billion next season.</p>`;
    const res = extractPressReleaseGuidanceCandidates({
      accession: "0001045810-24-000251",
      issuedOn: "2024-11-20",
      html,
    });
    expect(res.candidates).toHaveLength(0);
  });

  it("converts ECB reference CSV into accurate usdPerUnit cross-rates", () => {
    const csv = [
      "KEY,FREQ,CURRENCY,CURRENCY_DENOM,TIME_PERIOD,OBS_VALUE",
      "EXR.D.USD.EUR.SP00.A,D,USD,EUR,2026-03-10,1.08",
      "EXR.D.HKD.EUR.SP00.A,D,HKD,EUR,2026-03-10,8.424",
      "EXR.D.JPY.EUR.SP00.A,D,JPY,EUR,2026-03-10,162.0",
    ].join("\n");
    const rows = convertEcbCsvToUsdPerUnit(csv);
    const eur = rows.find((r) => r.currency === "EUR");
    const hkd = rows.find((r) => r.currency === "HKD");
    expect(eur?.usdPerUnit).toBeCloseTo(1.08, 6);
    expect(hkd?.usdPerUnit).toBeCloseTo(1.08 / 8.424, 6);
  });
});
