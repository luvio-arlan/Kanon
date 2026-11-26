import type { FinancialFactDuration } from "../../../contracts/financial-concepts";

export interface UpsertFilingInput {
  accession: string;
  securityId: string;
  cik: string;
  form: string;
  filedAt: string;
  periodEnd?: string | null;
  fiscalYear?: number | null;
  fiscalPeriod?: string | null;
  items?: string[];
  primaryDocUrl: string;
  amendsAccession?: string | null;
  parseStatus?: string;
}

export interface UpsertFinancialFactInput {
  id: string;
  securityId: string;
  accession: string;
  concept: string;
  xbrlTag: string;
  taxonomy?: string;
  periodStart?: string | null;
  periodEnd: string;
  duration: FinancialFactDuration;
  fiscalYear?: number | null;
  fiscalPeriod?: string | null;
  value: number;
  unit?: string;
  currency?: string;
  dimensions?: Record<string, string>;
  filedAt: string;
  isLatestForPeriod?: boolean;
}

export interface PitFinancialFact {
  id: string;
  accession: string;
  concept: string;
  xbrlTag: string;
  taxonomy: string;
  periodStart: string | null;
  periodEnd: string;
  duration: FinancialFactDuration;
  fiscalYear: number | null;
  fiscalPeriod: string | null;
  value: number;
  unit: string;
  currency: string;
  filedAt: string;
}

export interface FactRestatement {
  concept: string;
  periodEnd: string;
  originalAccession: string;
  originalFiledAt: string;
  originalValue: number;
  restatedAccession: string;
  restatedFiledAt: string;
  restatedValue: number;
  deltaPct: number;
}
