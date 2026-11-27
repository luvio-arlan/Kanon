import { z } from "zod";

export const CatalystCategorySchema = z.enum([
  "earnings",
  "product",
  "capital",
  "regulatory",
  "macro",
]);
export type CatalystCategory = z.infer<typeof CatalystCategorySchema>;

export const CatalystImpactSchema = z.enum(["high", "medium"]);
export type CatalystImpact = z.infer<typeof CatalystImpactSchema>;

export const CatalystDirectionSchema = z.enum(["bullish", "bearish", "binary"]);
export type CatalystDirection = z.infer<typeof CatalystDirectionSchema>;

export const CatalystStatusSchema = z.enum(["upcoming", "realized", "missed"]);
export type CatalystStatus = z.infer<typeof CatalystStatusSchema>;

export const ThesisCatalystSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(2).max(120),
  dateLabel: z.string().max(32).default(""),
  category: CatalystCategorySchema,
  impact: CatalystImpactSchema.nullable(),
  direction: CatalystDirectionSchema.nullable(),
  status: CatalystStatusSchema.default("upcoming"),
  verificationMetric: z.string().min(1).max(120),
  note: z.string().max(400).default(""),
});
export type ThesisCatalyst = z.infer<typeof ThesisCatalystSchema>;
