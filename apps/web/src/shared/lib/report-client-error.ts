import { templateRoutePath } from "@kanon/core";
import { z } from "zod";
import { kanonFetch } from "./kanon-fetch";

/** Short deploy SHA injected at build time (`next.config.ts`), so client errors map to a release. */
const CLIENT_BUILD_ID = process.env.NEXT_PUBLIC_KANON_BUILD_ID || "local";

const ClientErrorAckSchema = z.object({
  accepted: z.boolean(),
});

function toHexDigest(raw: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b1;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (ch + i), 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

export function reportClientError(
  error: Error & { digest?: string },
  kind: "render" | "fetch" | "unhandled",
): void {
  const route = typeof window === "undefined" ? "/" : templateRoutePath(window.location.pathname);
  const digest = toHexDigest(error.digest ?? error.name ?? kind);
  void kanonFetch("/api/telemetry/client-errors", ClientErrorAckSchema, {
    method: "POST",
    body: JSON.stringify({ route, digest, kind, buildId: CLIENT_BUILD_ID }),
  }).catch(() => undefined);
}
