/**
 * Minimal Node ESM loader hook that resolves extensionless relative TypeScript imports
 * (`./foo` -> `./foo.ts` or `./foo/index.ts`) so `pnpm db:migrate` runs natively under
 * Node >= 22 `--experimental-strip-types` with zero external runtime dependencies.
 */
import fs from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL) {
    const parentDir = path.dirname(fileURLToPath(context.parentURL));
    const base = path.resolve(parentDir, specifier);
    for (const candidate of [`${base}.ts`, path.join(base, "index.ts")]) {
      if (fs.existsSync(candidate)) {
        return { url: pathToFileURL(candidate).href, shortCircuit: true };
      }
    }
  }
  return nextResolve(specifier, context);
}

if (
  import.meta.url ===
  pathToFileURL(path.resolve(process.cwd(), "scripts/ts-resolve-loader.mjs")).href
) {
  register(import.meta.url);
}
