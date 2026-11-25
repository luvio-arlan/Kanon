const DEFAULT_SEC_USER_AGENT = "KANON-Research-OS/2.0 (research@kanon.hk)";
const RETRYABLE_STATUSES = new Set([429, 503]);

export function getSecUserAgent(): string {
  const custom = process.env.KANON_SEC_USER_AGENT?.trim();
  return custom && custom.length >= 8 ? custom : DEFAULT_SEC_USER_AGENT;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchSecWithRetry(
  url: string,
  options: { accept?: string; timeoutMs?: number; maxRetries?: number },
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const maxRetries = options.maxRetries ?? 2;
  const headers: Record<string, string> = { "User-Agent": getSecUserAgent() };
  if (options.accept) headers.Accept = options.accept;

  let lastRes: Response | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const res = await fetchImpl(url, {
      headers,
      signal: AbortSignal.timeout(options.timeoutMs ?? 8000),
    });
    if (!RETRYABLE_STATUSES.has(res.status) || attempt === maxRetries) {
      return res;
    }
    lastRes = res;
    await sleep(250 * 2 ** attempt);
  }
  return lastRes as Response;
}
