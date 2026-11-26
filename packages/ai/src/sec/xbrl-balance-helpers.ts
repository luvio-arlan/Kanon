import { type CurrencyNormalization, collectAnnualMap, type SecFactsPayload } from "./xbrl-helpers";

function mergeSplitMaps(
  aggregate: Map<number, number>,
  noncurrent: Map<number, number>,
  current: Map<number, number>,
): Map<number, number> {
  const merged = new Map<number, number>(aggregate);
  for (const fy of new Set([...noncurrent.keys(), ...current.keys()])) {
    if (merged.has(fy)) continue;
    merged.set(fy, (noncurrent.get(fy) ?? 0) + (current.get(fy) ?? 0));
  }
  return merged;
}

export function extractTotalDebtMap(
  facts: SecFactsPayload | undefined,
  norm: CurrencyNormalization,
) {
  const inst = (us: readonly string[], ifrs: readonly string[]) =>
    collectAnnualMap(facts, us, ifrs, "monetary", "instant", norm);
  return mergeSplitMaps(
    inst(["LongTermDebtAndCapitalLeaseObligations", "LongTermDebt"], ["Borrowings"]),
    inst(["LongTermDebtNoncurrent"], ["NoncurrentBorrowings", "LongtermBorrowings"]),
    inst(
      ["LongTermDebtCurrent", "DebtCurrent", "ShortTermBorrowings"],
      ["CurrentBorrowings", "CurrentPortionOfLongtermBorrowings"],
    ),
  );
}

export function extractOperatingLeaseMap(
  facts: SecFactsPayload | undefined,
  norm: CurrencyNormalization,
) {
  const inst = (us: readonly string[], ifrs: readonly string[]) =>
    collectAnnualMap(facts, us, ifrs, "monetary", "instant", norm);
  return mergeSplitMaps(
    inst(["OperatingLeaseLiability"], ["LeaseLiabilities"]),
    inst(["OperatingLeaseLiabilityNoncurrent"], ["NoncurrentLeaseLiabilities"]),
    inst(["OperatingLeaseLiabilityCurrent"], ["CurrentLeaseLiabilities"]),
  );
}
