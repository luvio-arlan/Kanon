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
  "auth/ai-credentials/route.ts",
  "auth/login/route.ts",
  "auth/logout/route.ts",
  "auth/me/route.ts",
  "auth/password/route.ts",
  "auth/profile/route.ts",
  "auth/register/route.ts",
  "auth/sessions/route.ts",
  "auth/tokens/route.ts",
  "auth/totp/route.ts",
  "calendar/[token]/route.ts",
  "export/portfolio/route.ts",
  "export/thesis/[id]/route.ts",
  "health/route.ts",
  "import/thesis/route.ts",
  "inbox/route.ts",
  "internal/jobs/tick/route.ts",
  "market/benchmarks/route.ts",
  "market/bootstrap/route.ts",
  "market/provider-test/route.ts",
  "market/quotes/route.ts",
  "market/refresh-prices/route.ts",
  "mcp/context/route.ts",
  "mcp/route.ts",
  "orgs/route.ts",
  "portfolio/attribution/route.ts",
  "portfolio/calibration/route.ts",
  "portfolio/ledger/route.ts",
  "portfolio/performance/route.ts",
  "portfolio/risk/route.ts",
  "sec/[ticker]/filing/route.ts",
  "sec/[ticker]/redline/route.ts",
  "sec/[ticker]/route.ts",
  "sec/[ticker]/segments/route.ts",
  "theses/[id]/discipline/route.ts",
  "theses/[id]/forecasts/route.ts",
  "theses/[id]/guidance/route.ts",
  "theses/[id]/ic/route.ts",
  "theses/[id]/model-versions/route.ts",
  "theses/[id]/notes/route.ts",
  "theses/[id]/peers/route.ts",
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
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `Invalid JSON from ${init?.method ?? "GET"} ${urlPath} (HTTP ${res.status}): ${text.slice(0, 300)}`,
      { cause: err },
    );
  }
  return { status: res.status, data, cookie: extractCookieHeader(res) };
}

