const DEFAULT_SEC_USER_AGENT = "KANON-Research-OS/2.0 (research@kanon.hk)";
const RETRYABLE_STATUSES = new Set([429, 503]);
const SEC_MIN_INTERVAL_MS = 125;

let nextSecSlotMs = 0;
let globalSlotAcquirer: ((signal?: AbortSignal) => Promise<void>) | null = null;

export function getSecUserAgent(): string {
  const custom = process.env.KANON_SEC_USER_AGENT?.trim();
  return custom && custom.length >= 8 ? custom : DEFAULT_SEC_USER_AGENT;
}

/** Registers a process-wide distributed SEC token bucket acquirer (<= 8 req/s across instances). */
export function registerSecGlobalSlotAcquirer(
  fn: ((signal?: AbortSignal) => Promise<void>) | null,
): void {
  globalSlotAcquirer = fn;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) return new Promise((resolve) => setTimeout(resolve, ms));
  if (signal.aborted) return Promise.reject(signal.reason ?? new Error("Aborted"));
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason ?? new Error("Aborted"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function acquireSecRateSlot(signal?: AbortSignal): Promise<void> {
  const now = Date.now();
  const waitMs = Math.max(0, nextSecSlotMs - now);
  nextSecSlotMs = Math.max(now, nextSecSlotMs) + SEC_MIN_INTERVAL_MS;
  if (waitMs > 0) await sleep(waitMs, signal);
}

function parseRetryAfterMs(res: Response, attempt: number): number {
  const raw = res.headers.get("retry-after")?.trim();
  if (raw) {
    const secs = Number(raw);
    if (Number.isFinite(secs) && secs > 0) return Math.min(2500, Math.round(secs * 1000));
  }
  return Math.min(2500, 250 * 2 ** attempt);
}

function buildSecSignal(timeoutMs: number, signal?: AbortSignal): AbortSignal {
  const timer = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([timer, signal]) : timer;
}

export interface FetchSecOptions {
  accept?: string;
  timeoutMs?: number;
  maxRetries?: number;
  signal?: AbortSignal;
  acquireGlobalSlot?: (signal?: AbortSignal) => Promise<void>;
}

async function acquireBeforeAttempt(
  options: FetchSecOptions,
  fetchImpl: typeof fetch,
): Promise<void> {
  if (options.signal?.aborted) throw options.signal.reason ?? new Error("Aborted");
  const slotAcquirer =
    options.acquireGlobalSlot ?? (fetchImpl === fetch ? globalSlotAcquirer : null);
  if (slotAcquirer) {
    await slotAcquirer(options.signal);
    return;
  }
  if (fetchImpl === fetch) await acquireSecRateSlot(options.signal);
}

export async function fetchSecWithRetry(
  url: string,
  options: FetchSecOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const maxRetries = options.maxRetries ?? 2;
  const headers: Record<string, string> = { "User-Agent": getSecUserAgent() };
  if (options.accept) headers.Accept = options.accept;

  let lastRes: Response | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    await acquireBeforeAttempt(options, fetchImpl);
    const res = await fetchImpl(url, {
      headers,
      signal: buildSecSignal(options.timeoutMs ?? 8000, options.signal),
    });
    if (!RETRYABLE_STATUSES.has(res.status) || attempt === maxRetries) return res;
    lastRes = res;
    await sleep(parseRetryAfterMs(res, attempt), options.signal);
  }
  return lastRes as Response;
}
