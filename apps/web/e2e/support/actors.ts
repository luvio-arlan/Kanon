import type { APIRequestContext, Browser, BrowserContext } from "@playwright/test";
import { AuthUserResponseSchema, parseApiResponse } from "./contracts";

export interface ActorCreds {
  phone: string;
  password: string;
  displayName: string;
}

export const GOLDEN_ACTORS = {
  owner: { phone: "13800138011", password: "KanonOwner2026!", displayName: "投研总监Owner" },
  analyst: {
    phone: "13800138022",
    password: "KanonAnalyst2026!",
    displayName: "资深研究员Analyst",
  },
  pm: { phone: "13800138033", password: "KanonPm2026!", displayName: "基金经理PM" },
  viewer: { phone: "13800138044", password: "KanonViewer2026!", displayName: "外部观察员Viewer" },
  unregisteredPhone: "13900139999",
} as const;

export async function apiRegisterOrLogin(
  request: APIRequestContext,
  actor: ActorCreds,
  seedStarterWorkspace = false,
): Promise<{ userId: string }> {
  const regRes = await request.post("/api/auth/register", {
    data: {
      phone: actor.phone,
      displayName: actor.displayName,
      password: actor.password,
      confirmPassword: actor.password,
      seedStarterWorkspace,
    },
  });
  if (regRes.status() === 201) {
    const body = await parseApiResponse(regRes, AuthUserResponseSchema, "register");
    return { userId: body.user.id };
  }
  const loginRes = await request.post("/api/auth/login", {
    data: { phone: actor.phone, password: actor.password },
  });
  if (loginRes.status() !== 200) {
    throw new Error(`Actor login failed for ${actor.phone}: HTTP ${loginRes.status()}`);
  }
  const body = await parseApiResponse(loginRes, AuthUserResponseSchema, "login");
  return { userId: body.user.id };
}

export async function createAuthenticatedContext(
  browser: Browser,
  baseURL: string,
  actor: ActorCreds,
  seedStarterWorkspace = false,
): Promise<{ context: BrowserContext; userId: string }> {
  const context = await browser.newContext({ baseURL });
  const { userId } = await apiRegisterOrLogin(context.request, actor, seedStarterWorkspace);
  return { context, userId };
}
