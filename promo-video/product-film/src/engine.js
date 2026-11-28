// KANON film engine — a tiny deterministic motion system. Every pixel is a pure function of time.
(() => {
  const K = (window.K = {});
  const clamp = (x, a = 0, b = 1) => (x > a ? (x < b ? x : b) : a); // NaN → a
  const lerp = (a, b, t) => a + (b - a) * t;
  const seg = (x, a, b) => clamp((x - a) / (b - a));
  Object.assign(K, { clamp, lerp, seg });
  K.W = 1920;
  K.H = 1080;
  K.ML = 160;
  K.MR = 1760;

  // ---------- easing ----------
  function bezier(x1, y1, x2, y2) {
    const cx = 3 * x1;
    const bx = 3 * (x2 - x1) - cx;
    const ax = 1 - cx - bx;
    const cy = 3 * y1;
    const by = 3 * (y2 - y1) - cy;
    const ay = 1 - cy - by;
    const sx = (t) => ((ax * t + bx) * t + cx) * t;
    const sy = (t) => ((ay * t + by) * t + cy) * t;
    const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
    return (x) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let t = x;
      for (let i = 0; i < 8; i++) {
        const e = sx(t) - x;
        if (Math.abs(e) < 1e-7) return sy(t);
        const d = dx(t);
        if (Math.abs(d) < 1e-7) break;
        t -= e / d;
      }
      let lo = 0;
      let hi = 1;
      t = x;
      for (let i = 0; i < 40; i++) {
        const v = sx(t);
        if (Math.abs(v - x) < 1e-7) break;
        if (x > v) lo = t;
        else hi = t;
        t = (lo + hi) / 2;
      }
      return sy(t);
    };
  }
  K.bezier = bezier;
  K.ease = {
    linear: (t) => t,
    kanon: bezier(0.22, 1, 0.36, 1),
    overlay: bezier(0.32, 0.72, 0, 1),
    exit: bezier(0.4, 0, 1, 1),
    inOut: bezier(0.65, 0, 0.35, 1),
    glide: bezier(0.45, 0.05, 0.2, 1),
    outCubic: (t) => 1 - (1 - t) ** 3,
    inCubic: (t) => t * t * t,
    outQuart: (t) => 1 - (1 - t) ** 4,
    outQuint: (t) => 1 - (1 - t) ** 5,
    outExpo: (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)),
    inExpo: (t) => (t <= 0 ? 0 : 2 ** (10 * t - 10)),
    inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  };
  // Damped spring step response (0 → 1) with gentle overshoot.
  K.spring = (t, freq = 2.2, zeta = 0.55) => {
    if (t <= 0) return 0;
    const w = 2 * Math.PI * freq;
    const wd = w * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + ((zeta * w) / wd) * Math.sin(wd * t));
  };

  // Keyframe track: [[beat, value, easeIntoThisKey?], ...]; values may be numbers or arrays.
  K.track = (keys) => (b) => {
    if (b <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [b1, v1, ez] = keys[i];
      if (b <= b1) {
        const [b0, v0] = keys[i - 1];
        const p = (ez || K.ease.inOut)(seg(b, b0, b1));
        return Array.isArray(v0) ? v0.map((x, j) => lerp(x, v1[j], p)) : lerp(v0, v1, p);
      }
    }
    return keys[keys.length - 1][1];
  };

  // Deterministic hash → [0, 1)
  K.hash = (a, b = 0, c = 0) => {
    let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul((b | 0) + 0x9e37, 0x165667b1);
    h ^= Math.imul((c | 0) + 0x7f4a, 0x9e3779b1);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };

  // ---------- DOM ----------
  K.el = (parent, tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  };
  K.box = (parent, cls, css, text) => {
    const e = K.el(parent, "div", cls, text);
    if (css) Object.assign(e.style, css);
    return e;
  };
  const SVGNS = "http://www.w3.org/2000/svg";
  K.svg = (parent, w = K.W, h = K.H, cls = "abs") => {
    const s = document.createElementNS(SVGNS, "svg");
    s.setAttribute("viewBox", `0 0 ${w} ${h}`);
    s.setAttribute("width", w);
    s.setAttribute("height", h);
    s.setAttribute("class", cls);
    s.style.overflow = "visible";
    parent.appendChild(s);
    return s;
  };
  K.svgEl = (parent, tag, attrs = {}) => {
    const e = document.createElementNS(SVGNS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    parent.appendChild(e);
    return e;
  };
  // Hairline stroke drawn with pathLength=100 (no pixel guessing).
  K.stroke = (svg, d, color, width = 1) =>
    K.svgEl(svg, "path", {
      d,
      fill: "none",
      stroke: color,
      "stroke-width": width,
      pathLength: 100,
      "stroke-dasharray": "100 100",
      "stroke-dashoffset": 100,
      "vector-effect": "non-scaling-stroke",
    });
  K.draw = (path, p, from = 0) => {
    // p: 0..1 visible portion; from: 0..1 trailing erase
    const a = clamp(from) * 100;
    const v = Math.max(0, clamp(p) * 100 - a);
    path.setAttribute("stroke-dasharray", `0 ${a} ${v} 200`);
    path.setAttribute("stroke-dashoffset", 0);
    path.style.opacity = v <= 0.001 ? 0 : 1;
  };
  K.css = (e, s) => {
    for (const k in s) e.style[k] = s[k];
  };
  K.show = (e, op) => {
    e.style.opacity = op;
    e.style.visibility = op <= 0.001 ? "hidden" : "visible";
  };
  K.rect = (e) => e.getBoundingClientRect();

  // ---------- text ----------
  K.split = (el, text, mode = "char") => {
    el.textContent = "";
    const parts = mode === "word" ? text.split(/(\s+)/) : Array.from(text);
    const spans = [];
    for (const p of parts) {
      if (p === "") continue;
      if (/^\s+$/.test(p) && mode === "word") {
        el.appendChild(document.createTextNode(p));
        continue;
      }
      const s = K.el(el, "span", "g", p);
      spans.push(s);
    }
    return spans;
  };

  // Glyph reveal: rise + unblur + fade, staggered. Exit is shorter than entry.
  K.reveal = (spans, b, start, o = {}) => {
    const stagger = o.stagger ?? 0.05;
    const dur = o.dur ?? 0.9;
    const rise = o.rise ?? 0.32;
    const blur = o.blur ?? 10;
    const ez = o.ease || K.ease.kanon;
    const exitAt = o.exitAt ?? Number.POSITIVE_INFINITY;
    const exitDur = o.exitDur ?? 0.4;
    const exitRise = o.exitRise ?? -0.16;
    const out = 1 - K.ease.exit(seg(b, exitAt, exitAt + exitDur));
    const n = spans.length;
    for (let i = 0; i < n; i++) {
      const s = spans[i];
      const k = o.reverse ? n - 1 - i : i;
      const t0 = start + k * stagger;
      const p = ez(seg(b, t0, t0 + dur));
      const op = p * out * (o.opacity ?? 1);
      const y = (1 - p) * rise + (1 - out) * exitRise;
      const bl = (1 - p) * blur + (1 - out) * blur * 0.35;
      s.style.opacity = op;
      s.style.visibility = op <= 0.001 ? "hidden" : "visible";
      s.style.transform = `translate3d(0, ${y.toFixed(4)}em, 0)`;
      s.style.filter = bl > 0.04 ? `blur(${bl.toFixed(2)}px)` : "none";
    }
    return out;
  };

  // Fade + drift for a whole block.
  K.fade = (e, b, start, o = {}) => {
    const dur = o.dur ?? 0.8;
    const ez = o.ease || K.ease.kanon;
    const p = ez(seg(b, start, start + dur));
    const exitAt = o.exitAt ?? Number.POSITIVE_INFINITY;
    const out = 1 - K.ease.exit(seg(b, exitAt, exitAt + (o.exitDur ?? 0.4)));
    const dy = (1 - p) * (o.rise ?? 18) + (1 - out) * (o.exitRise ?? -10);
    const bl = (1 - p) * (o.blur ?? 0);
    const op = p * out * (o.opacity ?? 1);
    e.style.opacity = op;
    e.style.visibility = op <= 0.001 ? "hidden" : "visible";
    e.style.transform = `translate3d(${o.dx ? (1 - p) * o.dx : 0}px, ${dy.toFixed(3)}px, 0)`;
    e.style.filter = bl > 0.04 ? `blur(${bl.toFixed(2)}px)` : "none";
    return op;
  };

  // ---------- rolling numerals (NumberFlow-like, deterministic) ----------
  // Directional (vertical-only) motion blur: a bank of SVG filters, σ in 0.75 px steps.
  let vblur = false;
  const ensureVBlur = () => {
    if (vblur) return;
    vblur = true;
    const s = document.createElementNS(SVGNS, "svg");
    s.setAttribute("width", 0);
    s.setAttribute("height", 0);
    s.style.position = "absolute";
    const defs = document.createElementNS(SVGNS, "defs");
    for (let n = 1; n <= 48; n++) {
      const f = document.createElementNS(SVGNS, "filter");
      f.setAttribute("id", `vb${n}`);
      f.setAttribute("x", "-5%");
      f.setAttribute("width", "110%");
      f.setAttribute("y", "-40%");
      f.setAttribute("height", "180%");
      const g = document.createElementNS(SVGNS, "feGaussianBlur");
      g.setAttribute("stdDeviation", `0 ${(n * 0.75).toFixed(2)}`);
      f.appendChild(g);
      defs.appendChild(f);
    }
    s.appendChild(defs);
    document.body.appendChild(s);
  };
  // text: final string. Digits roll from `from` digits (default 0) with extra laps on lower orders.
  K.roller = (el, text, o = {}) => {
    ensureVBlur();
    el.textContent = "";
    el.classList.add("roll");
    const chars = Array.from(text);
    const from = o.from ? Array.from(o.from) : null;
    const cols = [];
    const statics = [];
    const digitCount = chars.filter((c) => /\d/.test(c)).length;
    let di = 0;
    chars.forEach((c, i) => {
      if (/\d/.test(c)) {
        const col = K.el(el, "span", "rc");
        const strip = K.el(col, "span", "rs");
        for (const d of "01234567890") K.el(strip, "span", "rd", d);
        const end = Number(c);
        const start = from && /\d/.test(from[i] || "") ? Number(from[i]) : 0;
        const order = digitCount - 1 - di; // 0 = least significant
        const laps = o.laps ? o.laps(order, di) : Math.min(2, order === 0 ? 2 : order === 1 ? 1 : 0);
        const travel = laps * 10 + ((end - start + 10) % 10);
        cols.push({ col, strip, start, travel, di, order });
        di++;
      } else {
        const s = K.el(el, "span", "rx", c);
        statics.push({ s, c, i });
      }
    });
    const n = cols.length;
    const spread = o.spread ?? 0.16;
    const api = {
      el,
      cols,
      statics,
      // p: 0..1 overall progress
      update(p, opts = {}) {
        const ez = opts.ease || K.ease.outQuart;
        for (const c of cols) {
          const a = (c.di / Math.max(1, n - 1)) * spread;
          const b = 1 - spread + a;
          const q = seg(p, a, b);
          const pos = c.start + c.travel * ez(q);
          const pos2 = c.start + c.travel * ez(seg(p + 0.004, a, b));
          const speed = Math.abs(pos2 - pos) / 0.004; // digits per unit progress
          const m = ((pos % 10) + 10) % 10;
          c.strip.style.transform = `translate3d(0, ${(-m * 1.2).toFixed(4)}em, 0)`;
          // px travelled per output frame → vertical streak; the 4 temporal samples fill the rest
          if (!api.fontPx) api.fontPx = Number.parseFloat(getComputedStyle(el).fontSize);
          const pxPerFrame = (speed / ((opts.dur ?? 1) * 60)) * 1.2 * api.fontPx;
          const nb = Math.min(48, Math.round((pxPerFrame * 0.16) / 0.75));
          c.strip.style.filter = nb >= 1 ? `url(#vb${nb})` : "none";
        }
      },
    };
    return api;
  };

  // Ink-box centre of a single glyph span, in viewport px (uses canvas metrics).
  const mctx = document.createElement("canvas").getContext("2d");
  K.glyphBox = (span) => {
    const cs = getComputedStyle(span);
    const r = span.getBoundingClientRect();
    const scale = span.offsetWidth ? r.width / span.offsetWidth : 1;
    mctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const m = mctx.measureText(span.textContent);
    const fa = m.fontBoundingBoxAscent;
    const fd = m.fontBoundingBoxDescent;
    const lh = cs.lineHeight === "normal" ? fa + fd : Number.parseFloat(cs.lineHeight);
    const baseline = r.top + scale * ((lh - (fa + fd)) / 2 + fa);
    const inkL = -m.actualBoundingBoxLeft;
    const inkR = m.actualBoundingBoxRight;
    const cx = r.left + scale * ((inkL + inkR) / 2);
    const cy = baseline - scale * ((m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
    return {
      cx,
      cy,
      w: scale * (inkR - inkL),
      h: scale * (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent),
      baseline,
    };
  };

  // ---------- scenes ----------
  K.scenes = [];
  K.scene = (def) => {
    K.scenes.push(def);
    return def;
  };

  // ---------- the protagonist: one coral note ----------
  K.dot = {
    s: null,
    reset() {
      this.s = null;
    },
    // {x, y, r, op, w, h, radius, color, glow}
    set(state) {
      this.s = Object.assign({ r: 7, op: 1 }, state);
    },
  };

  // Background state per frame.
  K.frameState = { bg: "dark" };
  K.setBg = (mode) => {
    K.frameState.bg = mode;
  };
})();
