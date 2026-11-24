import { testMarketProviderConnection } from "@kanon/ai";
import { MarketProviderTestRequestSchema, MarketProviderTestResponseSchema } from "@kanon/core";
import { requireWorkspaceContext } from "../../_lib/auth-session";
import { formatZodError, jsonError, jsonOk, readJsonBody } from "../../_lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const startedAt = performance.now();
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request, startedAt);
  if (!body.ok) return body.response;

  const parsed = MarketProviderTestRequestSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(formatZodError(parsed.error, "行情通道参数无效。"), 400, startedAt, "INVALID");
  }

  const result = await testMarketProviderConnection({
    provider: parsed.data.provider,
    apiKey: parsed.data.apiKey,
    ticker: parsed.data.ticker,
  });

  return jsonOk(MarketProviderTestResponseSchema.parse(result), startedAt);
}
