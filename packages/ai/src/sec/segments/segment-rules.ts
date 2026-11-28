import type { SegmentAxis, SegmentLineKind } from "@kanon/core";
import type { XbrlContext } from "./xbrl-instance-scan";

export const AXIS_QNAMES: Record<SegmentAxis, readonly string[]> = {
  business: ["us-gaap:StatementBusinessSegmentsAxis", "ifrs-full:SegmentsAxis"],
  geography: ["srt:StatementGeographicalAxis", "ifrs-full:GeographicalAreasAxis"],
  product: ["srt:ProductOrServiceAxis", "ifrs-full:ProductsAndServicesAxis"],
};

export const REVENUE_PRIORITY = [
  "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax",
  "us-gaap:Revenues",
  "ifrs-full:Revenue",
];

export const STANDARD_PROFIT_PRIORITY = [
  "us-gaap:OperatingIncomeLoss",
  "ifrs-full:ProfitLossFromOperatingActivities",
];

export const EXT_PROFIT_RE =
  /(?:^|:)(?:Segment(?:Operating)?(?:Profit|Income|Loss)|AdjustedOperating(?:Income|Profit))$/i;

const CONSOLIDATION_AXIS_RE = /(?:ConsolidationItemsAxis|SegmentConsolidationItemsAxis)$/i;
const OPERATING_SEGMENTS_MEMBER_RE = /OperatingSegmentsMember$/i;

export function isTargetDuration(ctx: XbrlContext, isQuarterly: boolean): boolean {
  if (!ctx.startDate || !ctx.endDate) return false;
  const days = Math.round(
    (Date.parse(`${ctx.endDate}T00:00:00Z`) - Date.parse(`${ctx.startDate}T00:00:00Z`)) /
      86_400_000,
  );
  return (
    Number.isFinite(days) && (isQuarterly ? days >= 65 && days <= 120 : days >= 320 && days <= 395)
  );
}

export function classifyMemberKind(memberQname: string): SegmentLineKind {
  if (/IntersegmentElimination|EliminationOfIntersegment/i.test(memberQname)) return "elimination";
  if (/CorporateNonSegment|UnallocatedAmounts/i.test(memberQname)) return "corporate";
  if (/MaterialReconcilingItems|ReconcilingItems/i.test(memberQname)) return "reconciling";
  return "segment";
}

export function matchSingleAxisMember(ctx: XbrlContext, allowedAxes: readonly string[]) {
  const targetDims = ctx.dimensions.filter((d) => allowedAxes.includes(d.dimension));
  if (targetDims.length !== 1 || !targetDims[0]) return null;
  const othersAllowed = ctx.dimensions
    .filter((d) => !allowedAxes.includes(d.dimension))
    .every(
      (d) => CONSOLIDATION_AXIS_RE.test(d.dimension) && OPERATING_SEGMENTS_MEMBER_RE.test(d.member),
    );
  return othersAllowed
    ? { axisQname: targetDims[0].dimension, member: targetDims[0].member }
    : null;
}
