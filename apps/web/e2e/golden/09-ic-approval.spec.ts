import { type APIRequestContext, expect, test } from "@playwright/test";
import { createAuthenticatedContext, GOLDEN_ACTORS } from "../support/actors";
import {
  ErrorCodeResponseSchema,
  IcApprovalResponseSchema,
  parseApiResponse,
} from "../support/contracts";
import { readSharedState } from "../support/fixtures";

async function submitAndApproveFlow(
  analystReq: APIRequestContext,
  pmReq: APIRequestContext,
  thesisId: string,
) {
  const sub1 = await analystReq.post(`/api/theses/${thesisId}/ic`, {
    data: { op: "submit", note: "提交 NVDA 投委会初审" },
  });
  expect(sub1.status()).toBe(201);
  const { approval: a1 } = await parseApiResponse(sub1, IcApprovalResponseSchema, "ic submit 1");

  const selfApprove = await analystReq.patch(`/api/theses/${thesisId}/ic`, {
    data: { approvalId: a1.id, decision: "approved", decisionNote: "试图自批" },
  });
  expect(selfApprove.status()).toBe(403);

  const pmApprove = await pmReq.patch(`/api/theses/${thesisId}/ic`, {
    data: { approvalId: a1.id, decision: "approved", decisionNote: "逻辑扎实，同意纳入" },
  });
  expect(pmApprove.status()).toBe(200);
}

async function verifyStaleSnapshotBlocked(
  analystReq: APIRequestContext,
  pmReq: APIRequestContext,
  thesisId: string,
) {
  const sub2 = await analystReq.post(`/api/theses/${thesisId}/ic`, {
    data: { op: "submit", note: "二次提交待审批" },
  });
  expect(sub2.status()).toBe(201);
  const { approval: a2 } = await parseApiResponse(sub2, IcApprovalResponseSchema, "ic submit 2");

  const driftPatch = await analystReq.patch(`/api/theses/${thesisId}`, {
    data: {
      step: "valuation",
      valuationInput: {
        currentPrice: 135,
        horizonYears: 3,
        bear: { eps: 4.0, peMultiple: 20, probability: 0.25 },
        base: { eps: 7.0, peMultiple: 30, probability: 0.5 },
        bull: { eps: 9.5, peMultiple: 35, probability: 0.25 },
      },
    },
  });
  expect(driftPatch.status()).toBe(200);

  const staleApprove = await pmReq.patch(`/api/theses/${thesisId}/ic`, {
    data: { approvalId: a2.id, decision: "approved", decisionNote: "在快照变更后审批" },
  });
  expect(staleApprove.status()).toBe(409);
  expect((await parseApiResponse(staleApprove, ErrorCodeResponseSchema, "stale")).code).toBe(
    "STALE_SNAPSHOT",
  );
}

test.describe
  .serial("09 · Investment Committee Approval & Stale Snapshot Guard", () => {
    test("blocks analyst self-approval (403), allows PM approval (200), and blocks stale snapshot (409)", async ({
      browser,
      baseURL,
    }) => {
      if (!baseURL) throw new Error("baseURL required");
      const thesisId = readSharedState().nvdaThesisId;
      if (!thesisId) throw new Error("Missing nvdaThesisId");
      const analyst = await createAuthenticatedContext(browser, baseURL, GOLDEN_ACTORS.analyst);
      const pm = await createAuthenticatedContext(browser, baseURL, GOLDEN_ACTORS.pm);
      await submitAndApproveFlow(analyst.context.request, pm.context.request, thesisId);
      await verifyStaleSnapshotBlocked(analyst.context.request, pm.context.request, thesisId);
      await Promise.all([analyst.context.close(), pm.context.close()]);
    });
  });
