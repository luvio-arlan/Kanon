import { z } from "zod";

export const RedTeamChallengeSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(10),
  falsificationPath: z.string().min(10),
  severity: z.enum(["critical", "high", "moderate"]),
  sourceAnchor: z.string().min(1),
});
export type RedTeamChallenge = z.infer<typeof RedTeamChallengeSchema>;

export const RedTeamReportSchema = z.object({
  ticker: z.string().min(1).max(10),
  thesisSummary: z.string().min(10),
  challenges: z.tuple([RedTeamChallengeSchema, RedTeamChallengeSchema, RedTeamChallengeSchema]),
});
export type RedTeamReport = z.infer<typeof RedTeamReportSchema>;
