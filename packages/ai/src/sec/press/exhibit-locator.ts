import { z } from "zod";
import { fetchSecWithRetry } from "../sec-http";

const SecIndexDirectorySchema = z.object({
  directory: z.object({
    item: z.array(z.object({ name: z.string().min(1) })),
  }),
});

const EX99_1_NAME_RE = /(?:ex[-_]?99[-_.]?1|99[-_.]?1|earnings|press|release).*\.(?:htm|html)$/i;
const EXCLUDE_NAME_RE = /(?:index|summary|xsl|cal|def|lab|pre|\.xml$)/i;

/** Resolves the EX-99.1 earnings press release HTML URL from an 8-K accession directory via SEC gateway (G13). */
export async function locateEx991DocumentUrl(params: {
  cik: string;
  accession: string;
  signal?: AbortSignal;
}): Promise<string | null> {
  const cikNum = String(Number(params.cik.replace(/\D/g, "")));
  const accClean = params.accession.replace(/-/g, "");
  if (!cikNum || cikNum === "0" || !accClean) return null;
  const dirUrl = `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accClean}/`;
  const res = await fetchSecWithRetry(`${dirUrl}index.json`, {
    signal: params.signal,
    timeoutMs: 12_000,
    maxRetries: 2,
  });
  if (!res.ok) return null;
  const raw: unknown = await res.json();
  const parsed = SecIndexDirectorySchema.safeParse(raw);
  if (!parsed.success) return null;
  const names = parsed.data.directory.item
    .map((i) => i.name)
    .filter((n) => !EXCLUDE_NAME_RE.test(n));
  const preferred =
    names.find((n) => /ex[-_]?99[-_.]?1/i.test(n) && /\.html?$/i.test(n)) ??
    names.find((n) => EX99_1_NAME_RE.test(n));
  return preferred ? `${dirUrl}${preferred}` : null;
}
