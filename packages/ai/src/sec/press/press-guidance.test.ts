import { describe, expect, it } from "vitest";
import { convertEcbCsvToUsdPerUnit } from "../../market/fx-ecb";
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
    const gm = res.candidates.find((c) => c.metric === "gross_margin");
    expect(gm?.unit).toBe("pct");
    expect(gm?.low).toBeCloseTo(72.5, 2);
    expect(gm?.high).toBeCloseTo(74.0, 2);
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
