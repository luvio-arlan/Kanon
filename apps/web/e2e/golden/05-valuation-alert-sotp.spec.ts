import { type APIRequestContext, expect, type Page, test } from "@playwright/test";
import { createAuthenticatedContext, GOLDEN_ACTORS } from "../support/actors";
import { InboxListResponseSchema, parseApiResponse } from "../support/contracts";
import { getCronSecret, readSharedState } from "../support/fixtures";

async function verifyValuationAndSotp(request: APIRequestContext, page: Page, thesisId: string) {
  const patchRes = await request.patch(`/api/theses/${thesisId}`, {
    data: {
      step: "valuation",
      valuationInput: {
        currentPrice: 135,
        horizonYears: 3,
        bear: { eps: 3.5, peMultiple: 20, probability: 0.25 },
        base: { eps: 6.0, peMultiple: 30, probability: 0.5 },
        bull: { eps: 8.5, peMultiple: 35, probability: 0.25 },
      },
    },
  });
  expect(patchRes.status()).toBe(200);

  await page.goto(`/thesis/${thesisId}?step=4`);
  const baseTarget = page.getByTestId("kanon-scenario-base-target");
  await expect(baseTarget).toBeVisible();
  await expect(baseTarget).toHaveAttribute("data-value", "180");

  await page.getByRole("button", { name: /SOTP/ }).click();
  await expect(page.getByText("尚未配置业务分部")).toBeVisible();
  await expect(page.getByText("核心增长引擎")).toHaveCount(0);
  await expect(page.getByText("成熟现金牛业务")).toHaveCount(0);
}

async function verifyEdgeTriggeredAlert(request: APIRequestContext, thesisId: string) {
  const ruleRes = await request.post("/api/inbox", {
    data: {
      op: "upsert_rule",
      thesisId,
      kind: "price_hurdle",
      configJson: { targetPrice: 140, direction: "below" },
      enabled: true,
    },
  });
  expect(ruleRes.status()).toBe(201);

  const authHeaders = { Authorization: `Bearer ${getCronSecret()}` };
  expect((await request.post("/api/internal/jobs/tick", { headers: authHeaders })).status()).toBe(
    200,
  );
  const inbox1 = await parseApiResponse(
    await request.get("/api/inbox"),
    InboxListResponseSchema,
    "inbox1",
  );
  expect(inbox1.items.filter((i) => i.kind === "price_hurdle").length).toBe(1);

  expect((await request.post("/api/internal/jobs/tick", { headers: authHeaders })).status()).toBe(
    200,
  );
  const inbox2 = await parseApiResponse(
    await request.get("/api/inbox"),
    InboxListResponseSchema,
    "inbox2",
  );
  expect(inbox2.items.filter((i) => i.kind === "price_hurdle").length).toBe(1);
}

test.describe
  .serial("05 · Valuation Scenarios, Edge-Triggered Alerts & SOTP Honesty", () => {
    test("verifies deterministic scenario readout, edge-triggered buy-zone alert, and clean SOTP empty state", async ({
      browser,
      baseURL,
    }) => {
      if (!baseURL) throw new Error("baseURL required");
      const thesisId = readSharedState().nvdaThesisId;
      if (!thesisId) throw new Error("Missing nvdaThesisId");
      const { context } = await createAuthenticatedContext(browser, baseURL, GOLDEN_ACTORS.owner);
      const page = await context.newPage();
      await verifyValuationAndSotp(context.request, page, thesisId);
      await verifyEdgeTriggeredAlert(context.request, thesisId);
      await context.close();
    });
  });
