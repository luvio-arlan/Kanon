import { z } from "zod";

export const IsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "日期必须为 YYYY-MM-DD 格式。");
export type IsoDate = z.infer<typeof IsoDateSchema>;

export const CurrencyCodeSchema = z.enum(["USD", "HKD", "CNY", "EUR", "GBP", "JPY"]);
export type CurrencyCode = z.infer<typeof CurrencyCodeSchema>;

export const FxSourceSchema = z.enum(["identity", "ecb_reference", "broker"]);
export type FxSource = z.infer<typeof FxSourceSchema>;

export const DataLicenseClassSchema = z.enum(["licensed", "public_reference", "unofficial"]);
export type DataLicenseClass = z.infer<typeof DataLicenseClassSchema>;

// Numeric exchange codes are unambiguous, so the canonical `-` form (`0700-HK`, from
// `normalizeCanonicalTicker`) is accepted too; alphabetic suffixes stay `.`-only because `-PA` / `-L`
// also denote US preferred / share classes (`PSA-PA`).
const SUFFIX_CURRENCY_MAP: ReadonlyArray<[RegExp, CurrencyCode | null]> = [
  [/^\d{1,5}[.-]HK$/i, "HKD"],
  [/\.HK$/i, "HKD"],
  [/^\d{6}[.-](SS|SZ)$/i, "CNY"],
  [/\.(SS|SZ)$/i, "CNY"],
  [/^\d{4}[.-]T$/i, "JPY"],
  [/\.T$/i, "JPY"],
  [/\.L$/i, "GBP"],
  [/\.(PA|DE|AS)$/i, "EUR"],
  [/\.(TW|KS|AX|SW|TO)$/i, null],
];

/** Infers trading currency from ticker exchange suffix; returns null for unsupported markets (e.g. .TW). */
export function inferCurrencyFromTicker(ticker: string): CurrencyCode | null {
  const upper = ticker.trim().toUpperCase();
  for (const [re, cur] of SUFFIX_CURRENCY_MAP) {
    if (re.test(upper)) return cur;
  }
  return "USD";
}
