import assert from "node:assert/strict";

async function verifySecAndMarketHardening(ctx, createdId, nvdaId, cookieA, cookieB) {
  const { BASE, fetchJson } = ctx;
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
}

async function verifyCronWorkflowsAndOrgs(ctx, createdId, nvdaId, cookieA) {
  const { BASE, fetchJson } = ctx;
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
}

async function verifyWavesRSAndU(ctx, nvdaId, cookieA, cookieB) {
  const { BASE, fetchJson } = ctx;
  const redlineRes = await fetchJson("/api/sec/NVDA/redline?section=risk_factors", {}, cookieA);
  assert.ok(redlineRes.status === 200 || redlineRes.status === 202);
  assert.equal(redlineRes.data.algoVersion, "redline/2");

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

  // Wave U3-1: x-request-id echo + invalid replacement + client error telemetry + health errors24h
  const healthValidReq = await fetch(`${BASE}/api/health`, {
    headers: { "x-request-id": "wave_u3_trace_01" },
  });
  assert.equal(healthValidReq.status, 200);
  assert.equal(healthValidReq.headers.get("x-request-id"), "wave_u3_trace_01");

  const healthBadReq = await fetch(`${BASE}/api/health`, {
    headers: { "x-request-id": "bad!@#id" },
  });
  assert.equal(healthBadReq.status, 200);
  const replacedId = healthBadReq.headers.get("x-request-id") ?? "";
  assert.notEqual(replacedId, "bad!@#id");
  assert.match(replacedId, /^[A-Za-z0-9_-]{8,64}$/);

  const telCsrf = await fetchJson("/api/telemetry/client-errors", {
    method: "POST",
    headers: { Origin: "https://evil.example" },
    body: JSON.stringify({
      route: "/thesis/nvda",
      digest: "0123456789abcdef",
      kind: "render",
      buildId: "test",
    }),
  });
  assert.equal(telCsrf.status, 403);

  const telOk = await fetchJson("/api/telemetry/client-errors", {
    method: "POST",
    body: JSON.stringify({
      route: "/thesis/nvda",
      digest: "0123456789abcdef",
      kind: "render",
      buildId: "test",
    }),
  });
  assert.equal(telOk.status, 202);
  assert.equal(telOk.data.accepted, true);

  const healthAfterErr = await fetchJson("/api/health");
  assert.equal(healthAfterErr.status, 200);
  assert.ok(healthAfterErr.data.errors24h >= 1, "U3-1: health.errors24h must reflect telemetry");

  // Burst rate limit on telemetry endpoint (30/min/IP)
  let saw429 = false;
  for (let i = 0; i < 32; i += 1) {
    const r = await fetchJson("/api/telemetry/client-errors", {
      method: "POST",
      body: JSON.stringify({
        route: "/thesis/nvda",
        digest: "fedcba9876543210",
        kind: "fetch",
        buildId: "test",
      }),
    });
    if (r.status === 429) {
      saw429 = true;
      break;
    }
  }
  assert.equal(saw429, true, "U3-1: telemetry endpoint must rate-limit at 30/min");

  // Wave U3-3: IC Presentation Mode SSR auth & tenant isolation
  const [presentUnauth, presentA, presentB] = await Promise.all([
    fetch(`${BASE}/thesis/${nvdaId}/present`, { redirect: "manual" }),
    fetch(`${BASE}/thesis/${nvdaId}/present`, { headers: { Cookie: cookieA } }),
    fetch(`${BASE}/thesis/${nvdaId}/present`, { headers: { Cookie: cookieB } }),
  ]);
  assert.equal(presentUnauth.status, 307);
  assert.equal(presentA.status, 200);
  const presentBHtml = await presentB.text();
  assert.ok(
    presentB.status === 404 || presentBHtml.includes("NEXT_HTTP_ERROR_FALLBACK;404"),
    `U3-3: non-member must receive 404 fallback (status=${presentB.status})`,
  );
  assert.equal(
    presentBHtml.includes("英伟达"),
    false,
    "U3-3: non-member presentation response must not leak tenant A data",
  );
}

export async function verifyHardenedEndpoints(ctx, createdId, nvdaId, cookieA, cookieB) {
  await verifySecAndMarketHardening(ctx, createdId, nvdaId, cookieA, cookieB);
  await verifyCronWorkflowsAndOrgs(ctx, createdId, nvdaId, cookieA);
  await verifyWavesRSAndU(ctx, nvdaId, cookieA, cookieB);
}
