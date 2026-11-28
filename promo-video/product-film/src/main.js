// Boot: mount scenes, expose a deterministic seek for the renderer, and a realtime preview.
(() => {
  const { K, TL } = window;
  const stage = document.getElementById("stage");

  const FONTS = [
    "200 300px Inter",
    "100 440px Inter",
    "300 88px Inter",
    "400 58px Inter",
    "500 12px Inter",
    "600 15px Inter",
    "400 13px 'JetBrains Mono'",
    "300 76px 'Noto Serif SC'",
    "400 70px 'Instrument Serif'",
    "italic 400 70px 'Instrument Serif'",
  ];

  function grainTiles() {
    const tiles = [];
    for (let n = 0; n < 6; n++) {
      const c = document.createElement("canvas");
      c.width = 256;
      c.height = 256;
      const ctx = c.getContext("2d");
      const img = ctx.createImageData(256, 256);
      for (let i = 0; i < 256 * 256; i++) {
        const u = K.hash(i, n, 91) + K.hash(i, n, 92) + K.hash(i, n, 93) - 1.5; // ~gaussian
        const v = u > 0 ? 255 : 0;
        img.data[i * 4] = v;
        img.data[i * 4 + 1] = v;
        img.data[i * 4 + 2] = v;
        img.data[i * 4 + 3] = Math.min(255, Math.abs(u) * 8);
      }
      ctx.putImageData(img, 0, 0);
      tiles.push(c.toDataURL("image/png"));
    }
    return tiles;
  }

  let dotEl;
  let vig;
  let grain;
  let tiles;

  function renderDot() {
    const d = K.dot.s;
    if (!d || d.op <= 0.001 || !(d.r > 0.01 || d.w)) {
      dotEl.style.visibility = "hidden";
      return;
    }
    const w = d.w ?? d.r * 2;
    const h = d.h ?? d.r * 2;
    const radius = d.radius ?? Math.min(w, h) / 2;
    const paper = K.frameState.bg === "paper";
    dotEl.style.visibility = "visible";
    dotEl.style.width = `${w.toFixed(3)}px`;
    dotEl.style.height = `${h.toFixed(3)}px`;
    dotEl.style.borderRadius = `${radius.toFixed(3)}px`;
    dotEl.style.transform = `translate3d(${(d.x - w / 2).toFixed(3)}px, ${(d.y - h / 2).toFixed(3)}px, 0)`;
    dotEl.style.opacity = d.op.toFixed(4);
    dotEl.style.background = d.color || (paper ? "#c44928" : "#ea6b4a");
    const g = d.glow || 0;
    dotEl.style.boxShadow = g > 0.01 ? `0 0 ${(26 * g).toFixed(1)}px ${(5 * g).toFixed(1)}px rgba(234,107,74,${(0.5 * g).toFixed(3)})` : "none";
  }

  function renderBg(b) {
    const mode = K.frameState.bg;
    stage.style.background = mode === "paper" ? "#f6f5f1" : "#07080a";
    if (b < 6) {
      vig.style.background = "none";
    } else if (mode === "paper") {
      vig.style.background = "radial-gradient(ellipse 80% 75% at 50% 42%, rgba(0,0,0,0) 58%, rgba(70,60,45,0.075) 100%)";
    } else {
      vig.style.background =
        "radial-gradient(ellipse 62% 52% at 50% 36%, rgba(229,227,221,0.04), rgba(229,227,221,0) 72%), radial-gradient(ellipse 78% 72% at 50% 45%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.42) 100%)";
    }
  }

  function renderGrain(frame, b) {
    const i = frame % tiles.length;
    grain.style.backgroundImage = `url(${tiles[i]})`;
    const ox = Math.floor(K.hash(frame, 5) * 256);
    const oy = Math.floor(K.hash(frame, 6) * 256);
    grain.style.backgroundPosition = `${ox / 2}px ${oy / 2}px`;
    const g = b < 5 ? 0.55 : b < 6 ? 0 : K.frameState.bg === "paper" ? 0.75 : 0.9;
    grain.style.opacity = K.noGrain ? 0 : g; // final renders add grain in FFmpeg, after motion blur
  }

  function seek(t, frame) {
    const b = TL.beat(t);
    K.t = t;
    K.b = b;
    K.frame = frame ?? Math.round(t * TL.fps);
    K.dot.reset();
    K.setBg("dark");
    for (const s of K.scenes) {
      const on = b >= s.from && b < s.to;
      s.root.style.display = on ? "" : "none";
      if (on) s.update(b, t);
    }
    renderDot();
    renderBg(b);
    renderGrain(K.frame, b);
  }

  async function boot() {
    await Promise.all(FONTS.map((f) => document.fonts.load(f, "0123456789KANON 卡农")));
    await document.fonts.ready;
    for (const s of K.scenes) {
      s.root = K.box(stage, "scene");
      s.root.dataset.scene = s.id;
      s.mount(s.root);
    }
    vig = K.box(stage, "", null);
    vig.id = "vignette";
    dotEl = K.box(stage, "", null);
    dotEl.id = "dot";
    tiles = grainTiles();
    grain = K.box(stage, "", { backgroundSize: "128px 128px" });
    grain.id = "dither";
    for (const s of K.scenes) if (s.measure) s.measure();
    seek(0, 0);
  }

  const raf2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  window.__ready = boot().then(() => ({ duration: TL.duration, fps: TL.fps }));
  window.__seek = async (t, frame) => {
    seek(t, frame);
    await raf2();
    return true;
  };

  const q = new URLSearchParams(location.search);
  if (q.has("t")) window.__ready.then(() => window.__seek(Number(q.get("t"))));
  if (q.has("play")) {
    window.__ready.then(() => {
      const audio = new Audio("../out/score.wav");
      const t0 = Number(q.get("play")) || 0;
      audio.currentTime = t0;
      const start = performance.now() - t0 * 1000;
      audio.play().catch(() => {});
      const loop = () => {
        const t = (performance.now() - start) / 1000;
        seek(t % TL.duration);
        requestAnimationFrame(loop);
      };
      loop();
    });
  }
})();
