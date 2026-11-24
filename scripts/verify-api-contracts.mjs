import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = process.cwd();
const API_DIR = path.join(ROOT, "apps/web/src/app/api");
const PORT = 3141;
const BASE = `http://127.0.0.1:${PORT}`;

const KNOWN_ROUTES = [
  "ai/agent/apply/route.ts",
  "ai/agent/route.ts",
  "ai/copilot/route.ts",
  "export/portfolio/route.ts",
  "export/thesis/[id]/route.ts",
  "health/route.ts",
  "import/thesis/route.ts",
  "market/bootstrap/route.ts",
  "market/refresh-prices/route.ts",
  "mcp/context/route.ts",
  "sec/[ticker]/route.ts",
  "theses/[id]/discipline/route.ts",
  "theses/[id]/reviews/route.ts",
  "theses/[id]/revisions/route.ts",
  "theses/[id]/route.ts",
  "theses/route.ts",
];

function discoverApiRoutes(dir, prefix = "") {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith("_")) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...discoverApiRoutes(full, rel));
    else if (entry.name === "route.ts") results.push(rel);
  }
  return results.sort();
}

async function waitForServer(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      // Server still starting
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Next.js server did not become healthy on ${BASE} within ${timeoutMs}ms`);
}

async function fetchJson(urlPath, init) {
  const res = await fetch(`${BASE}${urlPath}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function verifyCoreCrudAndDiscipline() {
  const health = await fetchJson("/api/health");
  assert.equal(health.status, 200);
  assert.equal(health.data.status, "healthy");

  const list = await fetchJson("/api/theses");
  assert.equal(list.status, 200);
  assert.ok(Array.isArray(list.data.theses) && list.data.theses.length >= 2);

  const created = await fetchJson("/api/theses", {
    method: "POST",
    body: JSON.stringify({
      ticker: "AVGO",
      companyName: "博通",
      sectorTag: "定制芯片 · 网络",
      currentPrice: 180,
    }),
  });
  assert.equal(created.status, 201);
  const id = created.data.thesis.id;

  const patchedPort = await fetchJson(`/api/theses/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      step: "portfolio",
      portfolioRole: "starter",
      currentWeightPct: 5,
      targetMaxWeightPct: 12,
      avgCostBasis: 175,
    }),
  });
  assert.equal(patchedPort.status, 200);
  assert.equal(patchedPort.data.thesis.currentWeightPct, 5);

  const blocked = await fetchJson(`/api/theses/${id}/discipline`, {
    method: "POST",
    body: JSON.stringify({
      action: "buy",
      noLeverageConfirmed: false,
      positionCapConfirmed: true,
      exitRule: "测试零杠杆拦截",
      emotion: "fomo",
      priceAnchor: 180,
      note: "",
    }),
  });
  assert.equal(blocked.status, 400);

  const passed = await fetchJson(`/api/theses/${id}/discipline`, {
    method: "POST",
    body: JSON.stringify({
      action: "buy",
      noLeverageConfirmed: true,
      positionCapConfirmed: true,
      exitRule: "定制芯片毛利率跌破阈值无条件减仓",
      emotion: "calm",
      priceAnchor: 180,
      note: "零杠杆执行",
    }),
  });
  assert.equal(passed.status, 201);

  const h0 = passed.data.thesis.hypotheses[0];
  const qrev = await fetchJson(`/api/theses/${id}/reviews`, {
    method: "POST",
    body: JSON.stringify({
      quarterLabel: "FY26 Q4",
      summary: "AI ASIC 订单强劲且自由现金流稳健",
      hypothesisVerdicts: [
        { hypothesisId: h0.id, title: h0.title, verdict: "strengthened", evidence: "订单超预期" },
      ],
      applyStatusUpdates: true,
    }),
  });
  assert.equal(qrev.status, 201);
  assert.equal(qrev.data.review.quarterLabel, "FY26 Q4");

  const revs = await fetchJson(`/api/theses/${id}/revisions`);
  assert.equal(revs.status, 200);
  assert.ok(revs.data.revisions.length >= 4);
  return id;
}

async function verifyAiExportImportAndMcp(createdId) {
  const copilot = await fetchJson("/api/ai/copilot", {
    method: "POST",
    body: JSON.stringify({ action: "red_team", thesisId: "thesis-nvda" }),
  });
  assert.equal(copilot.status, 200);
  assert.equal(copilot.data.action, "red_team");

  const agentRes = await fetch(`${BASE}/api/ai/agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ thesisId: "thesis-nvda" }),
  });
  assert.equal(agentRes.status, 200);
  const sseText = await agentRes.text();
  const readyLine = sseText
    .split("\n\n")
    .map((line) => line.replace(/^data:\s*/, "").trim())
    .filter(Boolean)
    .map((raw) => JSON.parse(raw))
    .find((evt) => evt.type === "briefing_ready");
  assert.ok(readyLine?.runId && readyLine.briefing.traces.length === 5);

  const firstPropId = readyLine.briefing.proposals[0]?.id ?? "prop-test";
  const applied = await fetchJson("/api/ai/agent/apply", {
    method: "POST",
    body: JSON.stringify({ runId: readyLine.runId, proposalId: firstPropId }),
  });
  assert.equal(applied.status, 200);
  assert.ok(applied.data.appliedProposalIds.includes(firstPropId));

  const csv = await fetch(`${BASE}/api/export/portfolio`);
  assert.equal(csv.status, 200);
  const archive = await fetchJson(`/api/export/thesis/${createdId}?format=json`);
  assert.equal(archive.status, 200);
  assert.equal(archive.data.thesis.ticker, "AVGO");

  const imported = await fetchJson("/api/import/thesis", {
    method: "POST",
    body: JSON.stringify({
      archive: { ...archive.data, thesis: { ...archive.data.thesis, ticker: "AVGO2" } },
      mode: "create_copy",
    }),
  });
  assert.equal(imported.status, 201);
  assert.equal(imported.data.thesis.ticker, "AVGO2");

  const mcpAll = await fetchJson("/api/mcp/context");
  assert.equal(mcpAll.status, 200);
  assert.equal(mcpAll.data.scope, "portfolio");
  const mcpNvda = await fetchJson("/api/mcp/context?ticker=NVDA");
  assert.equal(mcpNvda.status, 200);
  assert.equal(mcpNvda.data.thesis.ticker, "NVDA");

  const del1 = await fetchJson(`/api/theses/${createdId}`, { method: "DELETE" });
  const del2 = await fetchJson(`/api/theses/${imported.data.thesis.id}`, { method: "DELETE" });
  assert.equal(del1.status, 200);
  assert.equal(del2.status, 200);
}

async function main() {
  const discovered = discoverApiRoutes(API_DIR);
  assert.deepEqual(
    discovered,
    [...KNOWN_ROUTES].sort(),
    "Discovered API routes drifted from contract inventory — update verify-api-contracts.mjs",
  );

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kanon-api-verify-"));
  const server = spawn("pnpm", ["--filter", "@kanon/web", "start"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), KANON_DATA_DIR: tmpDir },
    stdio: "pipe",
  });

  try {
    await waitForServer();
    const homeRes = await fetch(`${BASE}/`);
    assert.equal(homeRes.status, 200);
    const canvasRes = await fetch(`${BASE}/thesis/thesis-nvda`);
    assert.equal(canvasRes.status, 200);

    const createdId = await verifyCoreCrudAndDiscipline();
    await verifyAiExportImportAndMcp(createdId);
    process.stdout.write(
      `KANON API & SSR Contract Verification passed (${discovered.length} routes inventoried & verified).\n`,
    );
  } finally {
    server.kill("SIGTERM");
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  process.stderr.write(
    `KANON API Contract Verification FAILED: ${err instanceof Error ? err.stack : String(err)}\n`,
  );
  process.exit(1);
});
