import { describe, expect, it } from "vitest";
import { extractAnnualHistory, resolveCurrencyNormalization } from "./edgar-annuals";
import { extractQuarterlyHistory } from "./edgar-quarterlies";
import { stripSecHtmlToParagraphs } from "./filing-text-parser";
import { parseForm4Transactions, summarizeForm4Transactions } from "./form4-parser";

describe("KANON v7 SEC 20-F FX/ADR, Quarterly De-cumulation, 10-K TOC & Form 4", () => {
  it("normalizes TWD 20-F financials and 5:1 ADR EPS for TSM", () => {
    const facts = {
      "ifrs-full": {
        Revenue: {
          units: {
            TWD: [
              {
                val: 2_894_000_000_000,
                form: "20-F",
                fy: 2024,
                start: "2024-01-01",
                end: "2024-12-31",
              },
            ],
          },
        },
        DilutedEarningsLossPerShare: {
          units: {
            "TWD/shares": [
              { val: 45.25, form: "20-F", fy: 2024, start: "2024-01-01", end: "2024-12-31" },
            ],
          },
        },
      },
    };
    const norm = resolveCurrencyNormalization(facts, "TSM");
    expect(norm.currency).toBe("TWD");
    expect(norm.adrRatio).toBe(5);
    const annuals = extractAnnualHistory(facts, norm);
    expect(annuals[0]?.revenue).toBeCloseTo(2_894_000_000_000 * norm.fxToUsd, -6);
    expect(annuals[0]?.dilutedEps).toBeCloseTo(45.25 * norm.fxToUsd * 5, 1);
  });

  it("de-cumulates YTD operating cash flows and derives standalone Q4", () => {
    const facts = {
      "us-gaap": {
        Revenues: {
          units: {
            USD: [
              {
                val: 20e9,
                form: "10-Q",
                fy: 2025,
                start: "2025-01-01",
                end: "2025-03-31",
                frame: "CY2025Q1",
              },
              {
                val: 22e9,
                form: "10-Q",
                fy: 2025,
                start: "2025-04-01",
                end: "2025-06-30",
                frame: "CY2025Q2",
              },
              {
                val: 25e9,
                form: "10-Q",
                fy: 2025,
                start: "2025-07-01",
                end: "2025-09-30",
                frame: "CY2025Q3",
              },
              { val: 67e9, form: "10-Q", fy: 2025, start: "2025-01-01", end: "2025-09-30" },
              {
                val: 100e9,
                form: "10-K",
                fy: 2025,
                start: "2025-01-01",
                end: "2025-12-31",
                frame: "CY2025",
              },
            ],
          },
        },
        NetCashProvidedByUsedInOperatingActivities: {
          units: {
            USD: [
              { val: 8e9, form: "10-Q", fy: 2025, start: "2025-01-01", end: "2025-03-31" },
              { val: 18e9, form: "10-Q", fy: 2025, start: "2025-01-01", end: "2025-06-30" },
              { val: 30e9, form: "10-Q", fy: 2025, start: "2025-01-01", end: "2025-09-30" },
              { val: 45e9, form: "10-K", fy: 2025, start: "2025-01-01", end: "2025-12-31" },
            ],
          },
        },
        PaymentsToAcquirePropertyPlantAndEquipment: {
          units: {
            USD: [
              { val: 2e9, form: "10-Q", fy: 2025, start: "2025-01-01", end: "2025-03-31" },
              { val: 5e9, form: "10-Q", fy: 2025, start: "2025-01-01", end: "2025-06-30" },
              { val: 9e9, form: "10-Q", fy: 2025, start: "2025-01-01", end: "2025-09-30" },
              { val: 13e9, form: "10-K", fy: 2025, start: "2025-01-01", end: "2025-12-31" },
            ],
          },
        },
      },
    };
    const annuals = extractAnnualHistory(facts);
    const qs = extractQuarterlyHistory(facts, undefined, annuals);
    const q2 = qs.find((x) => x.periodLabel === "2025 Q2");
    const q4 = qs.find((x) => x.periodLabel === "2025 Q4");
    expect(q2?.freeCashFlow).toBe(7e9);
    expect(q4?.revenue).toBe(33e9);
    expect(q4?.freeCashFlow).toBe(11e9);
  });

  it("skips Table of Contents page-number rows in 10-K HTML", () => {
    const html = `
      <div>Item 7. Management's Discussion and Analysis of Financial Condition 42</div>
      <div>Item 7. Management's Discussion and Analysis</div>
      <p>Cloud infrastructure revenue accelerated 34% year over year driven by enterprise AI demand and strong gross margin expansion.</p>
    `;
    const paras = stripSecHtmlToParagraphs(html);
    expect(paras.some((p) => p.endsWith("42"))).toBe(false);
    expect(paras.some((p) => p.includes("Cloud infrastructure revenue"))).toBe(true);
  });

  it("parses Form 4 XML and distinguishes cluster buys vs 10b5-1 routine sales", () => {
    const xmlBuy = `
      <ownershipDocument>
        <reportingOwner><reportingOwnerId><rptOwnerName>Satya Nadella</rptOwnerName></reportingOwnerId>
        <reportingOwnerRelationship><isOfficer>1</isOfficer><officerTitle>CEO</officerTitle></reportingOwnerRelationship></reportingOwner>
        <nonDerivativeTable><nonDerivativeTransaction>
          <transactionDate><value>2026-08-12</value></transactionDate>
          <transactionCoding><transactionCode>P</transactionCode></transactionCoding>
          <transactionAmounts><transactionShares><value>5000</value></transactionShares>
          <transactionPricePerShare><value>410</value></transactionPricePerShare></transactionAmounts>
        </nonDerivativeTransaction></nonDerivativeTable>
      </ownershipDocument>
    `;
    const txs = parseForm4Transactions(xmlBuy, "2026-08-13");
    expect(txs).toHaveLength(1);
    const summary = summarizeForm4Transactions(txs);
    expect(summary.signal).toBe("cluster_buy");
    expect(summary.openMarketBuysUsd).toBe(2_050_000);
  });

  it("prioritizes 20-F reporting currency over incidental USD facts and derives multi-year Q4s", () => {
    const facts = {
      "ifrs-full": {
        Revenue: {
          units: {
            TWD: [{ val: 2_894e9, form: "20-F", fy: 2024, start: "2024-01-01", end: "2024-12-31" }],
          },
        },
        CashAndCashEquivalents: {
          units: {
            USD: [{ val: 5e9, form: "20-F", fy: 2024, end: "2024-12-31" }],
          },
        },
      },
    };
    const norm = resolveCurrencyNormalization(facts, "TSM");
    expect(norm.currency).toBe("TWD");

    const multiYearFacts = {
      "us-gaap": {
        Revenues: {
          units: {
            USD: [
              {
                val: 15e9,
                form: "10-Q",
                fy: 2024,
                start: "2024-01-01",
                end: "2024-03-31",
                frame: "CY2024Q1",
              },
              {
                val: 16e9,
                form: "10-Q",
                fy: 2024,
                start: "2024-04-01",
                end: "2024-06-30",
                frame: "CY2024Q2",
              },
              {
                val: 17e9,
                form: "10-Q",
                fy: 2024,
                start: "2024-07-01",
                end: "2024-09-30",
                frame: "CY2024Q3",
              },
              { val: 48e9, form: "10-Q", fy: 2024, start: "2024-01-01", end: "2024-09-30" },
              {
                val: 70e9,
                form: "10-K",
                fy: 2024,
                start: "2024-01-01",
                end: "2024-12-31",
                frame: "CY2024",
              },
              {
                val: 20e9,
                form: "10-Q",
                fy: 2025,
                start: "2025-01-01",
                end: "2025-03-31",
                frame: "CY2025Q1",
              },
              {
                val: 22e9,
                form: "10-Q",
                fy: 2025,
                start: "2025-04-01",
                end: "2025-06-30",
                frame: "CY2025Q2",
              },
              {
                val: 25e9,
                form: "10-Q",
                fy: 2025,
                start: "2025-07-01",
                end: "2025-09-30",
                frame: "CY2025Q3",
              },
              { val: 67e9, form: "10-Q", fy: 2025, start: "2025-01-01", end: "2025-09-30" },
              {
                val: 100e9,
                form: "10-K",
                fy: 2025,
                start: "2025-01-01",
                end: "2025-12-31",
                frame: "CY2025",
              },
            ],
          },
        },
      },
    };
    const annuals = extractAnnualHistory(multiYearFacts);
    const qs = extractQuarterlyHistory(multiYearFacts, undefined, annuals);
    expect(qs.find((q) => q.periodLabel === "2024 Q4")?.revenue).toBe(22e9);
    expect(qs.find((q) => q.periodLabel === "2025 Q4")?.revenue).toBe(33e9);
  });

  it("handles Form 4 footnoteId tags and 10b5-1 negation without false positives", () => {
    const xmlNegated = `
      <ownershipDocument>
        <reportingOwner><reportingOwnerId><rptOwnerName>Jensen Huang</rptOwnerName></reportingOwnerId>
        <reportingOwnerRelationship><isOfficer>1</isOfficer><officerTitle>CEO</officerTitle></reportingOwnerRelationship></reportingOwner>
        <nonDerivativeTable><nonDerivativeTransaction>
          <transactionDate><value>2026-09-10</value><footnoteId id="F1"/></transactionDate>
          <transactionCoding><transactionCode>S</transactionCode></transactionCoding>
          <transactionAmounts>
            <transactionShares><value>10000</value><footnoteId id="F2"/></transactionShares>
            <transactionPricePerShare><value>130.5</value><footnoteId id="F3"/></transactionPricePerShare>
          </transactionAmounts>
        </nonDerivativeTransaction></nonDerivativeTable>
        <footnotes><footnote id="F1">This sale was not effected pursuant to a Rule 10b5-1 trading plan.</footnote></footnotes>
      </ownershipDocument>
    `;
    const txs = parseForm4Transactions(xmlNegated, "2026-09-11");
    expect(txs).toHaveLength(1);
    expect(txs[0]?.shares).toBe(10000);
    expect(txs[0]?.price).toBe(130.5);
    expect(txs[0]?.is10b51).toBe(false);
  });
});
