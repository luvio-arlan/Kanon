// Prelude · the noise. Flickering quotes, intraday scribbles, subliminal percentages — then nothing.
(() => {
  const { K } = window;
  const TICKERS =
    "NVDA TSM MU AAPL MSFT AMZN GOOGL META AVGO ASML AMD NFLX TSLA JPM V MA COST LLY ORCL ADBE CRM QCOM INTC TXN SHOP UBER ABNB NOW PANW SNOW PLTR ARM SMCI MRVL KO PEP WMT NKE DIS 0700.HK 9988.HK 3690.HK 1810.HK 2318.HK 0005.HK 1299.HK 0941.HK".split(
      " ",
    );
  const COLS = 10;
  const ROWS = 36;
  const L0 = 0.5;
  const ALPHA = 0.9;
  const lam = (t) => (L0 / ALPHA) * (Math.exp(ALPHA * t) - 1);
  const rate = (t) => L0 * Math.exp(ALPHA * t);
  const RED = [214, 84, 74];
  const GREEN = [52, 168, 112];
  const GRAY = [134, 137, 149];

  K.scene({
    id: "noise",
    from: 0,
    to: 5,
    mount(root) {
      const dpr = window.devicePixelRatio || 1;
      this.dpr = dpr;
      const mk = (blur) => {
        const cv = K.el(root, "canvas", "abs");
        cv.width = K.W * dpr;
        cv.height = K.H * dpr;
        cv.style.width = `${K.W}px`;
        cv.style.height = `${K.H}px`;
        if (blur) cv.style.filter = `blur(${blur}px)`;
        return cv.getContext("2d");
      };
      this.ctx = mk(0);
      this.near = mk(1.6);
      this.cells = [];
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const k = r * COLS + c;
          this.cells.push({
            k,
            x: 22 + c * 190 + K.hash(k, 1) * 10,
            y: 30 + r * 30,
            tk: TICKERS[Math.floor(K.hash(k, 2) * TICKERS.length)],
            p0: 6 + K.hash(k, 3) ** 2 * 880,
            r: 0.4 + K.hash(k, 4) * 1.2,
            ph: K.hash(k, 5),
            w: 0.55 + K.hash(k, 6) * 0.45,
          });
        }
      }
      this.charts = [];
      for (let i = 0; i < 22; i++) {
        const w = 180 + K.hash(i, 11) * 300;
        const h = 40 + K.hash(i, 12) * 100;
        const vals = [0];
        for (let j = 1; j < 520; j++) vals.push(vals[j - 1] + (K.hash(i, j, 13) - 0.5));
        const tint = K.hash(i, 14);
        this.charts.push({
          x: K.hash(i, 15) * (K.W - w),
          y: 40 + K.hash(i, 16) * (K.H - h - 80),
          w,
          h,
          vals,
          col: tint < 0.18 ? RED : tint < 0.36 ? GREEN : GRAY,
          a: 0.5 + K.hash(i, 17) * 0.5,
          sp: 1 + K.hash(i, 18) * 2.5,
        });
      }
      this.tape = [];
      for (let i = 0; i < 46; i++) {
        const tk = TICKERS[i % TICKERS.length];
        const ch = (K.hash(i, 21) - 0.5) * 7;
        this.tape.push(`${tk} ${(8 + K.hash(i, 22) * 600).toFixed(2)} ${ch >= 0 ? "▲" : "▼"}${Math.abs(ch).toFixed(2)}`);
      }
      this.tapeText = this.tape.join("     ");
    },
    update(b, t) {
      const { ctx, near, dpr } = this;
      const I = K.seg(t, 0, 5) ** 1.25;
      const push = K.ease.inCubic(K.seg(t, 0, 5));
      const flick = t > 4.3 ? 0.9 + 0.2 * K.hash(Math.round(t * 60), 77) * K.seg(t, 4.3, 5) : 1;
      const rise = 6 * t + 18 * t * t;
      const cam = (c, scale) => {
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        c.translate(960, 540);
        c.scale(scale, scale);
        c.translate(-960, -540);
        return scale;
      };
      for (const c of [ctx, near]) {
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        c.clearRect(0, 0, K.W, K.H);
      }
      // far layer: small, dim, slow
      let sc = cam(ctx, 0.74 * (1 + 0.06 * push));
      this.drawCells(ctx, t, I * 0.5, flick, 1000, 1, rise * 0.4, sc);
      // mid layer: the board
      sc = cam(ctx, 1 + 0.11 * push);
      this.drawCharts(ctx, t, I, flick);
      this.drawCells(ctx, t, I, flick, 0, 1, rise, sc);
      this.drawGhosts(ctx, t, I);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.drawTape(ctx, t, I, flick);
      // near layer: large, defocused, fast — sells the depth
      sc = cam(near, 1.95 * (1 + 0.2 * push));
      this.drawCells(near, t, I * 0.55, flick, 2000, 0.3, rise * 2.2, sc);
    },
    drawCells(ctx, t, I, flick, seed, keep, dy, sc) {
      const yLo = 540 - 540 / sc - 24;
      const yHi = 540 + 540 / sc + 24;
      const xLo = 960 - 960 / sc - 200;
      const xHi = 960 + 960 / sc + 20;
      ctx.font = "400 12px 'JetBrains Mono'";
      ctx.textBaseline = "alphabetic";
      const L = lam(t);
      const R = rate(t);
      for (const c0 of this.cells) {
        if (keep < 1 && K.hash(c0.k, seed, 8) > keep) continue;
        const c = seed ? this.variant(c0, seed) : c0;
        const n = L * c.r + c.ph;
        if (n < 0.6) continue;
        const v = Math.floor(n);
        const since = (n - v) / (R * c.r);
        const flash = Math.exp(-since / 0.07);
        const ch = (K.hash(c.k, v, 3) - 0.5) * 8;
        const price = c.p0 * (1 + 0.03 * (K.hash(c.k, v, 9) - 0.5));
        const col = flash > 0.05 ? (ch >= 0 ? GREEN : RED) : GRAY;
        const mix = Math.min(1, flash * 1.2);
        const rr = GRAY[0] + (col[0] - GRAY[0]) * mix;
        const gg = GRAY[1] + (col[1] - GRAY[1]) * mix;
        const bb = GRAY[2] + (col[2] - GRAY[2]) * mix;
        const a = (0.07 + 0.34 * I) * c.w * flick + flash * 0.38 * (0.35 + I);
        ctx.fillStyle = `rgba(${rr | 0},${gg | 0},${bb | 0},${Math.min(0.9, a).toFixed(3)})`;
        const txt = `${c.tk.padEnd(8)}${price.toFixed(2).padStart(7)} ${ch >= 0 ? "+" : "−"}${Math.abs(ch).toFixed(2)}%`;
        const y0 = ((((c.y - dy) % 1080) + 1080) % 1080) - 1080;
        for (let y = y0; y < yHi; y += 1080) {
          if (y < yLo) continue;
          for (let x = c.x - 1900; x < xHi; x += 1900) if (x > xLo) ctx.fillText(txt, x, y);
        }
      }
    },
    variant(c, seed) {
      const k = c.k + seed;
      return { k, x: c.x, y: c.y + 600 * K.hash(k, 41) - 300, tk: TICKERS[Math.floor(K.hash(k, 2) * TICKERS.length)], p0: 6 + K.hash(k, 3) ** 2 * 880, r: 0.4 + K.hash(k, 4) * 1.2, ph: K.hash(k, 5), w: 0.55 + K.hash(k, 6) * 0.45 };
    },
    drawCharts(ctx, t, I, flick) {
      const L = lam(t);
      ctx.lineWidth = 1;
      ctx.lineJoin = "round";
      for (const ch of this.charts) {
        const n = Math.floor(ch.w / 5);
        const off = Math.floor(L * ch.sp) % (ch.vals.length - n - 1);
        let lo = Number.POSITIVE_INFINITY;
        let hi = Number.NEGATIVE_INFINITY;
        for (let j = 0; j <= n; j++) {
          const v = ch.vals[off + j];
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
        const span = Math.max(1e-6, hi - lo);
        const a = (0.06 + 0.42 * I) * ch.a * flick;
        ctx.strokeStyle = `rgba(${ch.col[0]},${ch.col[1]},${ch.col[2]},${a.toFixed(3)})`;
        ctx.beginPath();
        for (let j = 0; j <= n; j++) {
          const x = ch.x + (j / n) * ch.w;
          const y = ch.y + ch.h - ((ch.vals[off + j] - lo) / span) * ch.h;
          if (j === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    },
    drawGhosts(ctx, t, I) {
      for (let e = 0; e < 70; e++) {
        const te = 0.6 + 4.4 * Math.sqrt(K.hash(e, 31));
        const d = 0.05 + K.hash(e, 32) * 0.05;
        if (t < te || t > te + d) continue;
        const up = K.hash(e, 33) > 0.5;
        const val = `${up ? "+" : "−"}${(1 + K.hash(e, 34) * 14).toFixed(1)}%`;
        const size = 90 + K.hash(e, 35) * 200;
        const col = K.hash(e, 36) < 0.5 ? GRAY : up ? GREEN : RED;
        ctx.font = `200 ${size.toFixed(0)}px Inter`;
        ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${(0.05 + 0.12 * I).toFixed(3)})`;
        ctx.fillText(val, K.hash(e, 37) * (K.W - size * 2.4), 160 + K.hash(e, 38) * (K.H - 200));
      }
    },
    drawTape(ctx, t, I, flick) {
      ctx.font = "400 11px 'JetBrains Mono'";
      const w = ctx.measureText(this.tapeText).width + 40;
      const S = 70 * t + (420 / ALPHA) * (Math.exp(ALPHA * t) - 1) * 0.18;
      ctx.fillStyle = `rgba(134,137,149,${((0.1 + 0.3 * I) * flick).toFixed(3)})`;
      for (const [y, dir] of [
        [14, 1],
        [1072, -1],
      ]) {
        const x0 = dir > 0 ? -(S % w) : (S % w) - w;
        ctx.fillText(this.tapeText, x0, y);
        ctx.fillText(this.tapeText, x0 + w, y);
      }
    },
  });
})();
