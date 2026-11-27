import { FilingRedlineResponseSchema } from "@kanon/core";
import { expect, test } from "@playwright/test";
import { createAuthenticatedContext, GOLDEN_ACTORS } from "../support/actors";
import { parseApiResponse } from "../support/contracts";
import { readSharedState } from "../support/fixtures";

test.describe
  .serial("04 · Filing Cross-Period Redline (Item 1A & MD&A)", () => {
    test("computes FY2025 vs FY2024 10-K redline and detects added export control risk", async ({
      browser,
      baseURL,
    }) => {
      if (!baseURL) throw new Error("baseURL required");
      const thesisId = readSharedState().nvdaThesisId;
      if (!thesisId) throw new Error("Missing nvdaThesisId from chapter 02");

      const { context } = await createAuthenticatedContext(browser, baseURL, GOLDEN_ACTORS.owner);
      // Poll redline endpoint until background build completes (202 pending -> 200 ready)
      await expect
        .poll(
          async () => {
            const res = await context.request.get("/api/sec/NVDA/redline?section=risk_factors");
            if (res.status() !== 200) return "pending";
            const body = await parseApiResponse(
              res,
              FilingRedlineResponseSchema,
              "GET /api/sec/NVDA/redline",
            );
            return body.status;
          },
          { timeout: 15_000, intervals: [300, 600, 1000] },
        )
        .toBe("ready");

      const readyRes = await context.request.get("/api/sec/NVDA/redline?section=risk_factors");
      const redline = await parseApiResponse(
        readyRes,
        FilingRedlineResponseSchema,
        "GET /api/sec/NVDA/redline ready",
      );
      expect(redline.current?.form).toBe("10-K");
      expect(redline.previous?.form).toBe("10-K");
      expect(redline.changes.some((c) => c.kind === "added_risk")).toBe(true);
      expect(
        redline.changes.some((c) => c.tokens.some((t) => /export control/i.test(t.text))),
      ).toBe(true);

      await context.close();
    });
  });
