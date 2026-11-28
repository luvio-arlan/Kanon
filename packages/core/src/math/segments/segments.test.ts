import { describe, expect, it } from "vitest";
import type { SegmentReport } from "../../contracts/intel";
import { evaluateSotpImportEligibility, mapSegmentsToSotp, reconcileSegmentReport } from "./index";

describe("R2 Segment Reconciliation & SOTP Mapping", () => {
  it("enforces 1% reconciliation tolerance, eliminations, fx_missing, custom profit, and negative EBIT guards", () => {
    const reconciled = reconcileSegmentReport({
      lines: [
        {
          memberQname: "a:S1",
          label: "Cloud",
          labelSource: "qname",
          kind: "segment",
          revenue: 60e9,
          operatingIncome: 20e9,
        },
        {
          memberQname: "a:S2",
          label: "Ads",
          labelSource: "qname",
          kind: "segment",
          revenue: 40e9,
          operatingIncome: 15e9,
        },
      ],
      consolidatedRevenue: 100.5e9,
      consolidatedOperatingIncome: 35e9,
      profitIsStandard: true,
    });
    expect(reconciled.status).toBe("reconciled");

    const unreconciled = reconcileSegmentReport({
      lines: [
        {
          memberQname: "a:S1",
          label: "Cloud",
          labelSource: "qname",
          kind: "segment",
          revenue: 60e9,
          operatingIncome: 20e9,
        },
        {
          memberQname: "a:S2",
          label: "Ads",
          labelSource: "qname",
          kind: "segment",
          revenue: 30e9,
          operatingIncome: 10e9,
        },
      ],
      consolidatedRevenue: 100e9,
      consolidatedOperatingIncome: 30e9,
      profitIsStandard: true,
    });
    expect(unreconciled.status).toBe("unreconciled");

    const customProfit = evaluateSotpImportEligibility({
      status: "reconciled",
      currency: "USD",
      fxToUsd: 1,
      profitIsStandard: false,
      profitReconciled: false,
      eliminationsMaterial: false,
      lines: [
        {
          memberQname: "a:S1",
          label: "S1",
          labelSource: "qname",
          kind: "segment",
          revenue: 50e9,
          operatingIncome: 10e9,
        },
        {
          memberQname: "a:S2",
          label: "S2",
          labelSource: "qname",
          kind: "segment",
          revenue: 50e9,
          operatingIncome: -5e9,
        },
      ],
    });
    expect(customProfit.revenue).toBe(true);
    expect(customProfit.operatingIncome).toBe(false);
    expect(customProfit.blockers).toContain("custom_profit_measure");
    expect(customProfit.blockers).toContain("negative_profit_segment");

    const fxMissing = evaluateSotpImportEligibility({
      status: "reconciled",
      currency: "TWD",
      fxToUsd: null,
      profitIsStandard: true,
      profitReconciled: true,
      eliminationsMaterial: false,
      lines: [
        {
          memberQname: "a:S1",
          label: "S1",
          labelSource: "qname",
          kind: "segment",
          revenue: 50e9,
          operatingIncome: 10e9,
        },
        {
          memberQname: "a:S2",
          label: "S2",
          labelSource: "qname",
          kind: "segment",
          revenue: 50e9,
          operatingIncome: 10e9,
        },
      ],
    });
    expect(fxMissing.revenue).toBe(false);
    expect(fxMissing.blockers).toContain("fx_missing");
    const quarterly = evaluateSotpImportEligibility({
      status: "reconciled",
      periodKind: "quarter",
      currency: "USD",
      fxToUsd: 1,
      profitIsStandard: true,
      profitReconciled: true,
      eliminationsMaterial: false,
      lines: [
        {
          memberQname: "a:S1",
          label: "S1",
          labelSource: "qname",
          kind: "segment",
          revenue: 50e9,
          operatingIncome: 10e9,
        },
        {
          memberQname: "a:S2",
          label: "S2",
          labelSource: "qname",
          kind: "segment",
          revenue: 50e9,
          operatingIncome: 10e9,
        },
      ],
    });
    expect(quarterly.revenue).toBe(false);
    expect(quarterly.operatingIncome).toBe(false);
    expect(quarterly.blockers).toContain("quarterly_period");
  });

  it("maps reconciled segments to SOTP with null multiples and preserves source provenance", () => {
    const report: SegmentReport = {
      accession: "0001045810-25-000023",
      form: "10-K",
      periodKind: "annual",
      axis: "business",
      periodStart: "2024-01-29",
      periodEnd: "2025-01-26",
      currency: "USD",
      fxToUsd: 1,
      revenueConcept: "us-gaap:Revenues",
      profitConcept: "us-gaap:OperatingIncomeLoss",
      status: "reconciled",
      diffPct: 0,
      profitIsStandard: true,
      profitReconciled: true,
      lines: [
        {
          memberQname: "nvda:CN",
          label: "Compute & Networking",
          labelSource: "label_linkbase",
          kind: "segment",
          revenue: 116.2e9,
          operatingIncome: 76e9,
        },
        {
          memberQname: "nvda:GR",
          label: "Graphics",
          labelSource: "qname",
          kind: "segment",
          revenue: 14.3e9,
          operatingIncome: 5.4e9,
        },
        {
          memberQname: "nvda:Corp",
          label: "Corporate",
          labelSource: "qname",
          kind: "corporate",
          revenue: 0,
          operatingIncome: -2e9,
        },
      ],
      importable: { revenue: true, operatingIncome: true, blockers: [] },
    };
    const mapped = mapSegmentsToSotp({
      accession: report.accession,
      periodEnd: report.periodEnd,
      mode: "operating_income",
      concept: "us-gaap:OperatingIncomeLoss",
      currency: report.currency,
      fxToUsd: report.fxToUsd,
      lines: report.lines,
    });
    expect(mapped).toHaveLength(3);
    expect(mapped[0]?.metricValueB).toBe(76);
    expect(mapped[0]?.bearMultiple).toBeNull();
    expect(mapped[0]?.baseMultiple).toBeNull();
    expect(mapped[0]?.bullMultiple).toBeNull();
    expect(mapped[0]?.source?.accession).toBe("0001045810-25-000023");
  });
});
