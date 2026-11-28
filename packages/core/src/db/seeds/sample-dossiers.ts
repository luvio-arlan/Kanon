import { calculateImpliedExpectations } from "../../math/implied-expectations";
import { calculateValuationScenarios } from "../../math/valuation-scenarios";
import type { SecSnapshot, ThesisDetail } from "../../schemas/research";
import { SEED_SEC_NVDA } from "./seed-sec-nvda";
import { SEED_THESIS_RECORDS } from "./seed-theses";
import { SEED_THESIS_NVDA } from "./seed-thesis-nvda";
import type { SeedThesisRecord } from "./seed-types";

export interface StaticSampleDossier {
  slug: string;
  asOfDate: string;
  thesis: ThesisDetail;
  secSnapshot: SecSnapshot | null;
  marginOfSafetyPct: number;
  hurdleEntry15: number;
}

function hydrateSeedThesis(seed: SeedThesisRecord): ThesisDetail {
  const valuationInput = {
    currentPrice: seed.currentPrice,
    horizonYears: seed.horizonYears,
    bear: {
      eps: seed.valuationInput.bearEps,
      peMultiple: seed.valuationInput.bearPe,
      probability: 0.25,
    },
    base: {
      eps: seed.valuationInput.baseEps,
      peMultiple: seed.valuationInput.basePe,
      probability: 0.5,
    },
    bull: {
      eps: seed.valuationInput.bullEps,
      peMultiple: seed.valuationInput.bullPe,
      probability: 0.25,
    },
  };
  const valuation = calculateValuationScenarios(valuationInput);
  return {
    id: seed.id,
    indexLabel: String(seed.indexOrder).padStart(2, "0"),
    ticker: seed.ticker,
    companyName: seed.companyName,
    sectorTag: seed.sectorTag,
    currentPrice: seed.currentPrice,
    horizonYears: seed.horizonYears,
    horizonLabel: `${seed.horizonYears} 年视角`,
    portfolioRole: seed.portfolioRole ?? "core",
    currentWeightPct: seed.currentWeightPct ?? 0,
    targetMaxWeightPct: seed.targetMaxWeightPct ?? 15,
    avgCostBasis: seed.avgCostBasis ?? null,
    convictionSummary: seed.convictionSummary,
    status: seed.status,
    lastReviewedAt: seed.lastReviewedLabel,
    updatedAt: "2026-11-20T08:00:00.000Z",
    businessFilter: seed.businessFilter,
    hypotheses: [...seed.hypotheses],
    catalysts: seed.catalysts ?? [],
    crossChecks: seed.crossChecks,
    valuationInput,
    valuationModelMode: "pe",
    valuationDriverInputs: {},
    valuation,
    priceHistory: seed.valuationInput.priceHistory,
    disciplineEntries: seed.disciplineEntries.map((d) => ({ ...d, createdAt: "2026-11-20" })),
  };
}

function buildDossier(
  slug: string,
  seed: SeedThesisRecord,
  sec: SecSnapshot | null,
): StaticSampleDossier {
  const thesis = hydrateSeedThesis(seed);
  const exp = calculateImpliedExpectations({ summary: thesis.valuation });
  return {
    slug,
    asOfDate: "2026-11-20",
    thesis,
    secSnapshot: sec,
    marginOfSafetyPct: exp.marginOfSafetyPct,
    hurdleEntry15: exp.hurdleEntry15,
  };
}

const SAMPLE_MAP: Readonly<Record<string, StaticSampleDossier>> = {
  nvda: buildDossier("nvda", SEED_THESIS_NVDA, SEED_SEC_NVDA),
  ...(SEED_THESIS_RECORDS[0] ? { mu: buildDossier("mu", SEED_THESIS_RECORDS[0], null) } : {}),
};

export const SAMPLE_DOSSIER_SLUGS = Object.keys(SAMPLE_MAP) as readonly string[];

/** Pure static sample dossier lookup with zero DB or API calls (U2-3 / G31). */
export function getStaticSampleDossier(slug: string): StaticSampleDossier | null {
  const key = slug.trim().toLowerCase();
  return SAMPLE_MAP[key] ?? null;
}
