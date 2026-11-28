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

const SUFFIX_CURRENCY_MAP: ReadonlyArray<[RegExp, CurrencyCode | null]> = [
  [/\.HK$/i, "HKD"],
  [/\.(SS|SZ)$/i, "CNY"],
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
