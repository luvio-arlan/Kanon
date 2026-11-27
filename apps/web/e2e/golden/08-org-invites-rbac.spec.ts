import { type APIRequestContext, expect, test } from "@playwright/test";
import { createAuthenticatedContext, GOLDEN_ACTORS } from "../support/actors";
import {
  OrgCreateResponseSchema,
  OrgListResponseSchema,
  parseApiResponse,
} from "../support/contracts";
import { patchSharedState, readSharedState } from "../support/fixtures";

async function acceptPendingInvite(targetReq: APIRequestContext, orgId: string) {
  const orgsRes = await targetReq.get("/api/orgs");
  expect(orgsRes.status()).toBe(200);
  const body = await parseApiResponse(orgsRes, OrgListResponseSchema, "GET /api/orgs");
  const inv = body.pendingInvitations?.find((i) => i.orgId === orgId);
  expect(inv).toBeDefined();
  const acceptRes = await targetReq.post("/api/orgs", {
    data: { op: "accept_invite", invitationId: inv?.id },
  });
  expect(acceptRes.status()).toBe(200);
}

async function inviteAndAccept(
  ownerReq: APIRequestContext,
  targetReq: APIRequestContext,
  orgId: string,
  phone: string,
  role: "analyst" | "pm" | "viewer",
) {
  const inviteRes = await ownerReq.post("/api/orgs", {
    data: { op: "invite", orgId, phone, role },
  });
  expect(inviteRes.status()).toBe(202);
  await acceptPendingInvite(targetReq, orgId);
}

async function verifyInviteAntiEnumerationAndQ51(
  ownerReq: APIRequestContext,
  analystUserId: string,
  orgId: string,
) {
  const invRegRes = await ownerReq.post("/api/orgs", {
    data: { op: "invite", orgId, phone: GOLDEN_ACTORS.analyst.phone, role: "analyst" },
  });
  const invUnregRes = await ownerReq.post("/api/orgs", {
    data: { op: "invite", orgId, phone: GOLDEN_ACTORS.unregisteredPhone, role: "analyst" },
  });
  expect(invRegRes.status()).toBe(202);
  expect(invUnregRes.status()).toBe(202);
  expect(Buffer.compare(await invRegRes.body(), await invUnregRes.body())).toBe(0);

  const updateNonMember = await ownerReq.post("/api/orgs", {
    data: { op: "update_role", orgId, userId: analystUserId, role: "pm" },
  });
  expect(updateNonMember.status()).toBe(404);
}

async function setupOrgAndAssignThesis(
  ownerReq: APIRequestContext,
  analystReq: APIRequestContext,
  thesisId: string,
): Promise<string> {
  const orgRes = await ownerReq.post("/api/orgs", {
    data: { op: "create_org", name: "Kanon Buy-Side IC" },
  });
  expect(orgRes.status()).toBe(201);
  const orgId = (await parseApiResponse(orgRes, OrgCreateResponseSchema, "create org")).organization
    .id;
  const assignRes = await ownerReq.post("/api/orgs", {
    data: { op: "assign_thesis", orgId, thesisId },
  });
  expect(assignRes.status()).toBe(200);
  expect((await analystReq.get(`/api/theses/${thesisId}`)).status()).toBe(404);
  return orgId;
}

test.describe
  .serial("08 · Organizations, Anti-Enumeration Invites & RBAC Sharing", () => {
    test("verifies identical invite bodies, visibility gating, and Q5-1 update_role guard", async ({
      browser,
      baseURL,
    }) => {
      if (!baseURL) throw new Error("baseURL required");
      const thesisId = readSharedState().nvdaThesisId;
      if (!thesisId) throw new Error("Missing nvdaThesisId");
      const owner = await createAuthenticatedContext(browser, baseURL, GOLDEN_ACTORS.owner);
      const analyst = await createAuthenticatedContext(browser, baseURL, GOLDEN_ACTORS.analyst);
      const pm = await createAuthenticatedContext(browser, baseURL, GOLDEN_ACTORS.pm);
      const viewer = await createAuthenticatedContext(browser, baseURL, GOLDEN_ACTORS.viewer);

      const orgId = await setupOrgAndAssignThesis(
        owner.context.request,
        analyst.context.request,
        thesisId,
      );
      await verifyInviteAntiEnumerationAndQ51(owner.context.request, analyst.userId, orgId);
      await acceptPendingInvite(analyst.context.request, orgId);
      expect((await analyst.context.request.get(`/api/theses/${thesisId}`)).status()).toBe(200);
      await inviteAndAccept(
        owner.context.request,
        pm.context.request,
        orgId,
        GOLDEN_ACTORS.pm.phone,
        "pm",
      );
      await inviteAndAccept(
        owner.context.request,
        viewer.context.request,
        orgId,
        GOLDEN_ACTORS.viewer.phone,
        "viewer",
      );

      patchSharedState({
        orgId,
        analyst: { ...GOLDEN_ACTORS.analyst, userId: analyst.userId },
        pm: { ...GOLDEN_ACTORS.pm, userId: pm.userId },
        viewer: { ...GOLDEN_ACTORS.viewer, userId: viewer.userId },
      });
      await Promise.all([
        owner.context.close(),
        analyst.context.close(),
        pm.context.close(),
        viewer.context.close(),
      ]);
    });
  });
