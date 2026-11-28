import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  searchFilingChunksFts,
  upsertFiling,
  upsertFilingChunks,
  upsertSecurity,
} from "@kanon/core/db";
import { createMemoryKanonDb } from "@kanon/core/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { planBilingualQuery } from "./query-plan";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN_DIR = path.resolve(HERE, "../../evals/golden");

interface FixtureChunk {
  accession: string;
  sectionCode: string;
  text: string;
}
interface CorpusFile {
  tickers: Record<string, { chunks: Record<string, FixtureChunk> }>;
}
interface GoldenCase {
  id: string;
  ticker: string;
  lang: "zh" | "en";
  question: string;
  evidence: { factIds: string[]; chunkIds: string[] };
}

describe("U0-12 / G27 · Production PGlite GIN FTS Recall@6 Gate", () => {
  const corpus = JSON.parse(
    fs.readFileSync(path.join(GOLDEN_DIR, "fixtures/corpus.json"), "utf8"),
  ) as CorpusFile;
  const cases = JSON.parse(
    fs.readFileSync(path.join(GOLDEN_DIR, "cases/golden-cases.json"), "utf8"),
  ) as GoldenCase[];
  const baseline = JSON.parse(fs.readFileSync(path.join(GOLDEN_DIR, "baseline.json"), "utf8")) as {
    thresholds: Record<string, number>;
  };

  let db: Awaited<ReturnType<typeof createMemoryKanonDb>>["db"];
  let close: () => Promise<void>;

  beforeAll(async () => {
    const handle = await createMemoryKanonDb();
    db = handle.db;
    close = handle.close;
    const seenFilings = new Set<string>();
    for (const [ticker, fix] of Object.entries(corpus.tickers)) {
      const sec = await upsertSecurity(db, { ticker, name: ticker });
      for (const ch of Object.values(fix.chunks)) {
        if (seenFilings.has(ch.accession)) continue;
        seenFilings.add(ch.accession);
        await upsertFiling(db, {
          accession: ch.accession,
          securityId: sec.id,
          cik: "0000000000",
          form: "10-K",
          filedAt: "2025-02-26",
          periodEnd: "2025-01-26",
          primaryDocUrl: `https://www.sec.gov/Archives/edgar/data/0/${ch.accession}.htm`,
        });
      }
    }
    const allChunks = Object.entries(corpus.tickers).flatMap(([ticker, fix]) =>
      Object.entries(fix.chunks).map(([id, ch], idx) => ({
        id,
        accession: ch.accession,
        ticker,
        sectionCode: ch.sectionCode,
        paraIndex: idx,
        text: ch.text,
        extractVersion: "sections/1",
      })),
    );
    await upsertFilingChunks(db, allChunks);
  });

  afterAll(async () => {
    await close();
  });

  it("achieves production GIN FTS Recall@6 >= 0.85 overall and >= 0.80 on zh->en queries", async () => {
    const withChunks = cases.filter((c) => c.evidence.chunkIds.length > 0);
    const outcomes: Array<{ id: string; lang: "zh" | "en"; matched: boolean }> = [];
    for (const c of withChunks) {
      const plan = planBilingualQuery(c.question);
      const hits = plan.tsQuery
        ? await searchFilingChunksFts(db, {
            ticker: c.ticker,
            tsQuery: plan.tsQuery,
            limit: 6,
          })
        : [];
      const topIds = new Set(hits.map((h) => h.id));
      const matched = c.evidence.chunkIds.every((cid) => topIds.has(cid));
      outcomes.push({ id: c.id, lang: c.lang, matched });
    }
    const allRate = outcomes.filter((o) => o.matched).length / outcomes.length;
    const zh = outcomes.filter((o) => o.lang === "zh");
    const zhRate = zh.filter((o) => o.matched).length / zh.length;
    expect(allRate).toBeGreaterThanOrEqual(baseline.thresholds.recallAt6All ?? 0.85);
    expect(zhRate).toBeGreaterThanOrEqual(baseline.thresholds.recallAt6ZhToEn ?? 0.8);
  });
});
