import { type APIRequestContext, expect, type Page, test } from "@playwright/test";
import { createAuthenticatedContext, GOLDEN_ACTORS } from "../support/actors";
import { parseApiResponse, ThesisUpdatedAtResponseSchema } from "../support/contracts";
import { readSharedState } from "../support/fixtures";

async function verifyReadonlyUiAndNoSaveRequest(page: Page, thesisId: string) {
  await page.goto(`/thesis/${thesisId}?step=1`);
  await expect(page.getByText("只读")).toBeVisible();

  const patchPromise = page
    .waitForRequest(
      (req) => req.url().includes(`/api/theses/${thesisId}`) && req.method() === "PATCH",
      { timeout: 2000 },
    )
    .then(() => "sent")
    .catch(() => "timed_out");

  await page.keyboard.press("Meta+s");
  expect(await patchPromise).toBe("timed_out");
}

async function verifyViewerWritesRejected(viewerReq: APIRequestContext, thesisId: string) {
  const patchRes = await viewerReq.patch(`/api/theses/${thesisId}`, {
    data: { step: "price_anchor", currentPrice: 999 },
  });
  expect(patchRes.status()).toBe(403);
  const discRes = await viewerReq.post(`/api/theses/${thesisId}/discipline`, {
    data: {
      action: "hold",
      noLeverageConfirmed: true,
      positionCapConfirmed: true,
      exitRule: "viewer write attempt",
      emotion: "calm",
      priceAnchor: 140,
      note: "",
    },
  });
  expect(discRes.status()).toBe(403);
  expect(
    (await viewerReq.post("/api/ai/copilot", { data: { action: "red_team", thesisId } })).status(),
  ).toBe(403);
  expect((await viewerReq.delete(`/api/theses/${thesisId}`)).status()).toBe(403);
}

async function verifyViewerApiForbiddenAndCsrf(
  viewerReq: APIRequestContext,
  ownerReq: APIRequestContext,
  thesisId: string,
) {
  const before = await parseApiResponse(
    await viewerReq.get(`/api/theses/${thesisId}`),
    ThesisUpdatedAtResponseSchema,
    "viewer get before",
  );
  await verifyViewerWritesRejected(viewerReq, thesisId);
  const after = await parseApiResponse(
    await viewerReq.get(`/api/theses/${thesisId}`),
    ThesisUpdatedAtResponseSchema,
    "viewer get after",
  );
  expect(after.thesis.updatedAt).toBe(before.thesis.updatedAt);

  const csrfRes = await ownerReq.patch(`/api/theses/${thesisId}`, {
    headers: { Origin: "https://evil.example" },
    data: { step: "price_anchor", currentPrice: 141 },
  });
  expect(csrfRes.status()).toBe(403);
}

async function verifyViewerPresentAndPublicSample(
  browser: import("@playwright/test").Browser,
  viewerPage: Page,
  baseURL: string,
  thesisId: string,
) {
  await viewerPage.goto(`/thesis/${thesisId}/present`);
  await expect(viewerPage.getByText("1 / 6 · 综合结论")).toBeVisible();
  await expect(viewerPage.locator("input, textarea")).toHaveCount(0);
  await viewerPage.keyboard.press("ArrowRight");
  await expect(viewerPage.getByText("2 / 6 · 三情景估值")).toBeVisible();

  const anonCtx = await browser.newContext({ baseURL });
  const anonPage = await anonCtx.newPage();
  const apiHits: string[] = [];
  anonPage.on("request", (req) => {
    if (req.url().includes("/api/")) apiHits.push(req.url());
  });
  const res = await anonPage.goto("/sample/nvda");
  expect(res?.status()).toBe(200);
  await expect(anonPage.getByText("示例", { exact: true }).first()).toBeVisible();
  expect(apiHits).toHaveLength(0);
  await anonCtx.close();
}

test.describe
  .serial("10 · Viewer Read-Only Enforcement, CSRF & Mock Isolation", () => {
    test("enforces read-only UI and blocks all viewer writes + forged cross-origin writes", async ({
      browser,
      baseURL,
    }) => {
      if (!baseURL) throw new Error("baseURL required");
      const thesisId = readSharedState().nvdaThesisId;
      if (!thesisId) throw new Error("Missing nvdaThesisId");

      const viewer = await createAuthenticatedContext(browser, baseURL, GOLDEN_ACTORS.viewer);
      const owner = await createAuthenticatedContext(browser, baseURL, GOLDEN_ACTORS.owner);
      const page = await viewer.context.newPage();

      await verifyReadonlyUiAndNoSaveRequest(page, thesisId);
      await verifyViewerApiForbiddenAndCsrf(
        viewer.context.request,
        owner.context.request,
        thesisId,
      );
      await verifyViewerPresentAndPublicSample(browser, page, baseURL, thesisId);

      await Promise.all([viewer.context.close(), owner.context.close()]);
    });
  });
