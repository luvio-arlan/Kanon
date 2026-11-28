import { z } from "zod";
import { fetchSecWithRetry } from "../sec-http";

const SubmissionsSliceSchema = z.object({
  accessionNumber: z.array(z.string()).optional(),
  primaryDocument: z.array(z.string()).optional(),
});

const SubmissionsJsonSchema = z.object({
  filings: z
    .object({
      recent: SubmissionsSliceSchema.optional(),
      files: z.array(z.object({ name: z.string().optional() })).optional(),
    })
    .optional(),
});

type SubmissionsSlice = z.infer<typeof SubmissionsSliceSchema>;

function findPrimaryDocInSlice(
  slice: SubmissionsSlice | undefined,
  accession: string,
): string | null {
  const accs = slice?.accessionNumber;
  const docs = slice?.primaryDocument;
  if (!accs || !docs) return null;
  const idx = accs.indexOf(accession);
  const doc = idx >= 0 ? docs[idx] : null;
  return typeof doc === "string" && doc.trim().length > 0 ? doc.trim() : null;
}

function buildArchiveDocUrl(cik: string, accession: string, primaryDocument: string): string {
  const cikNum = String(Number.parseInt(cik.replace(/\D/g, ""), 10) || cik);
  const accNoDash = accession.replaceAll("-", "");
  return `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accNoDash}/${primaryDocument}`;
}

async function searchPaginatedFiles(
  files: ReadonlyArray<{ name?: string }>,
  digits: string,
  accession: string,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  for (const file of files.slice(0, 4)) {
    if (!file.name) continue;
    const pageRes = await fetchSecWithRetry(
      `https://data.sec.gov/submissions/${file.name}`,
      { timeoutMs: 10_000, maxRetries: 1, signal },
      fetchImpl,
    );
    if (!pageRes.ok) continue;
    const pageParsed = SubmissionsSliceSchema.safeParse(await pageRes.json());
    const found = pageParsed.success ? findPrimaryDocInSlice(pageParsed.data, accession) : null;
    if (found) return buildArchiveDocUrl(digits, accession, found);
  }
  return null;
}

/**
 * Resolves a directory-style EDGAR filing URL (`.../000104581024000029/`) to its primary HTML document
 * by scanning `data.sec.gov/submissions/CIK{cik}.json` and paginated `filings.files` (U0-3).
 */
export async function resolvePrimaryDocUrl(
  cik: string,
  accession: string,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const digits = cik.replace(/\D/g, "");
  if (!digits) return null;
  const res = await fetchSecWithRetry(
    `https://data.sec.gov/submissions/CIK${digits.padStart(10, "0")}.json`,
    { timeoutMs: 10_000, maxRetries: 1, signal },
    fetchImpl,
  );
  if (!res.ok) return null;
  const parsed = SubmissionsJsonSchema.safeParse(await res.json());
  if (!parsed.success) return null;
  const recentDoc = findPrimaryDocInSlice(parsed.data.filings?.recent, accession);
  if (recentDoc) return buildArchiveDocUrl(digits, accession, recentDoc);
  return searchPaginatedFiles(
    parsed.data.filings?.files ?? [],
    digits,
    accession,
    signal,
    fetchImpl,
  );
}

/** Streams a response text body with a hard byte ceiling so >12MB bank 10-Ks never exhaust memory (P2-1). */
export async function readBoundedTextStream(
  res: Response,
  maxBytes: number,
): Promise<{ status: "ok"; text: string } | { status: "too_large" }> {
  const contentLen = Number(res.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLen) && contentLen > maxBytes) return { status: "too_large" };
  if (!res.body) {
    const text = await res.text();
    return Buffer.byteLength(text, "utf8") > maxBytes
      ? { status: "too_large" }
      : { status: "ok", text };
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return { status: "too_large" };
    }
    text += decoder.decode(value, { stream: true });
  }
  return { status: "ok", text: text + decoder.decode() };
}
