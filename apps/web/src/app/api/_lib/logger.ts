import crypto from "node:crypto";

export interface StructuredApiLog {
  level: "info" | "warn" | "error";
  requestId: string;
  status: number;
  durationMs: number;
  code?: string;
  route?: string;
  userId?: string;
  message?: string;
}

export function generateRequestId(): string {
  return `req_${crypto.randomBytes(6).toString("hex")}`;
}

function hashUserIdForLog(userId: string): string {
  return crypto.createHash("sha256").update(`kanon-log:${userId}`).digest("hex").slice(0, 12);
}

export function logStructuredApiEvent(entry: StructuredApiLog): void {
  if (process.env.NODE_ENV === "test") return;
  const { userId, ...rest } = entry;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    service: "kanon-web",
    ...(userId ? { userIdHash: hashUserIdForLog(userId) } : {}),
    ...rest,
  });
  if (entry.level === "error") process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}
