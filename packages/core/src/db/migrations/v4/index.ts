import { KANON_WAVE_U1_MULTI_CURRENCY_SQL } from "./0035-multi-currency-ledger";
import { KANON_WAVE_U1_GUIDANCE_CANDIDATES_SQL } from "./0036-guidance-candidates";

export const KANON_V4_MIGRATIONS: ReadonlyArray<{
  id: string;
  description: string;
  sql: string;
}> = [
  {
    id: "0035_multi_currency_ledger",
    description:
      "Wave U1-1 expand-only multi-currency transactions, FX provenance, reversal index, and securities trading currency",
    sql: KANON_WAVE_U1_MULTI_CURRENCY_SQL,
  },
  {
    id: "0036_guidance_candidates",
    description:
      "Wave U1-2 expand-only 8-K Ex-99.1 guidance_candidates table (public derived RLS) and candidate adoption FK",
    sql: KANON_WAVE_U1_GUIDANCE_CANDIDATES_SQL,
  },
];
