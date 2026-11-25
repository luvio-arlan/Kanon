const DEFAULT_SEC_USER_AGENT = "KANON-Research-OS/2.0 (research@kanon.hk)";
const RETRYABLE_STATUSES = new Set([429, 503]);
const SEC_MIN_INTERVAL_MS = 125;

let nextSecSlotMs = 0;

export function getSecUserAgent(): string {
  const custom = process.env.KANON_SEC_USER_AGENT?.trim();
  return custom && custom.length >= 8 ? custom : DEFAULT_SEC_USER_AGENT;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireSecRateSlot(): Promise<void> {
  const now = Date.now();
  const waitMs = Math.max(0, nextSecSlotMs - now);
  nextSecSlotMs = Math.max(now, nextSecSlotMs) + SEC_MIN_INTERVAL_MS;
  if (waitMs > 0) await sleep(waitMs);
}

function parseRetryAfterMs(res: Response, attempt: number): number {
  const raw = res.headers.get("retry-after")?.trim();
  if (raw) {
    const secs = Number(raw);
    if (Number.isFinite(secs) && secs > 0) return Math.min(2500, Math.round(secs * 1000));
  }
  return Math.min(2500, 250 * 2 ** attempt);
}

export async function fetchSecWithRetry(
  url: string,
  options: { accept?: string; timeoutMs?: number; maxRetries?: number },
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const maxRetries = options.maxRetries ?? 2;
  const headers: Record<string, string> = { "User-Agent": getSecUserAgent() };
  if (options.accept) headers.Accept = options.accept;
  const shouldThrottle = fetchImpl === fetch;

  let lastRes: Response | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (shouldThrottle) await acquireSecRateSlot();
    const res = await fetchImpl(url, {
      headers,
      signal: AbortSignal.timeout(options.timeoutMs ?? 8000),
    });
    if (!RETRYABLE_STATUSES.has(res.status) || attempt === maxRetries) {
      return res;
    }
    lastRes = res;
    await sleep(parseRetryAfterMs(res, attempt));
  }
  return lastRes as Response;
}
