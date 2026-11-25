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
  "ai/agent/ask/route.ts",
  "ai/agent/route.ts",
  "ai/copilot/route.ts",
  "auth/login/route.ts",
  "auth/logout/route.ts",
  "auth/me/route.ts",
  "auth/password/route.ts",
  "auth/profile/route.ts",
  "auth/register/route.ts",
  "auth/sessions/route.ts",
  "auth/tokens/route.ts",
  "export/portfolio/route.ts",
  "export/thesis/[id]/route.ts",
  "health/route.ts",
  "import/thesis/route.ts",
  "market/benchmarks/route.ts",
  "market/bootstrap/route.ts",
  "market/provider-test/route.ts",
  "market/quotes/route.ts",
  "market/refresh-prices/route.ts",
  "mcp/context/route.ts",
  "mcp/route.ts",
  "portfolio/calibration/route.ts",
  "sec/[ticker]/filing/route.ts",
  "sec/[ticker]/route.ts",
  "theses/[id]/discipline/route.ts",
  "theses/[id]/notes/route.ts",
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

function extractCookieHeader(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  return raw
    .map((line) => line.split(";")[0])
    .filter((pair) => pair && !pair.endsWith("="))
    .join("; ");
}

async function fetchJson(urlPath, init, cookieHeader = "") {
  const headers = {
    "Content-Type": "application/json",
    ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    ...(init?.headers ?? {}),
  };
  const res = await fetch(`${BASE}${urlPath}`, { ...init, headers });
  const data = await res.json();
  return { status: res.status, data, cookie: extractCookieHeader(res) };
}

async function verifyAuthAndIsolation() {
  const unauthTheses = await fetchJson("/api/theses");
  assert.equal(unauthTheses.status, 401);

  const badPhone = await fetchJson("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      phone: "12345",
      password: "Kanon2026!",
      confirmPassword: "Kanon2026!",
    }),
  });
  assert.equal(badPhone.status, 400);

  const regA = await fetchJson("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      phone: "138 0013 8001",
      displayName: "契约测试员A",
      password: "Kanon2026!",
      confirmPassword: "Kanon2026!",
      seedStarterWorkspace: true,
    }),
  });
  assert.equal(regA.status, 201);
  assert.equal(regA.data.user.phoneE164, "+8613800138001");
  assert.ok(regA.cookie.includes("kanon_session="));

  const dupA = await fetchJson("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      phone: "+86 138 0013 8001",
      password: "Kanon2026!",
      confirmPassword: "Kanon2026!",
    }),
  });
  assert.equal(dupA.status, 409);

  const wrongPwd = await fetchJson("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ phone: "13800138001", password: "WrongPassword1" }),
  });
  assert.equal(wrongPwd.status, 401);

  const loginA = await fetchJson("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ phone: "138 0013 8001", password: "Kanon2026!" }),
  });
  assert.equal(loginA.status, 200);
  const cookieA = loginA.cookie;

  const meA = await fetchJson("/api/auth/me", {}, cookieA);
  assert.equal(meA.status, 200);
  assert.equal(meA.data.user.id, regA.data.user.id);

  const regB = await fetchJson("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      phone: "139 0013 9002",
      displayName: "契约测试员B",
      password: "Kanon2026!",
      confirmPassword: "Kanon2026!",
      seedStarterWorkspace: false,
    }),
  });
  assert.equal(regB.status, 201);
  return { cookieA, cookieB: regB.cookie };
}

