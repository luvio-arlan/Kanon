import { type APIRequestContext, expect, type Page, test } from "@playwright/test";
import { createAuthenticatedContext, GOLDEN_ACTORS } from "../support/actors";
import {
  CreateThesisResponseSchema,
  HealthResponseSchema,
  parseApiResponse,
} from "../support/contracts";
import { patchSharedState, readUpstreamCallCounts } from "../support/fixtures";

async function createNvdaThroughModal(page: Page, request: APIRequestContext): Promise<string> {
  await page.goto("/");
  await page.getByRole("button", { name: "新建标的" }).first().click();
  await expect(page.getByRole("heading", { name: "新建研究标的" })).toBeVisible();

  const tickerInput = page.getByLabel("股票代码");
  const priceInput = page.getByLabel("当前参考价 ($)");
  const createBtn = page.getByRole("button", { name: "创建并开始研究" });

  await expect(createBtn).toBeDisabled();
  await tickerInput.fill("NVDA");
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/market/bootstrap")),
    tickerInput.blur(),
  ]);
  await expect(priceInput).not.toHaveValue("");
  await expect(createBtn).toBeEnabled();

  const [createRes] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/api/theses") && r.request().method() === "POST"),
    createBtn.click(),
  ]);
  expect(createRes.status()).toBe(201);
  await expect(page).toHaveURL(/\/thesis\/[^/?]+(?:\?step=1)?$/);
  const match = /\/thesis\/([^/?]+)/.exec(page.url());
  const thesisId = match?.[1] ?? "";
  expect(thesisId.length).toBeGreaterThan(0);
  const verifyRes = await request.get(`/api/theses/${thesisId}`);
  expect(verifyRes.status()).toBe(200);
  await parseApiResponse(verifyRes, CreateThesisResponseSchema, "GET /api/theses/:id");
  return thesisId;
}

async function verifySameDayDedup(request: APIRequestContext, thesisId: string): Promise<string> {
  const healthRes = await request.get("/api/health");
  expect(healthRes.status()).toBe(200);
  await parseApiResponse(healthRes, HealthResponseSchema, "GET /api/health");

  const before =
    readUpstreamCallCounts()["data.sec.gov/api/xbrl/companyfacts/CIK0001045810.json"] ?? 0;
  expect((await request.delete(`/api/theses/${thesisId}`)).status()).toBe(200);

  const recreateRes = await request.post("/api/theses", {
    data: {
      ticker: "NVDA",
      companyName: "NVIDIA Corporation",
      sectorTag: "AI 算力",
      currentPrice: 135,
    },
  });
  expect(recreateRes.status()).toBe(201);
  const recreated = await parseApiResponse(
    recreateRes,
    CreateThesisResponseSchema,
    "recreate NVDA",
  );
  const after =
    readUpstreamCallCounts()["data.sec.gov/api/xbrl/companyfacts/CIK0001045810.json"] ?? 0;
  expect(after).toBe(before);
  return recreated.thesis.id;
}

test.describe
  .serial("02 · Thesis Creation, Auto-Bootstrap & Queue Deduplication", () => {
    test("creates NVDA via modal with blur bootstrap and verifies Q5-8 same-day dedup", async ({
      browser,
      baseURL,
    }) => {
      if (!baseURL) throw new Error("baseURL required");
      const { context } = await createAuthenticatedContext(browser, baseURL, GOLDEN_ACTORS.owner);
      const page = await context.newPage();
      const firstId = await createNvdaThroughModal(page, context.request);
      const finalId = await verifySameDayDedup(context.request, firstId);
      patchSharedState({ nvdaThesisId: finalId });
      await context.close();
    });
  });
