const KNOWN_CURRENCIES = new Set(["USD", "HKD", "CNY", "EUR", "GBP", "JPY"]);

export type MoneyScale = "B" | "M";

function resolveMoneyScale(value: number, scale?: MoneyScale): { scaled: number; suffix: string } {
  if (scale === "B") return { scaled: value / 1e9, suffix: "B" };
  if (scale === "M") return { scaled: value / 1e6, suffix: "M" };
  return { scaled: value, suffix: "" };
}

function resolveFractionDigits(iso: string, scale?: MoneyScale, explicit?: number): number {
  if (explicit !== undefined) return explicit;
  if (scale) return 2;
  return iso === "JPY" ? 0 : 2;
}

/**
 * Formats a monetary value with an explicit ISO currency symbol via `Intl.NumberFormat`
 * so non-USD figures are never rendered with a misleading dollar sign (U0-7 / G29).
 */
export function formatMoney(
  value: number | null | undefined,
  currency: string | null | undefined = "USD",
  options?: { scale?: MoneyScale; maximumFractionDigits?: number; compact?: boolean },
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const iso = (currency ?? "USD").trim().toUpperCase();
  const { scaled, suffix } = resolveMoneyScale(value, options?.scale);
  const digits = resolveFractionDigits(iso, options?.scale, options?.maximumFractionDigits);
  if (!KNOWN_CURRENCIES.has(iso)) {
    return `${iso} ${scaled.toLocaleString("en-US", { maximumFractionDigits: digits })}${suffix}`;
  }
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: iso,
    currencyDisplay: "symbol",
    notation: !options?.scale && options?.compact ? "compact" : "standard",
    maximumFractionDigits: digits,
    minimumFractionDigits: options?.scale ? Math.min(2, digits) : 0,
  }).format(scaled);
  return `${formatted}${suffix}`;
}
