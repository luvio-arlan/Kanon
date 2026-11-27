const LOC_TAG_RE = /<(?:[a-z0-9_-]+:)?loc\b([^>]*)\/?>/gi;
const ARC_TAG_RE = /<(?:[a-z0-9_-]+:)?labelArc\b([^>]*)\/?>/gi;
const LABEL_TAG_RE = /<(?:[a-z0-9_-]+:)?label\b([^>]*)>([^<]+)<\/(?:[a-z0-9_-]+:)?label>/gi;

function readXmlAttr(attrs: string, name: string): string | null {
  const m = new RegExp(`\\b${name}=["']([^"']+)["']`, "i").exec(attrs);
  return m?.[1]?.trim() ?? null;
}

function decodeXmlEntities(raw: string): string {
  return raw
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractMemberKeyFromLabel(labelKey: string): string {
  const parts = labelKey.split("_");
  return parts.find((p) => /Member$/i.test(p)) ?? parts[parts.length - 1] ?? "";
}

function parseLocHrefMap(xml: string): Map<string, string> {
  const locToLocal = new Map<string, string>();
  for (const m of xml.matchAll(LOC_TAG_RE)) {
    const attrs = m[1] ?? "";
    const locLabel = readXmlAttr(attrs, "xlink:label");
    const href = readXmlAttr(attrs, "xlink:href");
    if (!locLabel || !href) continue;
    const frag = href.includes("#") ? (href.split("#")[1] ?? "") : href;
    const local = frag.includes("_") ? frag.slice(frag.indexOf("_") + 1) : frag;
    if (local) locToLocal.set(locLabel, local.toLowerCase());
  }
  return locToLocal;
}

function parseArcTargetMap(
  xml: string,
  locToLocal: ReadonlyMap<string, string>,
): Map<string, string> {
  const labToLocal = new Map<string, string>();
  for (const m of xml.matchAll(ARC_TAG_RE)) {
    const attrs = m[1] ?? "";
    const from = readXmlAttr(attrs, "xlink:from");
    const to = readXmlAttr(attrs, "xlink:to");
    const local = from ? locToLocal.get(from) : undefined;
    if (to && local) labToLocal.set(to, local);
  }
  return labToLocal;
}

/** Parses standard labels from an XBRL `_lab.xml` linkbase into a local-name lookup map. */
export function parseLabelLinkbaseXml(xml: string): Map<string, string> {
  const labToLocal = parseArcTargetMap(xml, parseLocHrefMap(xml));
  const labels = new Map<string, string>();
  for (const m of xml.matchAll(LABEL_TAG_RE)) {
    const attrs = m[1] ?? "";
    const text = decodeXmlEntities(m[2] ?? "");
    const role = readXmlAttr(attrs, "xlink:role") ?? "";
    if (!text || (role && !role.endsWith("/role/label"))) continue;
    const labelKey = readXmlAttr(attrs, "xlink:label") ?? "";
    const candidate = labToLocal.get(labelKey) ?? extractMemberKeyFromLabel(labelKey);
    if (candidate) labels.set(candidate.toLowerCase(), text.slice(0, 120));
  }
  return labels;
}

/** Derives human-readable member label from linkbase or qname camelCase fallback (R2). */
export function resolveMemberLabel(
  memberQname: string,
  linkbaseLabels: ReadonlyMap<string, string>,
): { label: string; labelSource: "label_linkbase" | "qname" } {
  const local = memberQname.includes(":")
    ? (memberQname.split(":")[1] ?? memberQname)
    : memberQname;
  const fromLinkbase = linkbaseLabels.get(local.toLowerCase());
  if (fromLinkbase) return { label: fromLinkbase, labelSource: "label_linkbase" };
  const cleaned = local
    .replace(/Member$/i, "")
    .replace(/Segment$/i, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .trim();
  return { label: (cleaned || local).slice(0, 120), labelSource: "qname" };
}
