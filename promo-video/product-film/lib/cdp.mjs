// Minimal Chrome DevTools Protocol client over --remote-debugging-pipe (no ports, no deps).
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export async function launch({ width = 1920, height = 1080, scale = 1, gpu = true } = {}) {
  const profile = mkdtempSync(join(process.env.TMPDIR || tmpdir(), "kanon-film-"));
  const args = [
    "--headless",
    "--remote-debugging-pipe",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--no-sandbox",
    "--hide-scrollbars",
    "--mute-audio",
    "--force-color-profile=srgb",
    "--allow-file-access-from-files",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    "--disable-features=Translate,MediaRouter,OptimizationHints",
    "--font-render-hinting=none",
    `--window-size=${width},${height}`,
    ...(gpu ? ["--use-angle=metal", "--enable-gpu-rasterization"] : ["--disable-gpu"]),
  ];
  const child = spawn(CHROME, args, { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"] });
  child.stderr.on("data", () => {});
  const writer = child.stdio[3];
  const reader = child.stdio[4];
  let id = 0;
  const pending = new Map();
  const listeners = new Set();
  let buf = Buffer.alloc(0);
  reader.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    let nul = buf.indexOf(0);
    while (nul !== -1) {
      const msg = JSON.parse(buf.subarray(0, nul).toString("utf8"));
      buf = buf.subarray(nul + 1);
      nul = buf.indexOf(0);
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message} ${msg.error.data || ""}`));
        else resolve(msg.result);
      } else {
        for (const fn of listeners) fn(msg);
      }
    }
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      writer.write(`${JSON.stringify({ id: mid, method, params, sessionId })}\0`);
    });
  const once = (method, sessionId) =>
    new Promise((resolve) => {
      const fn = (msg) => {
        if (msg.method === method && (!sessionId || msg.sessionId === sessionId)) {
          listeners.delete(fn);
          resolve(msg.params);
        }
      };
      listeners.add(fn);
    });

  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const page = (method, params) => send(method, params, sessionId);
  await page("Page.enable");
  await page("Runtime.enable");
  await page("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: scale,
    mobile: false,
  });
  await page("Emulation.setDefaultBackgroundColorOverride", { color: { r: 7, g: 8, b: 10, a: 1 } });

  return {
    page,
    async goto(url) {
      const loaded = once("Page.loadEventFired", sessionId);
      await page("Page.navigate", { url });
      await loaded;
    },
    async evaluate(expression) {
      const r = await page("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) {
        throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      }
      return r.result.value;
    },
    async screenshot(format = "png", quality) {
      const r = await page("Page.captureScreenshot", {
        format,
        ...(quality ? { quality } : {}),
        optimizeForSpeed: true,
        fromSurface: true,
        captureBeyondViewport: false,
      });
      return Buffer.from(r.data, "base64");
    },
    onConsole(fn) {
      listeners.add((msg) => {
        if (msg.method === "Runtime.consoleAPICalled") {
          fn(msg.params.args.map((a) => a.value ?? a.description).join(" "));
        }
        if (msg.method === "Runtime.exceptionThrown") {
          fn(`EXCEPTION ${msg.params.exceptionDetails.exception?.description}`);
        }
      });
    },
    async close() {
      const exited = new Promise((resolve) => child.once("exit", resolve));
      send("Browser.close").catch(() => {});
      const timer = setTimeout(() => child.kill("SIGKILL"), 3000);
      await exited;
      clearTimeout(timer);
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    },
  };
}
