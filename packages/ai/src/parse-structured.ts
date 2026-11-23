import type { z } from "zod";

export type StructuredParseResult<T> = { ok: true; data: T } | { ok: false; error: string };

export function parseStructuredOutput<TSchema extends z.ZodType>(
  schema: TSchema,
  rawPayload: unknown,
): StructuredParseResult<z.infer<TSchema>> {
  let candidate: unknown = rawPayload;
  if (typeof rawPayload === "string") {
    try {
      candidate = JSON.parse(rawPayload);
    } catch {
      return { ok: false, error: "LLM payload is not valid JSON." };
    }
  }
  const parsed = schema.safeParse(candidate);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.join(".") || "root";
    return {
      ok: false,
      error: `Schema validation failed at "${path}": ${issue?.message ?? "invalid output"}`,
    };
  }
  return { ok: true, data: parsed.data };
}
