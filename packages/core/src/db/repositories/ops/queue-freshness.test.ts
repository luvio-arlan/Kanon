import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMemoryKanonDb, type KanonDb } from "../../client";
import { createThesis } from "../thesis-mutations";
import { getQueueFreshness } from "./queue-freshness";

describe("V1-5 falsifiable data freshness (G38)", () => {
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

  it("flags researched tickers with stale or missing bars and counts superseded jobs that backlog hides", async () => {
    const before = await getQueueFreshness(db);
    const thesis = await createThesis(
      db,
      { ticker: "ZZZQ", companyName: "Stale Co", sectorTag: "Test", currentPrice: 10 },
      "u-fresh",
    );
    await db.execute(
      sql`UPDATE theses SET created_at = NOW() - INTERVAL '10 days' WHERE id = ${thesis.id}`,
    );
    await db.execute(sql`
      INSERT INTO jobs (id, kind, payload, priority, status, last_error, created_at)
      VALUES ('sync_sec:ZZZQ:x', 'sync_sec', '{"ticker":"ZZZQ"}'::jsonb, 52, 'skipped', 'superseded', NOW())
    `);
    const after = await getQueueFreshness(db);
    expect(after.staleTickers).toBe(before.staleTickers + 1);
    expect(after.superseded48h).toBe(before.superseded48h + 1);
  });
});
