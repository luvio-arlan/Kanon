// KANON product film renderer: headless Chrome (CDP over pipe) → PNG frames → FFmpeg.
//   node render.mjs stills 6.5 12 20.2         # stills at those seconds  (out/stills)
//   node render.mjs sheet 2.5                   # contact sheet every 2.5 s (out/sheet.png)
//   node render.mjs video --scale 2 --sub 4     # full film, 4K60 with 4-sample motion blur
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { launch } from "./lib/cdp.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "out");
const PAGE = pathToFileURL(join(here, "src", "index.html")).href;
mkdirSync(OUT, { recursive: true });

const args = process.argv.slice(2);
const mode = args[0];
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : def;
};
const log = (s) => process.stdout.write(`${s}\n`);

async function open(scale, opts = {}) {
  const b = await launch({ scale });
  const errors = [];
  b.onConsole((m) => errors.push(m));
  await b.goto(PAGE);
  const info = await b.evaluate("window.__ready");
  if (opts.noGrain) await b.evaluate("K.noGrain = true");
  const fontsOk = await b.evaluate(
    `["200 300px Inter","300 76px 'Noto Serif SC'","400 70px 'Instrument Serif'","400 13px 'JetBrains Mono'"].every((f) => document.fonts.check(f))`,
  );
  if (!fontsOk) throw new Error("fonts failed to load");
  return { b, info, errors };
}

async function stills(times, scale = 1, dir = join(OUT, "stills")) {
  mkdirSync(dir, { recursive: true });
  const { b, errors } = await open(scale);
  const files = [];
  for (const t of times) {
    await b.evaluate(`__seek(${t})`);
    const f = join(dir, `t${t.toFixed(2).padStart(6, "0")}.png`);
    writeFileSync(f, await b.screenshot());
    files.push(f);
  }
  await b.close();
  if (errors.length) log(`page messages:\n  ${errors.slice(0, 12).join("\n  ")}`);
  return files;
}

async function sheet(step, scale = 0.5) {
  const { b, info } = await open(0.5);
  await b.close();
  const times = [];
  for (let t = step / 2; t < info.duration; t += step) times.push(Number(t.toFixed(2)));
  const dir = join(OUT, "sheet");
  rmSync(dir, { recursive: true, force: true });
  const files = await stills(times, scale, dir);
  const cols = 4;
  const rows = Math.ceil(files.length / cols);
  execFileSync("ffmpeg", [
    "-v", "error", "-y", "-framerate", "1", "-pattern_type", "glob", "-i", join(dir, "*.png"),
    "-vf", `scale=640:-1,tile=${cols}x${rows}:padding=6:color=0x333333`,
    "-frames:v", "1", join(OUT, "sheet.png"),
  ]);
  log(`sheet: ${files.length} stills → out/sheet.png`);
}

async function worker(id, frames, opt) {
  const { b } = await open(opt.scale, { noGrain: true });
  for (const [n, t, file] of frames) {
    await b.evaluate(`__seek(${t}, ${n})`);
    writeFileSync(file, await b.screenshot());
    opt.done++;
  }
  await b.close();
}

async function video() {
  const opt = {
    scale: flag("scale", 2),
    fps: flag("fps", 60),
    sub: flag("sub", 4),
    workers: flag("workers", 4),
    shutter: flag("shutter", 0.5),
    done: 0,
  };
  const probe = await open(0.25);
  const duration = flag("to", probe.info.duration);
  await probe.b.close();
  const from = flag("from", 0);
  const dir = join(OUT, "frames");
  // --keep patches a range in place (frame files are indexed absolutely), otherwise start clean
  if (!args.includes("--keep")) rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const jobs = [];
  const n0 = Math.round(from * opt.fps);
  const n1 = Math.round(duration * opt.fps);
  for (let n = n0; n < n1; n++) {
    for (let k = 0; k < opt.sub; k++) {
      const off = opt.sub > 1 ? ((k + 0.5) / opt.sub - 0.5) * (opt.shutter / opt.fps) : 0;
      const idx = n * opt.sub + k;
      jobs.push([n, Math.max(0, n / opt.fps + off), join(dir, `${String(idx).padStart(7, "0")}.png`)]);
    }
  }
  const per = Math.ceil(jobs.length / opt.workers);
  const t0 = Date.now();
  const timer = setInterval(() => {
    const el = (Date.now() - t0) / 1000;
    const eta = opt.done ? (el / opt.done) * (jobs.length - opt.done) : 0;
    log(`  ${opt.done}/${jobs.length} frames · ${el.toFixed(0)}s elapsed · eta ${eta.toFixed(0)}s`);
  }, 15000);
  await Promise.all(
    Array.from({ length: opt.workers }, (_, w) => worker(w, jobs.slice(w * per, (w + 1) * per), opt)),
  );
  clearInterval(timer);
  log(`rendered ${jobs.length} images in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  if (!args.includes("--no-encode")) encode(dir, opt);
}

function encode(dir, opt) {
  const S = opt.sub;
  const oi = args.indexOf("--out");
  const name = oi >= 0 ? args[oi + 1] : `kanon-product-film-${opt.scale >= 2 ? "4k" : "1080p"}`;
  const outFile = join(OUT, `${name}.mp4`);
  const audio = join(OUT, "score.wav");
  const blend = S > 1 ? `tmix=frames=${S},select='not(mod(n+1\\,${S}))',setpts=N/(${opt.fps}*TB),` : "";
  const grain = flag("grain", 2);
  const fit = flag("width", 0) ? `scale=${flag("width", 0)}:-2:flags=lanczos,` : "";
  const vf = `${blend}${fit}scale=out_color_matrix=bt709:out_range=tv:flags=lanczos+accurate_rnd+full_chroma_int,format=yuv420p${grain ? `,noise=c0s=${grain}:c0f=t` : ""}`;
  const a = [
    "-v", "error", "-stats", "-y",
    "-framerate", String(opt.fps * S), "-i", join(dir, "%07d.png"),
  ];
  if (existsSync(audio) && !flag("from", 0)) a.push("-i", audio);
  a.push(
    "-vf", vf, "-r", String(opt.fps),
    "-c:v", "libx264", "-preset", "slow", "-crf", String(flag("crf", 14)), "-profile:v", "high",
    "-tune", "film", "-x264-params", "aq-mode=3:deblock=-1,-1",
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
  );
  if (existsSync(audio) && !flag("from", 0)) a.push("-c:a", "aac", "-b:a", "320k", "-shortest");
  a.push("-movflags", "+faststart", outFile);
  execFileSync("ffmpeg", a, { stdio: "inherit" });
  log(`encoded → ${outFile}`);
}

if (mode === "stills") {
  const nums = args.slice(1).filter((x) => !x.startsWith("--") && !Number.isNaN(Number(x))).map(Number);
  const files = await stills(nums, flag("scale", 1));
  log(files.join("\n"));
} else if (mode === "sheet") {
  await sheet(Number(args[1] || 2.5));
} else if (mode === "video") {
  await video();
} else if (mode === "encode") {
  encode(join(OUT, "frames"), { scale: flag("scale", 2), fps: flag("fps", 60), sub: flag("sub", 4) });
} else {
  log("usage: node render.mjs stills <t...> | sheet <step> | video [--scale 2 --sub 4 --workers 4] | encode");
}
