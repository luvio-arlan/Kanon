import { expect, test } from "@playwright/test";
import { createAuthenticatedContext, GOLDEN_ACTORS } from "../support/actors";
import { parseApiResponse, SecSyncResponseSchema } from "../support/contracts";
import { getCronSecret, readSharedState } from "../support/fixtures";

test.describe
  .serial("03 · SEC Sync, PIT Forensics & Split-Aware Restatement Filter", () => {
    test("syncs NVDA SEC data in Step 3 and separates real restatement from split recast", async ({
      browser,
      baseURL,
    }) => {
      if (!baseURL) throw new Error("baseURL required");
      const state = readSharedState();
      const thesisId = state.nvdaThesisId;
      if (!thesisId) throw new Error("Missing nvdaThesisId from chapter 02");

      const { context } = await createAuthenticatedContext(browser, baseURL, GOLDEN_ACTORS.owner);
      // Run tick once first so Yahoo split (10:1 on 2024-06-10) is stored in corporate_actions
      const tickRes = await context.request.post("/api/internal/jobs/tick", {
        headers: { Authorization: `Bearer ${getCronSecret()}` },
      });
      expect(tickRes.status()).toBe(200);

      const page = await context.newPage();
      await page.goto(`/thesis/${thesisId}?step=3`);

      const syncBtn = page.getByRole("button", { name: "同步 SEC" });
      await expect(syncBtn).toBeVisible();

      const [secRes] = await Promise.all([
        page.waitForResponse(
          (r) => r.url().includes("/api/sec/NVDA") && r.request().method() === "POST",
        ),
        syncBtn.click(),
      ]);
      expect(secRes.status()).toBe(200);
      const synced = await parseApiResponse(secRes, SecSyncResponseSchema, "POST /api/sec/NVDA");
      expect(synced.warehouseSynced).toBe(true);

      // Q5-3: Only the 1 real FY2023 revenue restatement is flagged; FY2024 10:1 EPS split recast is excluded
      expect(synced.restatements.length).toBe(1);
      expect(synced.restatements[0]?.concept).toBe("revenue");
      expect(synced.restatements[0]?.kind).toBe("restatement");

      await expect(page.getByText(/FY202\d/).first()).toBeVisible();
      await expect(page.getByText("SEC 实时")).toBeVisible();
      await context.close();
    });
  });
