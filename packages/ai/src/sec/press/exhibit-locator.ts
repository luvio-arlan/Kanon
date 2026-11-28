import { z } from "zod";
import { fetchSecWithRetry } from "../sec-http";

const SecIndexDirectorySchema = z.object({
  directory: z.object({
    item: z.array(z.object({ name: z.string().min(1) })),
  }),
});

const EX99_1_TYPE_CELL_RE = /<td[^>]*>\s*EX-99\.1\s*<\/td>/i;
const HREF_RE = /href="([^"]+\.html?)"/i;
const EX99_1_NAME_RE = /ex[-_]?99[-_.]?0?1(?!\d)[^/]*\.html?$/i;

/**
 * Picks the EX-99.1 document from an EDGAR `{accession}-index.html` filing index by its Type column.
 * Issuers name exhibits freely (NVDA: `q3fy27pr.htm`), so file names are never trusted first (V1-1).
 */
export function findEx991InFilingIndex(indexHtml: string): string | null {
  for (const row of indexHtml.split(/<tr/i)) {
    if (!EX99_1_TYPE_CELL_RE.test(row)) continue;
    const href = row.match(HREF_RE)?.[1];
    if (href) return href.split("/").pop() ?? null;
  }
  return null;
}

async function locateViaDirectoryNames(dirUrl: string, signal?: AbortSignal) {
  const res = await fetchSecWithRetry(`${dirUrl}index.json`, {
    signal,
    timeoutMs: 12_000,
    maxRetries: 2,
  });
  if (!res.ok) return null;
  const parsed = SecIndexDirectorySchema.safeParse(await res.json());
  if (!parsed.success) return null;
  return parsed.data.directory.item.map((i) => i.name).find((n) => EX99_1_NAME_RE.test(n)) ?? null;
}

/** Resolves the EX-99.1 earnings press release URL from an 8-K accession via the SEC gateway (G13). */
export async function locateEx991DocumentUrl(params: {
  cik: string;
  accession: string;
  signal?: AbortSignal;
}): Promise<string | null> {
  const cikNum = String(Number(params.cik.replace(/\D/g, "")));
  const accClean = params.accession.replace(/-/g, "");
  if (!cikNum || cikNum === "0" || !accClean) return null;
  const dirUrl = `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accClean}/`;
  const indexRes = await fetchSecWithRetry(`${dirUrl}${params.accession}-index.html`, {
    signal: params.signal,
    timeoutMs: 12_000,
    maxRetries: 2,
  });
  const fromIndex = indexRes.ok ? findEx991InFilingIndex(await indexRes.text()) : null;
  const name = fromIndex ?? (await locateViaDirectoryNames(dirUrl, params.signal));
  return name ? `${dirUrl}${name}` : null;
}
