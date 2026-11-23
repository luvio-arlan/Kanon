import { z } from "zod";
import { type RedTeamReport, RedTeamReportSchema } from "./red-team";

export const EarningsQuoteSchema = z.object({
  topic: z.string().min(1),
  summary: z.string().min(6),
  sourceAnchor: z.string().min(1),
});
export type EarningsQuote = z.infer<typeof EarningsQuoteSchema>;

export const EarningsDigestSchema = z.object({
  ticker: z.string().min(1).max(10),
  quarterLabel: z.string().min(1),
  guidanceSummary: z.string().min(10),
  capexSignals: z.array(z.string().min(4)).min(1).max(4),
  toneShifts: z.array(z.string().min(4)).min(1).max(4),
  quotesWithAnchors: z.array(EarningsQuoteSchema).min(1).max(4),
});
export type EarningsDigest = z.infer<typeof EarningsDigestSchema>;

export const InvestmentMemoSchema = z.object({
  ticker: z.string().min(1).max(10),
  headline: z.string().min(6),
  verdictSummary: z.string().min(10),
  moatAndQuality: z.string().min(10),
  keyEvidence: z.array(z.string().min(6)).min(2).max(5),
  nextQuarterChecklist: z.array(z.string().min(6)).min(2).max(4),
  exitDiscipline: z.string().min(8),
});
export type InvestmentMemo = z.infer<typeof InvestmentMemoSchema>;

export const CopilotActionSchema = z.enum(["earnings_digest", "red_team", "investment_memo"]);
export type CopilotAction = z.infer<typeof CopilotActionSchema>;

export const ByokProviderSchema = z.enum(["gemini", "anthropic", "openai"]);
export type ByokProvider = z.infer<typeof ByokProviderSchema>;

export const CopilotRequestSchema = z.object({
  thesisId: z.string().min(1),
  action: CopilotActionSchema,
  sourceText: z.string().max(12000).optional(),
});
export type CopilotRequest = z.infer<typeof CopilotRequestSchema>;

export const CopilotEngineModeSchema = z.enum(["vercel-ai-sdk", "grounded-local"]);
export type CopilotEngineMode = z.infer<typeof CopilotEngineModeSchema>;

export { type RedTeamReport, RedTeamReportSchema };
