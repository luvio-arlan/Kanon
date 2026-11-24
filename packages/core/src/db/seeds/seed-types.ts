import type {
  BusinessFilter,
  CrossCheck,
  DisciplineEntry,
  PortfolioRole,
  ThesisCatalyst,
  ThesisStatus,
} from "../../schemas/research";
import type { Hypothesis, SparklinePoint } from "../../schemas/thesis";

export interface SeedThesisRecord {
  id: string;
  indexOrder: number;
  ticker: string;
  companyName: string;
  sectorTag: string;
  currentPrice: number;
  horizonYears: number;
  portfolioRole?: PortfolioRole;
  currentWeightPct?: number;
  targetMaxWeightPct?: number;
  avgCostBasis?: number | null;
  convictionSummary: string;
  status: ThesisStatus;
  lastReviewedLabel: string;
  businessFilter: BusinessFilter;
  hypotheses: [Hypothesis, Hypothesis, Hypothesis];
  catalysts?: ThesisCatalyst[];
  crossChecks: CrossCheck[];
  valuationInput: {
    bearEps: number;
    bearPe: number;
    baseEps: number;
    basePe: number;
    bullEps: number;
    bullPe: number;
    priceHistory: SparklinePoint[];
  };
  disciplineEntries: Omit<DisciplineEntry, "createdAt">[];
}