async function verifyAuthAndIsolation() {
  const unauthTheses = await fetchJson("/api/theses");
  assert.equal(unauthTheses.status, 401);
  assert.ok(
    typeof unauthTheses.data.requestId === "string" &&
      unauthTheses.data.requestId.startsWith("req_"),
  );

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
  assert.equal(typeof health.data.secretsConfigured?.credentials, "boolean");
  assert.equal(typeof health.data.secretsConfigured?.cron, "boolean");
  assert.equal(typeof health.data.secretsConfigured?.secUserAgent, "boolean");
  assert.equal(
    health.data.db?.bypassRls,
    false,
    "G28: local enforced RLS must have bypassRls=false",
  );
  assert.equal(
    health.data.db?.rlsFailClosed,
    true,
    "G28: local enforced RLS must have rlsFailClosed=true",
  );
  assert.ok(
    ["ok", "grace_period", "never_ran", "stale"].includes(health.data.cron?.state),
    `G20: unexpected health.cron.state=${health.data.cron?.state}`,
  );

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
  assert.ok(sseText.includes(": connected"), "SSE stream should emit instant : connected frame");
  const readyLine = sseText
    .split(/\r?\n\r?\n/)
    .map((frame) =>
      frame
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n"),
    )
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

  const totpStatus = await fetchJson("/api/auth/totp", {}, cookieA);
  assert.equal(totpStatus.status, 200);
  assert.equal(totpStatus.data.enabled, false);
  const totpBegin = await fetchJson(
    "/api/auth/totp",
    { method: "POST", body: JSON.stringify({ action: "begin" }) },
    cookieA,
  );
  assert.equal(totpBegin.status, 200);
  assert.ok(totpBegin.data.otpauthUri.startsWith("otpauth://totp/KANON:"));

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

async function verifyHardenedEndpoints(createdId, nvdaId, cookieA, cookieB) {
  const unauthSec = await fetchJson("/api/sec/NVDA");
  assert.equal(unauthSec.status, 401);
  const unauthBoot = await fetchJson("/api/market/bootstrap?ticker=NVDA");
  assert.equal(unauthBoot.status, 401);

  const singleThesis = await fetchJson(`/api/theses/${nvdaId}`, {}, cookieA);
  assert.equal(singleThesis.status, 200);
  assert.equal(singleThesis.data.thesis.ticker, "NVDA");

  const [mdRes, gdocRes, csvRes] = await Promise.all([
    fetch(`${BASE}/api/export/thesis/${createdId}?format=md`, { headers: { Cookie: cookieA } }),
    fetch(`${BASE}/api/export/thesis/${createdId}?format=gdoc`, { headers: { Cookie: cookieA } }),
    fetch(`${BASE}/api/export/portfolio`, { headers: { Cookie: cookieA } }),
  ]);
  assert.equal(mdRes.status, 200);
  assert.ok(mdRes.headers.get("content-type")?.includes("text/markdown"));
  assert.equal(gdocRes.status, 200);
  assert.ok(gdocRes.headers.get("content-type")?.includes("text/html"));
  assert.equal(csvRes.status, 200);
  assert.ok(csvRes.headers.get("cache-control")?.includes("no-store"));

  const noteCreate = await fetchJson(
    `/api/theses/${nvdaId}/notes`,
    {
      method: "POST",
      body: JSON.stringify({
        kind: "guidance_log",
        periodLabel: "FY26 Q3",
        title: "Partial Patch Test",
        content: "Keep this body intact during partial PATCH.",
        guidanceMetric: "Operating Margin",
        guidancePromised: "62%",
        guidanceDelivered: "63%",
      }),
    },
    cookieA,
  );
  assert.equal(noteCreate.status, 201);
  const notePatch = await fetchJson(
    `/api/theses/${nvdaId}/notes`,
    {
      method: "PATCH",
      body: JSON.stringify({ noteId: noteCreate.data.note.id, title: "Partial Patch Updated" }),
    },
    cookieA,
  );
  assert.equal(notePatch.status, 200);
  assert.equal(notePatch.data.note.title, "Partial Patch Updated");
  assert.equal(notePatch.data.note.guidanceMetric, "Operating Margin");
  assert.equal(notePatch.data.note.guidancePromised, "62%");
  const noteClean = await fetchJson(
    `/api/theses/${nvdaId}/notes?noteId=${noteCreate.data.note.id}`,
    { method: "DELETE" },
    cookieA,
  );
  assert.equal(noteClean.status, 200);

  const putManualSec = await fetchJson(
    "/api/sec/CUSTOM",
    {
      method: "PUT",
      body: JSON.stringify({
        entityName: "Custom Isolated Holdings",
        reportingCurrency: "HKD",
        fxToUsd: 0.128,
        adrRatio: 1,
        annuals: [
          {
            fiscalYear: "FY2025",
            revenue: 12e9,
            grossProfit: 7e9,
            grossMarginPct: 58.3,
            netIncome: 3.2e9,
            operatingCashFlow: 4.1e9,
            capex: 0.9e9,
            freeCashFlow: 3.2e9,
            dilutedEps: 2.8,
          },
        ],
      }),
    },
    cookieA,
  );
  assert.equal(putManualSec.status, 200);
  const secA = await fetchJson("/api/sec/CUSTOM", {}, cookieA);
  assert.equal(secA.status, 200);
  assert.equal(secA.data.snapshot?.entityName, "Custom Isolated Holdings");
  const secB = await fetchJson("/api/sec/CUSTOM", {}, cookieB);
  assert.equal(secB.status, 200);
  assert.notEqual(secB.data.snapshot?.entityName, "Custom Isolated Holdings");

  const bootRes = await fetchJson("/api/market/bootstrap?ticker=NVDA", {}, cookieA);
  assert.equal(bootRes.status, 200);
  assert.equal(bootRes.data.ticker, "NVDA");

  const refreshCsrf = await fetchJson(
    "/api/market/refresh-prices",
    {
      method: "POST",
      headers: { Origin: "https://evil.example" },
      body: JSON.stringify({ mode: "regular" }),
    },
    cookieA,
  );
  assert.equal(refreshCsrf.status, 403);
  const refreshOk = await fetchJson(
    "/api/market/refresh-prices",
    { method: "POST", body: JSON.stringify({ mode: "regular" }) },
    cookieA,
  );
  assert.equal(refreshOk.status, 200);
  assert.ok(Array.isArray(refreshOk.data.updatedTheses));

  const cronUnauth = await fetchJson("/api/internal/jobs/tick", { method: "POST" });
  assert.ok([401, 503].includes(cronUnauth.status));
  const cronAuth = await fetchJson("/api/internal/jobs/tick", {
    method: "POST",
    headers: { authorization: "Bearer test-cron-secret-wave-u" },
  });
  assert.equal(cronAuth.status, 200, `G20: authorized tick failed with ${cronAuth.status}`);
  const healthAfterTick = await fetchJson("/api/health");
  assert.equal(healthAfterTick.status, 200);
  assert.equal(
    healthAfterTick.data.cron?.state,
    "ok",
    "G20: health.cron.state must be ok after authorized tick",
  );
  assert.ok(
    healthAfterTick.data.cron?.lastCompletedAt,
    "G20: health.cron.lastCompletedAt must be non-null",
  );

  const peerPost = await fetchJson(
    `/api/theses/${nvdaId}/peers`,
    { method: "POST", body: JSON.stringify({ ticker: "AMD", role: "competitor" }) },
    cookieA,
  );
  assert.equal(peerPost.status, 201);
  assert.ok(peerPost.data.peers.some((p) => p.ticker === "AMD"));
  const peerGet = await fetchJson(`/api/theses/${nvdaId}/peers`, {}, cookieA);
  assert.equal(peerGet.status, 200);
  const peerDel = await fetchJson(
    `/api/theses/${nvdaId}/peers?ticker=AMD`,
    { method: "DELETE" },
    cookieA,
  );
  assert.equal(peerDel.status, 200);

  const mvPost = await fetchJson(
    `/api/theses/${nvdaId}/model-versions`,
    {
      method: "POST",
      body: JSON.stringify({
        label: "Q3 DCF Base",
        modelKind: "fcff_dcf",
        inputs: { waccPct: 9.2 },
        outputs: { fairValuePerShare: 185 },
      }),
    },
    cookieA,
  );
  assert.equal(mvPost.status, 201);
  assert.equal(mvPost.data.version.versionNum, 1);
  const mvGet = await fetchJson(`/api/theses/${nvdaId}/model-versions`, {}, cookieA);
  assert.equal(mvGet.status, 200);
  assert.equal(mvGet.data.versions.length, 1);

  const credPost = await fetchJson(
    "/api/auth/ai-credentials",
    {
      method: "POST",
      body: JSON.stringify({
        provider: "openai",
        apiKey: "sk-test-secret-value-1234",
        label: "Research Key",
      }),
    },
    cookieA,
  );
  assert.equal(credPost.status, 201);
  assert.equal(credPost.data.credential.keyHint, "sk-••••1234");
  assert.equal("apiKey" in credPost.data.credential, false);
  const credGet = await fetchJson("/api/auth/ai-credentials", {}, cookieA);
  assert.equal(credGet.status, 200);
  assert.equal(credGet.data.credentials.length, 1);
  const credDel = await fetchJson(
    "/api/auth/ai-credentials?provider=openai",
    { method: "DELETE" },
    cookieA,
  );
  assert.equal(credDel.status, 200);

  const inboxGet = await fetchJson("/api/inbox", {}, cookieA);
  assert.equal(inboxGet.status, 200);
  assert.equal(typeof inboxGet.data.calendarConfigured, "boolean");
  const calRotate = await fetchJson(
    "/api/inbox",
    { method: "POST", body: JSON.stringify({ op: "rotate_calendar" }) },
    cookieA,
  );
  assert.equal(calRotate.status, 201);
  assert.ok(typeof calRotate.data.calendarToken === "string");
  const icsRes = await fetch(`${BASE}/api/calendar/${calRotate.data.calendarToken}`);
  assert.equal(icsRes.status, 200);
  assert.ok((await icsRes.text()).includes("BEGIN:VCALENDAR"));

  const fcPost = await fetchJson(
    `/api/theses/${nvdaId}/forecasts`,
    {
      method: "POST",
      body: JSON.stringify({
        question: "FY27 数据中心毛利率是否保持 70% 以上？",
        probabilities: [0.7, 0.3],
        resolveBy: "2027-03-01",
      }),
    },
    cookieA,
  );
  assert.equal(fcPost.status, 201);
  const fcPatch = await fetchJson(
    `/api/theses/${nvdaId}/forecasts`,
    {
      method: "PATCH",
      body: JSON.stringify({ forecastId: fcPost.data.forecast.id, outcomeIndex: 0 }),
    },
    cookieA,
  );
  assert.equal(fcPatch.status, 200);
  const fcReResolve = await fetchJson(
    `/api/theses/${nvdaId}/forecasts`,
    {
      method: "PATCH",
      body: JSON.stringify({ forecastId: fcPost.data.forecast.id, outcomeIndex: 1 }),
    },
    cookieA,
  );
  assert.equal(fcReResolve.status, 409);
  const fcGet = await fetchJson(`/api/theses/${nvdaId}/forecasts`, {}, cookieA);
  assert.equal(fcGet.status, 200);
  assert.ok(typeof fcGet.data.brierScore === "number");

  const acctPost = await fetchJson(
    "/api/portfolio/ledger",
    {
      method: "POST",
      body: JSON.stringify({ op: "create_account", name: "主账本", initialCash: 5000 }),
    },
    cookieA,
  );
  assert.equal(acctPost.status, 201);
  const negBuy = await fetchJson(
    "/api/portfolio/ledger",
    {
      method: "POST",
      body: JSON.stringify({
        op: "record_transaction",
        accountId: acctPost.data.account.id,
        ticker: "NVDA",
        action: "buy",
        quantity: -10,
        price: 100,
        tradeDate: "2026-01-15",
        noLeverageConfirmed: true,
      }),
    },
    cookieA,
  );
  assert.equal(negBuy.status, 400);
  const badBuy = await fetchJson(
    "/api/portfolio/ledger",
    {
      method: "POST",
      body: JSON.stringify({
        op: "record_transaction",
        accountId: acctPost.data.account.id,
        ticker: "NVDA",
        action: "buy",
        quantity: 100,
        price: 100,
        tradeDate: "2026-01-15",
        noLeverageConfirmed: true,
      }),
    },
    cookieA,
  );
  assert.equal(badBuy.status, 400);

  const orgPost = await fetchJson(
    "/api/orgs",
    { method: "POST", body: JSON.stringify({ op: "create_org", name: "Kanon Research Desk" }) },
    cookieA,
  );
  assert.equal(orgPost.status, 201);
  const orgGet = await fetchJson("/api/orgs", {}, cookieA);
  assert.equal(orgGet.status, 200);
  assert.equal(orgGet.data.organizations.length, 1);

  const inviteUnknown = await fetchJson(
    "/api/orgs",
    {
      method: "POST",
      body: JSON.stringify({
        op: "invite",
        orgId: orgPost.data.organization.id,
        phone: "13900009999",
        role: "viewer",
      }),
    },
    cookieA,
  );
  assert.equal(inviteUnknown.status, 202);
  assert.equal(inviteUnknown.data.accepted, true);

  const badAlertRule = await fetchJson(
    "/api/inbox",
    {
      method: "POST",
      body: JSON.stringify({
        op: "upsert_rule",
        kind: "kpi_breach",
        thesisId: nvdaId,
        configJson: {},
      }),
    },
    cookieA,
  );
  assert.equal(badAlertRule.status, 400);

  const icSubmit = await fetchJson(
    `/api/theses/${nvdaId}/ic`,
    { method: "POST", body: JSON.stringify({ op: "submit" }) },
    cookieA,
  );
  assert.equal(icSubmit.status, 201);
  const icCrossThesis = await fetchJson(
    `/api/theses/${createdId}/ic`,
    {
      method: "PATCH",
      body: JSON.stringify({
        approvalId: icSubmit.data.approval.id,
        decision: "approved",
        decisionNote: "IDOR attempt",
      }),
    },
    cookieA,
  );
  assert.equal(icCrossThesis.status, 404);
  const icDecide = await fetchJson(
    `/api/theses/${nvdaId}/ic`,
    {
      method: "PATCH",
      body: JSON.stringify({
        approvalId: icSubmit.data.approval.id,
        decision: "approved",
        decisionNote: "审批通过",
      }),
    },
    cookieA,
  );
  assert.equal(icDecide.status, 200);
  const icRepeat = await fetchJson(
    `/api/theses/${nvdaId}/ic`,
    {
      method: "PATCH",
      body: JSON.stringify({
        approvalId: icSubmit.data.approval.id,
        decision: "approved",
      }),
    },
    cookieA,
  );
  assert.equal(icRepeat.status, 409);
  const icGet = await fetchJson(`/api/theses/${nvdaId}/ic`, {}, cookieA);
  assert.equal(icGet.status, 200);
  assert.equal(icGet.data.approvals[0].state, "approved");

  // Wave R contracts: redline, segments, guidance HITL lifecycle
  const redlineRes = await fetchJson("/api/sec/NVDA/redline?section=risk_factors", {}, cookieA);
  assert.ok(redlineRes.status === 200 || redlineRes.status === 202);
  assert.equal(redlineRes.data.algoVersion, "redline/1");

  const segRes = await fetchJson("/api/sec/NVDA/segments?axis=business", {}, cookieA);
  assert.ok(segRes.status === 200 || segRes.status === 202);
  assert.equal(segRes.data.ticker, "NVDA");

  const gCreate = await fetchJson(
    `/api/theses/${nvdaId}/guidance`,
    {
      method: "POST",
      body: JSON.stringify({
        op: "create",
        input: {
          metric: "revenue",
          basis: "gaap",
          unit: "usd",
          targetFiscalYear: 2026,
          targetFiscalPeriod: "Q1",
          issuedOn: "2025-02-26",
          low: 42e9,
          high: 44e9,
          source: {
            kind: "manual",
            url: "https://www.sec.gov/nvda-q4",
            quote: "Revenue is expected to be $43.0 billion, plus or minus 2%.",
          },
        },
      }),
    },
    cookieA,
  );
  assert.equal(gCreate.status, 201);
  const draftItem = gCreate.data.items[0];
  assert.equal(draftItem.status, "draft_legacy");
  const gConfirm = await fetchJson(
    `/api/theses/${nvdaId}/guidance`,
    {
      method: "POST",
      body: JSON.stringify({
        op: "confirm",
        id: draftItem.id,
        expectedUpdatedAt: draftItem.updatedAt,
      }),
    },
    cookieA,
  );
  assert.equal(gConfirm.status, 200);
  assert.equal(gConfirm.data.items[0].status, "confirmed");

  // Wave S contracts: performance, risk, attribution
  const perfRes = await fetchJson("/api/portfolio/performance", {}, cookieA);
  assert.equal(perfRes.status, 200);
  assert.ok(typeof perfRes.data.status === "string");

  const riskRes = await fetchJson("/api/portfolio/risk", {}, cookieA);
  assert.equal(riskRes.status, 200);
  assert.ok(
    ["ledger_daily_cov", "insufficient_history", "empty"].includes(riskRes.data.basis),
    `Unexpected risk basis: ${riskRes.data.basis}`,
  );

  const attrRes = await fetchJson("/api/portfolio/attribution", {}, cookieA);
  assert.equal(attrRes.status, 200);
  assert.ok(attrRes.data.status === "ready" || attrRes.data.status === "empty");
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
    env: {
      ...process.env,
      PORT: String(PORT),
      KANON_DATA_DIR: tmpDir,
      KANON_RLS_ENFORCE_LOCAL: "1",
      CRON_SECRET: "test-cron-secret-wave-u",
    },
    stdio: "pipe",
  });

  try {
    await waitForServer();
    const [homeRes, loginRes, registerRes, welcomeRes, thesisUnauthRes] = await Promise.all([
      fetch(`${BASE}/`, { redirect: "manual" }),
      fetch(`${BASE}/login`),
      fetch(`${BASE}/register`),
      fetch(`${BASE}/welcome`, { redirect: "manual" }),
      fetch(`${BASE}/thesis/demo-id?step=4`, { redirect: "manual" }),
    ]);
    assert.equal(homeRes.status, 307);
    assert.ok(homeRes.headers.get("location")?.endsWith("/login"));
    assert.equal(thesisUnauthRes.status, 307);
    assert.ok(thesisUnauthRes.headers.get("location")?.includes("/login?next=%2Fthesis%2Fdemo-id"));
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
    await verifyHardenedEndpoints(createdId, nvdaId, cookieA, cookieB);
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
