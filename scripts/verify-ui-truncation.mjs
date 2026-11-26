#!/usr/bin/env node
/**
 * Wave L3 / Guard G10: Playwright DOM truncation & overflow verifier.
 * Checks {1280, 1440, 1920} x {light, dark} viewports against a running KANON server.
 * Usage: node scripts/verify-ui-truncation.mjs [http://127.0.0.1:3141]
 */
const BASE_URL = process.argv[2] || "http://127.0.0.1:3141";
const VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];
const THEMES = ["light", "dark"];
const ROUTES = ["/login", "/register"];

function collectOverflowIssues() {
  const selectors = "button, h1, h2, h3, nav a, [role='tab']";
  const isOverflowing = (el) => {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    if (el.getAttribute("title") || el.getAttribute("aria-label")) return false;
    const ox = window.getComputedStyle(el).overflowX;
    if (ox === "auto" || ox === "scroll") return false;
    return el.scrollWidth > el.clientWidth + 2;
  };
  return [...document.querySelectorAll(selectors)].filter(isOverflowing).map((el) => ({
    tag: el.tagName.toLowerCase(),
    text: (el.textContent || "").trim().slice(0, 40),
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
}

async function auditPage(page, route, vp, theme) {
  await page.setViewportSize(vp);
  await page.emulateMedia({ colorScheme: theme });
  await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle", timeout: 25_000 });
  await page.evaluate((mode) => {
    document.documentElement.classList.toggle("dark", mode === "dark");
  }, theme);
  return page.evaluate(collectOverflowIssues);
}

async function main() {
  const pwModule = "playwright";
  const { chromium } = await import(pwModule);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const failures = [];
  try {
    for (const route of ROUTES) {
      for (const vp of VIEWPORTS) {
        for (const theme of THEMES) {
          const issues = await auditPage(page, route, vp, theme);
          for (const item of issues) {
            failures.push(
              `${route} @ ${vp.width}x${vp.height} (${theme}): ${JSON.stringify(item)}`,
            );
          }
        }
      }
    }
  } finally {
    await browser.close();
  }
  if (failures.length > 0) {
    process.stderr.write(
      `UI truncation check failed (${failures.length}):\n${failures.join("\n")}\n`,
    );
    process.exit(1);
  }
  process.stdout.write(
    `UI truncation check passed (${ROUTES.length * VIEWPORTS.length * THEMES.length} matrix cells).\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
