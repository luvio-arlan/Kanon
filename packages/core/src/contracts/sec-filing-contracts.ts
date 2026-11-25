import { z } from "zod";

export const SecFilingSectionCategorySchema = z.enum([
  "mda",
  "risk_factors",
  "business",
  "general",
]);
export type SecFilingSectionCategory = z.infer<typeof SecFilingSectionCategorySchema>;

export const SecFilingSectionSchema = z.object({
  id: z.string().min(1),
  heading: z.string().min(1),
  category: SecFilingSectionCategorySchema,
  paragraphs: z.array(z.string().min(1)).max(40),
  signalHits: z.number().int().nonnegative(),
});
export type SecFilingSection = z.infer<typeof SecFilingSectionSchema>;

export const SecFilingDiffSchema = z.object({
  sectionHeading: z.string().min(1),
  previousForm: z.string().min(1),
  previousFilingDate: z.string().min(1),
  addedSnippets: z.array(z.string().min(1)).max(8),
  removedSnippets: z.array(z.string().min(1)).max(8),
  changeSummary: z.string().min(1),
});
export type SecFilingDiff = z.infer<typeof SecFilingDiffSchema>;

export const SecFilingReaderResponseSchema = z.object({
  ticker: z.string().min(1),
  form: z.string().min(1),
  filingDate: z.string(),
  accessionNumber: z.string(),
  documentUrl: z.string(),
  source: z.enum(["sec-edgar-live", "cached-summary"]),
  sections: z.array(SecFilingSectionSchema),
  fullExcerpt: z.string(),
  diff: SecFilingDiffSchema.nullable(),
  notice: z.string(),
});
export type SecFilingReaderResponse = z.infer<typeof SecFilingReaderResponseSchema>;