async function verifyCoreCrudAndDiscipline(cookieA, cookieB) {
  const health = await fetchJson("/api/health");
  assert.equal(health.status, 200);
  assert.equal(health.data.status, "healthy");

  const list = await fetchJson("/api/theses", {}, cookieA);
  assert.equal(list.status, 200);
  assert.ok(Array.isArray(list.data.theses) && list.data.theses.length >= 2);
  const nvdaId = list.data.theses.find((t) => t.ticker === "NVDA")?.id;
  assert.ok(nvdaId);

  const created = await fetchJson(
    "/api/theses",
    {
      method: "POST",
      body: JSON.stringify({
        ticker: "AVGO",
        companyName: "博通",
        sectorTag: "定制芯片 · 网络",
        currentPrice: 180,
      }),
    },
    cookieA,
  );
  assert.equal(created.status, 201);
  const id = created.data.thesis.id;

  const isolatedRead = await fetchJson(`/api/theses/${id}`, {}, cookieB);
  assert.equal(isolatedRead.status, 404);

  const patchedPort = await fetchJson(
    `/api/theses/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        step: "portfolio",
        portfolioRole: "starter",
        currentWeightPct: 5,
        targetMaxWeightPct: 12,
        avgCostBasis: 175,
      }),
    },
    cookieA,
  );
  assert.equal(patchedPort.status, 200);
  assert.equal(patchedPort.data.thesis.currentWeightPct, 5);

  const occConflict = await fetchJson(
    `/api/theses/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        step: "price_anchor",
        currentPrice: 181,
        expectedUpdatedAt: "2020-01-01T00:00:00.000Z",
      }),
    },
    cookieA,
  );
  assert.equal(occConflict.status, 409);

  const patchedDrivers = await fetchJson(
    `/api/theses/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        step: "valuation",
        valuationInput: patchedPort.data.thesis.valuationInput,
        modelMode: "ev_fcf",
        driverInputs: { baseOwnerFcfB: 26, ownerFcfMultipleBase: 22, cashB: 9, totalDebtB: 60 },
      }),
    },
    cookieA,
  );
  assert.equal(patchedDrivers.status, 200);
  assert.equal(patchedDrivers.data.thesis.valuationModelMode, "ev_fcf");
  assert.equal(patchedDrivers.data.thesis.valuationDriverInputs?.baseOwnerFcfB, 26);

  const thesisCsrfBlocked = await fetchJson(
    `/api/theses/${id}`,
    {
      method: "PATCH",
      headers: { Origin: "https://evil.example" },
      body: JSON.stringify({ step: "price_anchor", currentPrice: 182 }),
    },
    cookieA,
  );
  assert.equal(thesisCsrfBlocked.status, 403);

  const blocked = await fetchJson(
    `/api/theses/${id}/discipline`,
    {
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
    },
    cookieA,
  );
  assert.equal(blocked.status, 400);

  const passed = await fetchJson(
    `/api/theses/${id}/discipline`,
    {
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
    },
    cookieA,
  );
  assert.equal(passed.status, 201);

  const h0 = passed.data.thesis.hypotheses[0];
  const qrev = await fetchJson(
    `/api/theses/${id}/reviews`,
    {
      method: "POST",
      body: JSON.stringify({
        quarterLabel: "FY26 Q4",
        summary: "AI ASIC 订单强劲且自由现金流稳健",
        hypothesisVerdicts: [
          { hypothesisId: h0.id, title: h0.title, verdict: "strengthened", evidence: "订单超预期" },
        ],
        applyStatusUpdates: true,
      }),
    },
    cookieA,
  );
  assert.equal(qrev.status, 201);

  const revs = await fetchJson(`/api/theses/${id}/revisions`, {}, cookieA);
  assert.equal(revs.status, 200);
  assert.ok(revs.data.revisions.length >= 4);
  return { createdId: id, nvdaId };
}

async function verifyAiExportImportAndMcp(createdId, nvdaId, cookieA) {
  const copilot = await fetchJson(
    "/api/ai/copilot",
    { method: "POST", body: JSON.stringify({ action: "red_team", thesisId: nvdaId }) },
    cookieA,
  );
  assert.equal(copilot.status, 200);
  assert.equal(copilot.data.action, "red_team");

  const agentRes = await fetch(`${BASE}/api/ai/agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieA },
    body: JSON.stringify({ thesisId: nvdaId }),
  });
  assert.equal(agentRes.status, 200);
  const sseText = await agentRes.text();
  const readyLine = sseText
    .split("\n\n")
    .map((line) => line.replace(/^data:\s*/, "").trim())
    .filter(Boolean)
    .map((raw) => JSON.parse(raw))
    .find((evt) => evt.type === "briefing_ready");
  assert.ok(readyLine?.runId && readyLine.briefing.traces.length >= 6);
  assert.ok(typeof readyLine.briefing.bearRebuttal === "string");

  const propIds = readyLine.briefing.proposals.slice(0, 2).map((p) => p.id);
  const applied = await fetchJson(
    "/api/ai/agent/apply",
    { method: "POST", body: JSON.stringify({ runId: readyLine.runId, proposalIds: propIds }) },
    cookieA,
  );
  assert.equal(applied.status, 200);
  for (const pid of propIds) {
    assert.ok(applied.data.appliedProposalIds.includes(pid));
  }
  assert.ok(applied.data.thesis?.id === nvdaId);

  const runsHistory = await fetchJson(`/api/ai/agent?thesisId=${nvdaId}`, {}, cookieA);
  assert.equal(runsHistory.status, 200);
  assert.ok(runsHistory.data.runs.length >= 1);

  const askIc = await fetchJson(
    "/api/ai/agent/ask",
    {
      method: "POST",
      body: JSON.stringify({ thesisId: nvdaId, question: "当前隐含增速与安全买点是多少？" }),
    },
    cookieA,
  );
  assert.equal(askIc.status, 200);
  assert.ok(askIc.data.answer.length > 10);
  assert.ok(askIc.data.citations.length >= 1);

  const csv = await fetch(`${BASE}/api/export/portfolio`, { headers: { Cookie: cookieA } });
  assert.equal(csv.status, 200);
  const archive = await fetchJson(`/api/export/thesis/${createdId}?format=json`, {}, cookieA);
  assert.equal(archive.status, 200);
  assert.equal(archive.data.thesis.ticker, "AVGO");

  const imported = await fetchJson(
    "/api/import/thesis",
    {
      method: "POST",
      body: JSON.stringify({
        archive: { ...archive.data, thesis: { ...archive.data.thesis, ticker: "AVGO2" } },
        mode: "create_copy",
      }),
    },
    cookieA,
  );
  assert.equal(imported.status, 201);
  assert.equal(imported.data.thesis.ticker, "AVGO2");

  const mcpAll = await fetchJson("/api/mcp/context", {}, cookieA);
  assert.equal(mcpAll.status, 200);
  assert.equal(mcpAll.data.scope, "portfolio");
  const mcpNvda = await fetchJson("/api/mcp/context?ticker=NVDA", {}, cookieA);
  assert.equal(mcpNvda.status, 200);
  assert.equal(mcpNvda.data.thesis.ticker, "NVDA");

  const csrfRejected = await fetchJson(
    "/api/auth/profile",
    {
      method: "PATCH",
      headers: { Origin: "https://evil.example" },
      body: JSON.stringify({ displayName: "Blocked" }),
    },
    cookieA,
  );
  assert.equal(csrfRejected.status, 403);

  const profilePatch = await fetchJson(
    "/api/auth/profile",
    { method: "PATCH", body: JSON.stringify({ displayName: "买方契约测试员" }) },
    cookieA,
  );
  assert.equal(profilePatch.status, 200);
  assert.equal(profilePatch.data.user.displayName, "买方契约测试员");

  const sessList = await fetchJson("/api/auth/sessions", {}, cookieA);
  assert.equal(sessList.status, 200);
  assert.ok(sessList.data.sessions.length >= 1);
  const sessRevoke = await fetchJson("/api/auth/sessions", { method: "DELETE" }, cookieA);
  assert.equal(sessRevoke.status, 200);

  const pwdChange = await fetchJson(
    "/api/auth/password",
    {
      method: "POST",
      body: JSON.stringify({
        currentPassword: "Kanon2026!",
        newPassword: "Kanon2027#",
        confirmPassword: "Kanon2027#",
      }),
    },
    cookieA,
  );
  assert.equal(pwdChange.status, 200);

  const createdPat = await fetchJson(
    "/api/auth/tokens",
    { method: "POST", body: JSON.stringify({ name: "CI MCP", expiresInDays: 30 }) },
    cookieA,
  );
  assert.equal(createdPat.status, 201);
  const pat = createdPat.data.plaintextToken;
  assert.ok(pat.startsWith("kanon_pat_"));

  const patList = await fetchJson("/api/auth/tokens", {}, cookieA);
  assert.equal(patList.status, 200);
  assert.equal(patList.data.tokens.length, 1);

  const mcpInit = await fetchJson("/api/mcp", {
    method: "POST",
    headers: { Authorization: `Bearer ${pat}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
  });
  assert.equal(mcpInit.status, 200);
  assert.equal(mcpInit.data.result.serverInfo.name, "kanon-research-os");

  const mcpTools = await fetchJson("/api/mcp", {
    method: "POST",
    headers: { Authorization: `Bearer ${pat}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
  });
  assert.equal(mcpTools.status, 200);
  assert.equal(mcpTools.data.result.tools.length, 9);

  const mcpCall = await fetchJson("/api/mcp", {
    method: "POST",
    headers: { Authorization: `Bearer ${pat}` },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "get_thesis_dossier", arguments: { ticker: "NVDA" } },
    }),
  });
  assert.equal(mcpCall.status, 200);
  assert.equal(mcpCall.data.result.isError, false);

  const mcpCalibCall = await fetchJson("/api/mcp", {
    method: "POST",
    headers: { Authorization: `Bearer ${pat}` },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 301,
      method: "tools/call",
      params: { name: "get_portfolio_calibration", arguments: {} },
    }),
  });
  assert.equal(mcpCalibCall.status, 200);
  assert.equal(mcpCalibCall.data.result.isError, false);

  const mcpWriteBlocked = await fetchJson("/api/mcp", {
    method: "POST",
    headers: { Authorization: `Bearer ${pat}` },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 302,
      method: "tools/call",
      params: {
        name: "add_catalyst_event",
        arguments: {
          ticker: "NVDA",
          title: "Should Fail",
          dateLabel: "FY27 Q1",
          category: "earnings",
          impact: "medium",
          direction: "bullish",
          verificationMetric: "Margin > 70%",
        },
      },
    }),
  });
  assert.equal(mcpWriteBlocked.status, 200);
  assert.equal(mcpWriteBlocked.data.result.isError, true);

  const rwPatRes = await fetchJson(
    "/api/auth/tokens",
    {
      method: "POST",
      body: JSON.stringify({ name: "CI MCP RW", scope: "read_write", expiresInDays: 30 }),
    },
    cookieA,
  );
  assert.equal(rwPatRes.status, 201);
  const rwPat = rwPatRes.data.plaintextToken;

  const mcpWriteOk = await fetchJson("/api/mcp", {
    method: "POST",
    headers: { Authorization: `Bearer ${rwPat}` },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 303,
      method: "tools/call",
      params: {
        name: "add_catalyst_event",
        arguments: {
          ticker: "NVDA",
          title: "Vera Rubin 量产进度",
          dateLabel: "FY27 Q2",
          category: "product",
          impact: "high",
          direction: "bullish",
          verificationMetric: "出货量 > 预期",
        },
      },
    }),
  });
  assert.equal(mcpWriteOk.status, 200);
  assert.equal(mcpWriteOk.data.result.isError, false);

  const rwRevoke = await fetchJson(
    `/api/auth/tokens?id=${encodeURIComponent(rwPatRes.data.token.id)}`,
    { method: "DELETE" },
    cookieA,
  );
  assert.equal(rwRevoke.status, 200);

  const mcpResources = await fetchJson("/api/mcp", {
    method: "POST",
    headers: { Authorization: `Bearer ${pat}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 4, method: "resources/list" }),
  });
  assert.equal(mcpResources.status, 200);
  assert.ok(mcpResources.data.result.resources.length >= 2);

  const mcpContextPat = await fetchJson("/api/mcp/context", {
    headers: { Authorization: `Bearer ${pat}` },
  });
  assert.equal(mcpContextPat.status, 200);

  const patRevoke = await fetchJson(
    `/api/auth/tokens?id=${encodeURIComponent(createdPat.data.token.id)}`,
    { method: "DELETE" },
    cookieA,
  );
  assert.equal(patRevoke.status, 200);

  const revokedMcp = await fetchJson("/api/mcp", {
    method: "POST",
    headers: { Authorization: `Bearer ${pat}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 5, method: "ping" }),
  });
  assert.equal(revokedMcp.status, 401);

  const secFiling = await fetchJson("/api/sec/NVDA/filing", {}, cookieA);
  assert.equal(secFiling.status, 200);
  assert.equal(secFiling.data.ticker, "NVDA");

  const marketQuotes = await fetchJson("/api/market/quotes?tickers=NVDA", {}, cookieA);
  assert.equal(marketQuotes.status, 200);

  const benchmarks = await fetchJson("/api/market/benchmarks?ticker=NVDA&price=135", {}, cookieA);
  assert.equal(benchmarks.status, 200);
  assert.ok(Array.isArray(benchmarks.data.peers) && benchmarks.data.peers.length >= 3);

  const noteCreate = await fetchJson(
    `/api/theses/${nvdaId}/notes`,
    {
      method: "POST",
      body: JSON.stringify({
        kind: "earnings_call",
        periodLabel: "FY26 Q2",
        title: "法说会指引复盘",
        content: "管理层指引数据中心毛利率维持 74% 区间，Blackwell 产能持续爬坡。",
        guidanceMetric: "综合毛利率",
        guidancePromised: "74.0%",
        guidanceDelivered: "74.6%",
      }),
    },
    cookieA,
  );
  assert.equal(noteCreate.status, 201);
  const notesList = await fetchJson(`/api/theses/${nvdaId}/notes`, {}, cookieA);
  assert.equal(notesList.status, 200);
  assert.ok(notesList.data.notes.length >= 1);
  const noteDel = await fetchJson(
    `/api/theses/${nvdaId}/notes?noteId=${noteCreate.data.note.id}`,
    { method: "DELETE" },
    cookieA,
  );
  assert.equal(noteDel.status, 200);

  const calibration = await fetchJson("/api/portfolio/calibration", {}, cookieA);
  assert.equal(calibration.status, 200);
  assert.equal(typeof calibration.data.calibration.weightedCalibrationScore, "number");
  assert.equal(typeof calibration.data.digest.summaryLine, "string");

  const providerTest = await fetchJson(
    "/api/market/provider-test",
    { method: "POST", body: JSON.stringify({ provider: "yahoo", ticker: "NVDA" }) },
    cookieA,
  );
  assert.equal(providerTest.status, 200);

  const del1 = await fetchJson(`/api/theses/${createdId}`, { method: "DELETE" }, cookieA);
  const del2 = await fetchJson(
    `/api/theses/${imported.data.thesis.id}`,
    { method: "DELETE" },
    cookieA,
  );
  assert.equal(del1.status, 200);
  assert.equal(del2.status, 200);

  const logout = await fetchJson("/api/auth/logout", { method: "POST" }, cookieA);
  assert.equal(logout.status, 200);
  const afterLogout = await fetchJson("/api/theses", {}, cookieA);
  assert.equal(afterLogout.status, 401);
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
    const [homeRes, loginRes, registerRes, welcomeRes] = await Promise.all([
      fetch(`${BASE}/`, { redirect: "manual" }),
      fetch(`${BASE}/login`),
      fetch(`${BASE}/register`),
      fetch(`${BASE}/welcome`, { redirect: "manual" }),
    ]);
    assert.equal(homeRes.status, 307);
    assert.ok(homeRes.headers.get("location")?.endsWith("/login"));
    assert.equal(loginRes.status, 200);
    assert.equal(loginRes.headers.get("x-content-type-options"), "nosniff");
    assert.equal(loginRes.headers.get("x-frame-options"), "DENY");
    assert.ok(loginRes.headers.get("content-security-policy")?.includes("default-src 'self'"));
    assert.equal(registerRes.status, 200);
    assert.equal(welcomeRes.status, 307);
    assert.ok(welcomeRes.headers.get("location")?.endsWith("/login"));

    const { cookieA, cookieB } = await verifyAuthAndIsolation();
    const authedHomeRes = await fetch(`${BASE}/`, { headers: { Cookie: cookieA } });
    assert.equal(authedHomeRes.status, 200);
    const { createdId, nvdaId } = await verifyCoreCrudAndDiscipline(cookieA, cookieB);
    const canvasRes = await fetch(`${BASE}/thesis/${nvdaId}`, { headers: { Cookie: cookieA } });
    assert.equal(canvasRes.status, 200);
    await verifyAiExportImportAndMcp(createdId, nvdaId, cookieA);
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
