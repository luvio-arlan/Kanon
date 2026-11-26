import { roundTo } from "../valuation-scenarios";

export interface OptionTranche {
  sharesM: number;
  strikePrice: number;
}

export interface EquityBridgeInput {
  enterpriseValueB: number;
  cashAndStInvestmentsB: number;
  totalDebtB: number;
  operatingLeaseLiabilitiesB?: number;
  preferredStockB?: number;
  minorityInterestB?: number;
  nonOperatingAssetsB?: number;
  basicSharesM: number;
  optionGrants?: readonly OptionTranche[];
  rsuSharesM?: number;
  convertibleSharesM?: number;
  assumedSharePrice: number;
}

export interface EquityBridgeResult {
  enterpriseValueB: number;
  netDebtAndClaimsB: number;
  equityValueB: number;
  basicSharesM: number;
  tsmOptionDilutionM: number;
  dilutedSharesM: number;
  fairValuePerShare: number;
}

/** Treasury Stock Method (TSM) net dilution for in-the-money employee stock options. */
export function calculateTsmOptionDilution(
  optionGrants: readonly OptionTranche[],
  sharePrice: number,
): number {
  if (sharePrice <= 0) return 0;
  let netDilution = 0;
  for (const grant of optionGrants) {
    if (grant.sharesM <= 0 || grant.strikePrice < 0) continue;
    if (grant.strikePrice < sharePrice) {
      netDilution += grant.sharesM * (1 - grant.strikePrice / sharePrice);
    }
  }
  return roundTo(netDilution, 3);
}

/**
 * Full Enterprise Value -> Equity Value -> Diluted Per-Share Value bridge.
 * Includes operating leases, preferred equity, minority interest, non-operating assets,
 * RSU overhang, convertibles, and TSM option dilution.
 */
export function calculateEquityBridge(input: EquityBridgeInput): EquityBridgeResult {
  const leases = Math.max(0, input.operatingLeaseLiabilitiesB ?? 0);
  const preferred = Math.max(0, input.preferredStockB ?? 0);
  const minority = Math.max(0, input.minorityInterestB ?? 0);
  const nonOp = Math.max(0, input.nonOperatingAssetsB ?? 0);

  const netDebtAndClaimsB =
    input.totalDebtB + leases + preferred + minority - input.cashAndStInvestmentsB - nonOp;
  const equityValueB = Math.max(0, input.enterpriseValueB - netDebtAndClaimsB);

  const tsmOptionDilutionM = calculateTsmOptionDilution(
    input.optionGrants ?? [],
    input.assumedSharePrice,
  );
  const dilutedSharesM = Math.max(
    0.001,
    input.basicSharesM +
      tsmOptionDilutionM +
      Math.max(0, input.rsuSharesM ?? 0) +
      Math.max(0, input.convertibleSharesM ?? 0),
  );
  const fairValuePerShare = roundTo((equityValueB * 1000) / dilutedSharesM, 2);

  return {
    enterpriseValueB: roundTo(input.enterpriseValueB, 2),
    netDebtAndClaimsB: roundTo(netDebtAndClaimsB, 2),
    equityValueB: roundTo(equityValueB, 2),
    basicSharesM: roundTo(input.basicSharesM, 2),
    tsmOptionDilutionM,
    dilutedSharesM: roundTo(dilutedSharesM, 2),
    fairValuePerShare,
  };
}
