import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMemoryKanonDb, type KanonDb } from "../../client";
import { countHostedAiCallsToday, recordAiUsage } from "./ai-credentials-and-usage-store";

const base = {
  userId: "u-quota",
  route: "/api/ai/agent",
  model: "m",
  promptTokens: 0,
  completionTokens: 0,
  costUsd: 0,
};

describe("V2-2 hosted AI quota counter (G41)", () => {
  let db: KanonDb;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const mem = await createMemoryKanonDb();
    db = mem.db;
    close = mem.close;
  });

  afterAll(async () => {
    await close();
  });

  it("counts only hosted model calls: BYOK and grounded-local runs never consume the hosted quota", async () => {
    await recordAiUsage(db, { ...base, provider: "vercel-ai-sdk", keySource: "hosted" });
    await recordAiUsage(db, { ...base, provider: "vercel-ai-sdk", keySource: "hosted" });
    await recordAiUsage(db, { ...base, provider: "grounded-local", keySource: "hosted" });
    await recordAiUsage(db, { ...base, provider: "anthropic", keySource: "byok" });
    await recordAiUsage(db, {
      ...base,
      userId: "u-other",
      provider: "vercel-ai-sdk",
      keySource: "hosted",
    });
    expect(await countHostedAiCallsToday(db, "u-quota")).toBe(2);
  });
});
