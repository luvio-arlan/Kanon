import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

const ActorRefSchema = z.object({
  phone: z.string(),
  password: z.string(),
  userId: z.string().optional(),
});

const SharedE2eStateSchema = z.object({
  owner: ActorRefSchema.optional(),
  analyst: ActorRefSchema.optional(),
  pm: ActorRefSchema.optional(),
  viewer: ActorRefSchema.optional(),
  nvdaThesisId: z.string().optional(),
  orgId: z.string().optional(),
  approvalId: z.string().optional(),
});

const MockStateSchema = z.object({
  quotes: z.record(z.string(), z.number()).default({}),
});

const MockMetricsSchema = z.object({
  counts: z.record(z.string(), z.number()).default({}),
});

export type SharedE2eState = z.infer<typeof SharedE2eStateSchema>;

function getRunDir(): string {
  const dir = process.env.KANON_E2E_RUN_DIR;
  if (!dir) throw new Error("KANON_E2E_RUN_DIR is not initialized by playwright.config.ts");
  return dir;
}

export function getSharedStatePath(): string {
  return path.join(getRunDir(), "shared-e2e-state.json");
}

export function readSharedState(): SharedE2eState {
  const p = getSharedStatePath();
  if (!fs.existsSync(p)) return {};
  const parsed = SharedE2eStateSchema.safeParse(JSON.parse(fs.readFileSync(p, "utf8")));
  return parsed.success ? parsed.data : {};
}

export function patchSharedState(patch: Partial<SharedE2eState>): SharedE2eState {
  const next = { ...readSharedState(), ...patch };
  fs.writeFileSync(getSharedStatePath(), JSON.stringify(next, null, 2), "utf8");
  return next;
}

export function setMockQuotePrice(ticker: string, price: number): void {
  const statePath = path.join(getRunDir(), "mock-state.json");
  const curParsed = fs.existsSync(statePath)
    ? MockStateSchema.safeParse(JSON.parse(fs.readFileSync(statePath, "utf8")))
    : null;
  const cur = curParsed?.success ? curParsed.data : { quotes: {} };
  cur.quotes[ticker.toUpperCase()] = price;
  fs.writeFileSync(statePath, JSON.stringify(cur), "utf8");
}

export function readUpstreamCallCounts(): Record<string, number> {
  const metricsPath = path.join(getRunDir(), "mock-metrics.json");
  if (!fs.existsSync(metricsPath)) return {};
  const parsed = MockMetricsSchema.safeParse(JSON.parse(fs.readFileSync(metricsPath, "utf8")));
  return parsed.success ? parsed.data.counts : {};
}

export function todayIsoUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getCronSecret(): string {
  return "e2e-cron";
}
