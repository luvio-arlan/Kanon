import { McpJsonRpcRequestSchema } from "@kanon/core";
import { getKanonDb } from "@kanon/core/db";
import { NextResponse } from "next/server";
import { requireMcpAuthContext } from "../_lib/auth-session";
import { apiHeaders, jsonOk, readJsonBody } from "../_lib/http";
import { checkPersistentRateLimit } from "../_lib/request-guards";
import {
  executeMcpToolCall,
  listMcpResources,
  MCP_TOOL_DEFINITIONS,
  readMcpResource,
} from "./_mcp-tools";

export const dynamic = "force-dynamic";

const MCP_RATE_POLICY = { bucket: "mcp_rpc", maxRequests: 90, windowMs: 60 * 1000 };
const MCP_PROTOCOL_VERSION = "2025-03-26";

function rpcSuccess(id: string | number | null | undefined, result: unknown, startedAt: number) {
  return NextResponse.json(
    { jsonrpc: "2.0", id: id ?? null, result },
    { status: 200, headers: apiHeaders(startedAt) },
  );
}

function rpcError(
  id: string | number | null | undefined,
  code: number,
  message: string,
  startedAt: number,
) {
  return NextResponse.json(
    { jsonrpc: "2.0", id: id ?? null, error: { code, message } },
    { status: 200, headers: apiHeaders(startedAt) },
  );
}

export async function GET(request: Request) {
  const startedAt = performance.now();
  const auth = await requireMcpAuthContext(request, startedAt);
  if (!auth.ok) return auth.response;

  return jsonOk(
    {
      name: "kanon-research-os",
      version: "1.0.0",
      protocolVersion: MCP_PROTOCOL_VERSION,
      transport: "streamable-http",
      authMethod: auth.authMethod,
      toolsCount: MCP_TOOL_DEFINITIONS.length,
    },
    startedAt,
  );
}

async function dispatchWorkspaceRpc(params: {
  id: string | number | null | undefined;
  method: string;
  rpcParams: Record<string, unknown>;
  userId: string;
  startedAt: number;
}) {
  const { id, method, rpcParams, userId, startedAt } = params;
  const db = await getKanonDb();
  if (method === "tools/call") {
    const name = typeof rpcParams.name === "string" ? rpcParams.name : "";
    const args =
      rpcParams.arguments && typeof rpcParams.arguments === "object"
        ? (rpcParams.arguments as Record<string, unknown>)
        : {};
    const outcome = await executeMcpToolCall(db, userId, name, args);
    return rpcSuccess(
      id,
      {
        isError: Boolean(outcome.isError),
        content: [{ type: "text", text: JSON.stringify(outcome.payload, null, 2) }],
      },
      startedAt,
    );
  }
  if (method === "resources/list") {
    return rpcSuccess(id, { resources: await listMcpResources(db, userId) }, startedAt);
  }
  if (method === "resources/read") {
    const uri = typeof rpcParams.uri === "string" ? rpcParams.uri : "";
    const resource = await readMcpResource(db, userId, uri);
    if (!resource) return rpcError(id, -32602, `Resource not found: ${uri}`, startedAt);
    return rpcSuccess(id, { contents: [resource] }, startedAt);
  }
  return rpcError(id, -32601, `Method not found: ${method}`, startedAt);
}

async function dispatchRpcMethod(params: {
  id: string | number | null | undefined;
  method: string;
  rpcParams: Record<string, unknown>;
  userId: string;
  startedAt: number;
}) {
  const { id, method, startedAt } = params;
  if (method === "initialize") {
    return rpcSuccess(
      id,
      {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false }, resources: { listChanged: false } },
        serverInfo: { name: "kanon-research-os", version: "1.0.0" },
      },
      startedAt,
    );
  }
  if (method === "ping" || method === "notifications/initialized") {
    return rpcSuccess(id, {}, startedAt);
  }
  if (method === "tools/list") {
    return rpcSuccess(id, { tools: MCP_TOOL_DEFINITIONS }, startedAt);
  }
  return dispatchWorkspaceRpc(params);
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  const rateErr = await checkPersistentRateLimit(request, MCP_RATE_POLICY, startedAt);
  if (rateErr) return rateErr;
  const auth = await requireMcpAuthContext(request, startedAt);
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request, startedAt);
  if (!body.ok) return body.response;

  const parsed = McpJsonRpcRequestSchema.safeParse(body.data);
  if (!parsed.success) {
    return rpcError(null, -32600, "Invalid JSON-RPC 2.0 request payload.", startedAt);
  }
  return dispatchRpcMethod({
    id: parsed.data.id,
    method: parsed.data.method,
    rpcParams: parsed.data.params ?? {},
    userId: auth.user.id,
    startedAt,
  });
}
