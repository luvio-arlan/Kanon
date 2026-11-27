import { type APIRequestContext, expect, type Page, test } from "@playwright/test";
import { createAuthenticatedContext, GOLDEN_ACTORS } from "../support/actors";
import { ForecastCreateResponseSchema, parseApiResponse } from "../support/contracts";
import { readSharedState } from "../support/fixtures";

async function verifyForecastLockAndImmutability(
  request: APIRequestContext,
  page: Page,
  thesisId: string,
) {
  await page.getByRole("tab", { name: "认知校准" }).click();
  const questionText = "NVDA 未来 4 季毛利率维持 70% 以上";
  await page.getByPlaceholder(/毛利率维持/).fill(questionText);
  const [createRes] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().includes(`/api/theses/${thesisId}/forecasts`) && r.request().method() === "POST",
    ),
    page.getByRole("button", { name: "锁定预测" }).click(),
  ]);
  expect(createRes.status()).toBe(201);
  const created = await parseApiResponse(
    createRes,
    ForecastCreateResponseSchema,
    "create forecast",
  );
  expect(created.forecast.lockedHash.length).toBeGreaterThan(8);
  await expect(page.getByText(questionText)).toBeVisible();

  const resolve1 = await request.patch(`/api/theses/${thesisId}/forecasts`, {
    data: { forecastId: created.forecast.id, outcomeIndex: 0 },
  });
  expect(resolve1.status()).toBe(200);
  const resolve2 = await request.patch(`/api/theses/${thesisId}/forecasts`, {
    data: { forecastId: created.forecast.id, outcomeIndex: 1 },
  });
  expect(resolve2.status()).toBe(409);
}

async function verifyDisciplineSignoff(page: Page, thesisId: string) {
  await page.getByRole("tab", { name: /交易纪律台账/ }).click();
  const exitInput = page.getByLabel("预设离场条件");
  if (!(await exitInput.isVisible())) {
    await page.getByRole("button", { name: "记录新决策" }).click();
  }
  await exitInput.fill("若数据中心毛利率连续两季跌破 68% 则无条件减仓");
  const [discRes] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().includes(`/api/theses/${thesisId}/discipline`) && r.request().method() === "POST",
    ),
    page.getByRole("button", { name: "签字入账" }).click(),
  ]);
  expect(discRes.status()).toBe(201);
  await expect(page.getByText(/连续两季跌破 68%/)).toBeVisible();
}

test.describe
  .serial("06 · Immutable Forecasts & Zero-Leverage Discipline Journal", () => {
    test("locks a binary forecast, blocks duplicate resolution (409), and signs discipline entry", async ({
      browser,
      baseURL,
    }) => {
      if (!baseURL) throw new Error("baseURL required");
      const thesisId = readSharedState().nvdaThesisId;
      if (!thesisId) throw new Error("Missing nvdaThesisId");
      const { context } = await createAuthenticatedContext(browser, baseURL, GOLDEN_ACTORS.owner);
      const page = await context.newPage();
      await page.goto(`/thesis/${thesisId}?step=5`);
      await verifyForecastLockAndImmutability(context.request, page, thesisId);
      await verifyDisciplineSignoff(page, thesisId);
      await context.close();
    });
  });
