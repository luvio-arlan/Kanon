import { describe, expect, it } from "vitest";
import { getStaticSampleDossier, SAMPLE_DOSSIER_SLUGS } from "./sample-dossiers";

describe("U2-3 · Static Public Sample Dossiers (Zero DB/API)", () => {
  it("exposes nvda sample dossier with real SEC annual facts and cutoff date", () => {
    expect(SAMPLE_DOSSIER_SLUGS).toContain("nvda");
    const nvda = getStaticSampleDossier("nvda");
    expect(nvda).not.toBeNull();
    expect(nvda?.thesis.ticker).toBe("NVDA");
    expect(nvda?.asOfDate).toBe("2026-11-20");
    expect(nvda?.secSnapshot?.annuals.length).toBeGreaterThanOrEqual(3);
    expect(getStaticSampleDossier("nonexistent")).toBeNull();
  });
});
