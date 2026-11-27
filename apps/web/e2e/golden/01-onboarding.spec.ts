import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { GOLDEN_ACTORS } from "../support/actors";
import { AuthUserResponseSchema, parseApiResponse } from "../support/contracts";
import { patchSharedState } from "../support/fixtures";

async function fillAndVerifyRegistrationForm(page: Page, context: BrowserContext): Promise<string> {
  await page.goto("/register");
  await expect(page.getByRole("heading", { name: "开通独立投研空间" })).toBeVisible();

  await page.getByLabel("手机号").fill(GOLDEN_ACTORS.owner.phone);
  await page.getByLabel("研究员称呼").fill(GOLDEN_ACTORS.owner.displayName);

  const passwordInput = page.getByLabel("设置密码", { exact: true });
  await passwordInput.fill("weak123");
  await expect(page.getByText(/需满足：/)).toBeVisible();
  await expect(page.getByRole("button", { name: /创建独立空间/ })).toBeDisabled();

  await passwordInput.fill(GOLDEN_ACTORS.owner.password);
  await page.getByLabel("确认密码", { exact: true }).fill(GOLDEN_ACTORS.owner.password);
  await expect(page.getByText("密码强度已达标")).toBeVisible();

  const submitBtn = page.getByRole("button", { name: /创建独立空间/ });
  await expect(submitBtn).toBeEnabled();

  const [regRes] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes("/api/auth/register") && r.request().method() === "POST",
    ),
    submitBtn.click(),
  ]);
  expect(regRes.status()).toBe(201);
  await expect(page).toHaveURL(/\/$/);
  const meRes = await context.request.get("/api/auth/me");
  expect(meRes.status()).toBe(200);
  return (await parseApiResponse(meRes, AuthUserResponseSchema, "GET /api/auth/me")).user.id;
}

async function verifyHttpOnlySessionCookie(page: Page, context: BrowserContext) {
  await expect(page).toHaveURL(/\/$/);
  const cookies = await context.cookies();
  const sessionCookie = cookies.find((c) => c.name === "kanon_session");
  expect(sessionCookie).toBeDefined();
  expect(sessionCookie?.httpOnly).toBe(true);
  const visibleDocCookie = await page.evaluate(() => document.cookie);
  expect(visibleDocCookie).not.toContain("kanon_session");
}

test.describe
  .serial("01 · Onboarding & Auth Session Cookie Isolation", () => {
    test("registers owner via /register, checks weak password feedback and httpOnly session cookie", async ({
      page,
      context,
    }) => {
      const userId = await fillAndVerifyRegistrationForm(page, context);
      await verifyHttpOnlySessionCookie(page, context);
      patchSharedState({
        owner: {
          phone: GOLDEN_ACTORS.owner.phone,
          password: GOLDEN_ACTORS.owner.password,
          userId,
        },
      });
    });
  });
