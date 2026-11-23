import { describe, expect, it } from "vitest";
import { parseStructuredOutput } from "./parse-structured";
import { RedTeamReportSchema } from "./schemas/red-team";

describe("parseStructuredOutput", () => {
  it("parses valid RedTeamReport JSON strictly", () => {
    const valid = JSON.stringify({
      ticker: "MU",
      thesisSummary: "HBM3E ramp drives structurally higher through-cycle gross margin.",
      challenges: [
        {
          id: "c1",
          question: "What if Samsung passes HBM3E qualification at NVIDIA ahead of Q3?",
          falsificationPath: "Micron HBM market share stalls below 20% and ASPs compress >15%.",
          severity: "critical",
          sourceAnchor: "MU FY25 10-K Risk Factors, Item 1A",
        },
        {
          id: "c2",
          question: "Does industry wafer capex overshoot AI server digestion in 2027?",
          falsificationPath:
            "DRAM bit supply growth exceeds 25% while hyperscaler CapEx decelerates.",
          severity: "high",
          sourceAnchor: "Q4 Earnings Call Management Commentary",
        },
        {
          id: "c3",
          question: "Will elevated CapEx suppress free cash flow conversion below 15%?",
          falsificationPath: "FY26 CapEx/Revenue stays above 38% with declining ROIC.",
          severity: "moderate",
          sourceAnchor: "MU Q4 Cash Flow Statement",
        },
      ],
    });

    const result = parseStructuredOutput(RedTeamReportSchema, valid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.ticker).toBe("MU");
      expect(result.data.challenges).toHaveLength(3);
    }
  });

  it("rejects malformed JSON safely without throwing", () => {
    const result = parseStructuredOutput(RedTeamReportSchema, "{broken json");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("valid JSON");
    }
  });

  it("rejects schema-violating LLM payload with exact field path", () => {
    const incomplete = {
      ticker: "NVDA",
      thesisSummary: "Blackwell rack-scale moat.",
      challenges: [],
    };
    const result = parseStructuredOutput(RedTeamReportSchema, incomplete);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("challenges");
    }
  });
});
