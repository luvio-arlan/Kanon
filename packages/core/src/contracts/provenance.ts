import { z } from "zod";

const SecFactProvenanceSchema = z.object({
  kind: z.literal("sec_fact"),
  accession: z.string().min(1),
  concept: z.string().min(1),
  xbrlTag: z.string().min(1),
  filedAt: z.string().min(1),
  url: z.string().url().optional(),
});

const VendorProvenanceSchema = z.object({
  kind: z.literal("vendor"),
  provider: z.string().min(1),
  asOf: z.string().min(1),
  licensed: z.boolean().optional(),
});

const UserInputProvenanceSchema = z.object({
  kind: z.literal("user_input"),
  userId: z.string().min(1),
  editedAt: z.string().min(1),
});

const FallbackProvenanceSchema = z.object({
  kind: z.literal("fallback"),
  reason: z.string().min(1),
});

export type Provenance =
  | z.infer<typeof SecFactProvenanceSchema>
  | z.infer<typeof VendorProvenanceSchema>
  | z.infer<typeof UserInputProvenanceSchema>
  | z.infer<typeof FallbackProvenanceSchema>
  | { kind: "derived"; formula: string; inputs: Provenance[] };

export const ProvenanceSchema: z.ZodType<Provenance> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    SecFactProvenanceSchema,
    VendorProvenanceSchema,
    UserInputProvenanceSchema,
    FallbackProvenanceSchema,
    z.object({
      kind: z.literal("derived"),
      formula: z.string().min(1),
      inputs: z.array(ProvenanceSchema),
    }),
  ]),
);

export interface ProvenancedMetric {
  value: number | null;
  provenance: Provenance;
  asOf: string;
}
