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

export const VideoScriptSchema = z.object({
  ticker: z.string().min(1).max(10),
  title: z.string().min(4),
  estimatedMinutes: z.number().min(2).max(20),
  hook: z.string().min(10),
  businessContrast: z.string().min(10),
  firstPrinciplesEvidence: z.array(z.string().min(6)).min(2).max(5),
  riskDisclosure: z.string().min(10),
  closingLine: z.string().min(6),
});
export type VideoScript = z.infer<typeof VideoScriptSchema>;

export const CopilotActionSchema = z.enum(["earnings_digest", "red_team", "video_script"]);
export type CopilotAction = z.infer<typeof CopilotActionSchema>;

export const CopilotRequestSchema = z.object({
  thesisId: z.string().min(1),
  action: CopilotActionSchema,
});
export type CopilotRequest = z.infer<typeof CopilotRequestSchema>;

export const CopilotEngineModeSchema = z.enum(["vercel-ai-sdk", "grounded-local"]);
export type CopilotEngineMode = z.infer<typeof CopilotEngineModeSchema>;

export { type RedTeamReport, RedTeamReportSchema };
