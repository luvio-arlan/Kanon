import { eq } from "drizzle-orm";
import { roundTo } from "../../../math/valuation-scenarios";
import type { UpdateThesisStepInput } from "../../../schemas/research";
import type { KanonDb } from "../../client";
import { thesesTable, valuationScenariosTable } from "../../schema";

export async function writePriceAnchorStep(
  tx: KanonDb,
  thesisId: string,
  parsed: Extract<UpdateThesisStepInput, { step: "price_anchor" }>,
  now: Date,
): Promise<string> {
  const price = roundTo(parsed.currentPrice, 2);
  await tx
    .update(thesesTable)
    .set({ currentPrice: price, lastReviewedLabel: "刚刚校准 · 现价锚点", updatedAt: now })
    .where(eq(thesesTable.id, thesisId));

  const [existing] = await tx
    .select()
    .from(valuationScenariosTable)
    .where(eq(valuationScenariosTable.thesisId, thesisId));

  if (existing) {
    const label = parsed.label ?? "现价";
    const updatedHistory = existing.priceHistory.map((pt, idx, arr) =>
      idx === arr.length - 1 ? { label, price } : pt,
    );
    await tx
      .update(valuationScenariosTable)
      .set({ priceHistory: updatedHistory })
      .where(eq(valuationScenariosTable.thesisId, thesisId));
  }
  return `快速校准当前参考价至 $${price.toFixed(2)}`;
}
