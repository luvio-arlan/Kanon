import fs from "node:fs";
import path from "node:path";

const MUTATION_EXPORT_RE = /export\s+async\s+function\s+(?:POST|PATCH|PUT|DELETE)\b/;
const BEARER_ONLY_ALLOWLIST = new Set(["apps/web/src/app/api/mcp/route.ts"]);

function walkRouteFiles(dirPath, results) {
  if (!fs.existsSync(dirPath)) return;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkRouteFiles(full, results);
    } else if (entry.isFile() && entry.name === "route.ts") {
      results.push(full);
    }
  }
}

export function checkApiMutationCsrfGuard(rootDir, errors) {
  const apiRoot = path.join(rootDir, "apps/web/src/app/api");
  const routes = [];
  walkRouteFiles(apiRoot, routes);

  for (const filePath of routes) {
    const rel = path.relative(rootDir, filePath).split(path.sep).join("/");
    if (BEARER_ONLY_ALLOWLIST.has(rel)) continue;
    const content = fs.readFileSync(filePath, "utf8");
    if (!MUTATION_EXPORT_RE.test(content)) continue;
    if (!/\bverifySameOrigin\s*\(/.test(content)) {
      errors.push(
        `${rel}:1 [api-mutation-csrf-guard] API route exports a mutation handler (POST/PATCH/PUT/DELETE) without calling verifySameOrigin(request, startedAt).`,
      );
    }
  }
}
