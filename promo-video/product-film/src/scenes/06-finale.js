// Movement VI — zero leverage, then the full score: every voice composed into one workbench. Coda.
(() => {
  const { K, COPY } = window;
  const M = COPY.m6;
  const MONO = [
    "M16.3 0H24.8L27.4 48.1L12 66.3L16.3 0Z",
    "M73.8 0H89.4C88.2 21.5 76.2 38.2 49.6 50C35.2 63.4 27.6 79.4 26.7 100H10.6C11.4 77.2 19.6 60.8 36 50C59.8 34.4 72.1 19.8 73.8 0Z",
    "M54.5 54.8C64.2 63.6 74.8 77.5 88.9 100H72.1C64.5 84.8 56.6 70.6 46.8 60.4L54.5 54.8Z",
  ];
  const monogram = (parent, h, ink = "var(--ink)") => {
    const s = K.svg(parent, 84, 100, "");
    s.setAttribute("viewBox", "8 0 84 100");
    s.setAttribute("height", h);
    s.setAttribute("width", (h * 84) / 100);
    s.style.overflow = "visible";
    return MONO.map((d, i) => K.svgEl(s, "path", { d, fill: i === 2 ? "var(--coral)" : ink }));
  };
  K.monogram = monogram;

  const sheenCss = {
    backgroundImage:
      "linear-gradient(100deg, #d9d7d0 0%, #e5e3dd 36%, #f6f5f1 45%, #ffffff 50%, #f6f5f1 55%, #e5e3dd 64%, #d9d7d0 100%)",
    backgroundSize: "320% 100%",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
  };

  function buildUI(win, refs) {
    const top = K.box(win, "abs", { left: "0px", top: "0px", width: "1600px", height: "64px", borderBottom: "1px solid var(--hair)", boxSizing: "border-box" });
    refs.topItems = [];
    const brand = K.box(top, "abs", { left: "28px", top: "22px", display: "flex", alignItems: "center", gap: "11px" });
    monogram(brand, 18);
    K.el(brand, "span", "", "KANON").style.cssText = "font:500 12px Inter;letter-spacing:.24em;color:var(--ink)";
    const tick = K.box(top, "abs", { left: "336px", top: "21px", display: "flex", alignItems: "baseline", gap: "12px" });
    K.el(tick, "span", "", M.ticker).style.cssText = "font:600 15px Inter;letter-spacing:.04em;color:var(--ink)";
    K.el(tick, "span", "", M.tickerName).style.cssText = "font:400 14px 'PingFang SC';color:var(--ink2)";
    const av = K.box(top, "abs", { left: "1544px", top: "18px", width: "28px", height: "28px", borderRadius: "999px", border: "1px solid var(--hair2)", boxSizing: "border-box" });
    refs.topItems.push(brand, tick, av);
    const side = K.box(win, "abs", { left: "0px", top: "64px", width: "300px", height: "796px", borderRight: "1px solid var(--hair)", boxSizing: "border-box" });
    refs.rows = COPY.steps.map((name, i) => {
      const row = K.box(side, "abs", { left: "0px", top: `${28 + i * 72}px`, width: "300px", height: "72px", borderBottom: i < 4 ? "1px solid var(--hair)" : "none", boxSizing: "border-box" });
      K.box(row, "abs t-mono", { left: "44px", top: "28px", fontSize: "12px" }, String(i + 1).padStart(2, "0"));
      const nm = K.box(row, "abs", { left: "84px", top: "24px", font: "400 15px 'PingFang SC'", letterSpacing: "0.04em", color: i === 4 ? "var(--ink)" : "var(--ink2)", whiteSpace: "nowrap" }, name);
      if (i < 4) K.box(row, "abs t-mono", { left: "262px", top: "26px", fontSize: "13px" }, "✓");
      const marker = K.box(row, "abs", { left: "22px", top: "32px", width: "8px", height: "8px" });
      return { row, nm, marker };
    });
    const main = K.box(win, "abs", { left: "300px", top: "64px", width: "1300px", height: "796px", padding: "36px", boxSizing: "border-box", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gridTemplateRows: "repeat(2, 1fr)", gap: "20px" });
    refs.cards = M.cards.map((c, j) => {
      const card = K.box(main, "", { position: "relative", background: "var(--surface)", border: "1px solid var(--hair)", borderRadius: "14px", padding: "28px 30px", boxSizing: "border-box", overflow: "hidden" });
      K.box(card, "t-label", { fontSize: "15px" }, c.k);
      const v = K.box(card, "t-num", { fontSize: "68px", marginTop: "86px", color: "var(--ink)" });
      if (j === 5) {
        K.el(v, "span", "", "0.00");
        const x = K.el(v, "span", "", "×");
        x.style.color = "var(--coral)";
        refs.slot = v;
      } else v.textContent = c.v;
      K.box(card, /[一-鿿]/.test(c.s) ? "t-label" : "t-mono", { fontSize: /[一-鿿]/.test(c.s) ? "14px" : "12px", marginTop: "10px", color: "var(--ink3)" }, c.s);
      if (j === 3) {
        const mini = K.box(card, "abs", { left: "auto", right: "30px", top: "30px", display: "grid", gridTemplateColumns: "repeat(5, 11px)", gap: "3px" });
        for (let n = 0; n < 25; n++) {
          const i = Math.floor(n / 5);
          const k = n % 5;
          K.box(mini, "", { width: "11px", height: "11px", borderRadius: "2px", background: n === 12 ? "var(--titan)" : `rgba(229,227,221,${(0.05 + 0.03 * (i + k)).toFixed(2)})` });
        }
      }
      if (j === 4) {
        const s = K.svg(card, 120, 60, "");
        s.style.cssText = "position:absolute;right:30px;top:30px;overflow:visible";
        for (const y of [6, 22, 38, 54]) K.svgEl(s, "path", { d: `M0 ${y} C40 ${y} 70 30 120 30`, fill: "none", stroke: "rgba(229,227,221,0.35)", "stroke-width": 1 });
      }
      return { card, v };
    });
  }

  K.scene({
    id: "m6",
    from: 54,
    to: 62,
    mount(root) {
      this.hit = K.box(root, "abs t-num", { left: "0px", width: `${K.W}px`, textAlign: "center", top: "318px", fontSize: "440px", fontWeight: 100, letterSpacing: "-0.05em", transformOrigin: "0 0" });
      this.hitInner = K.el(this.hit, "span", "");
      this.hitInner.style.display = "inline-block";
      this.zero = K.el(this.hitInner, "span", "", "0.00");
      K.css(this.zero, sheenCss);
      this.times = K.el(this.hitInner, "span", "", "×");
      this.times.style.color = "var(--coral)";
      this.label = K.box(root, "abs t-label", { left: "0px", width: `${K.W}px`, textAlign: "center", top: "372px", fontSize: "22px", letterSpacing: "0.6em", paddingLeft: "0.6em", boxSizing: "border-box" }, M.label);
      const t = K.box(root, "abs t-serif", { left: "0px", width: `${K.W}px`, textAlign: "center", top: "812px", fontSize: "54px", letterSpacing: "0.08em" });
      this.title = K.split(t, M.title);
      this.persp = K.box(root, "abs", { width: `${K.W}px`, height: `${K.H}px`, perspective: "2400px", perspectiveOrigin: "960px 380px" });
      this.world = K.box(this.persp, "abs", { width: `${K.W}px`, height: `${K.H}px`, transformOrigin: "960px 540px" });
      this.win = K.box(this.world, "abs", { left: "160px", top: "110px", width: "1600px", height: "860px", background: "var(--bg2)", border: "1px solid var(--hair)", borderRadius: "20px", overflow: "hidden", boxSizing: "border-box", boxShadow: "0 80px 200px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)" });
      this.refs = {};
      buildUI(this.win, this.refs);
      this.persp.style.zIndex = 1;
      this.hit.style.zIndex = 5;
    },
    measure() {
      const g = K.glyphBox(this.times);
      this.timesAt = { x: g.cx, y: g.cy, r: 15 };
    },
    update(b) {
      // the strike
      const imp = K.ease.outExpo(K.seg(b, 54, 54.7));
      const blur = 18 * (1 - K.ease.outCubic(K.seg(b, 54, 54.3)));
      const fly = K.ease.glide(K.seg(b, 56.5, 57.45));
      this.hit.style.transform = "none";
      const box = K.rect(this.hit);
      const big = K.rect(this.hitInner);
      const slot = K.rect(this.refs.slot);
      const s = K.lerp(1.07 - 0.07 * imp, slot.height / big.height, fly);
      // scale about the numeral's own top-left so it lands exactly on the card's figure
      this.hit.style.transformOrigin = `${(big.left - box.left).toFixed(2)}px ${(big.top - box.top).toFixed(2)}px`;
      const arc = Math.sin(Math.PI * fly) * -40;
      this.hit.style.transform = `translate(${((slot.left - big.left) * fly).toFixed(2)}px, ${((slot.top - big.top) * fly + arc).toFixed(2)}px) scale(${s.toFixed(5)})`;
      this.hit.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : "none";
      const hand = K.seg(b, 57.35, 57.55);
      this.hit.style.opacity = (K.seg(b, 54, 54.05) * (1 - hand)).toFixed(3);
      this.refs.slot.style.opacity = hand.toFixed(3);
      const sweep = K.ease.inOutSine(K.seg(b, 55.0, 56.6));
      this.zero.style.backgroundPosition = `${(100 - 100 * sweep).toFixed(2)}% 0`;
      K.fade(this.label, b, 54.4, { rise: 10, exitAt: 56.3, exitDur: 0.3 });
      K.reveal(this.title, b, 54.8, { stagger: 0.07, dur: 1.0, exitAt: 56.3, exitDur: 0.3 });
      this.updateUI(b);
    },
    updateUI(b) {
      const cam = K.ease.glide(K.seg(b, 56.5, 59.2));
      const drift = K.ease.inOutSine(K.seg(b, 59.2, 61.2));
      const collapse = K.ease.exit(K.seg(b, 61.0, 61.9));
      const rx = K.lerp(13, 6, cam) - 2 * drift;
      const sc = K.lerp(1.05, 1.0, cam) - 0.015 * drift - 0.05 * collapse;
      const ty = K.lerp(34, 0, cam);
      this.world.style.transform = `translate3d(0, ${ty.toFixed(2)}px, 0) rotateX(${rx.toFixed(3)}deg) scale(${sc.toFixed(5)})`;
      const on = K.ease.kanon(K.seg(b, 56.5, 57.0));
      this.persp.style.opacity = (on * (1 - collapse)).toFixed(3);
      this.persp.style.visibility = b < 56.45 ? "hidden" : "visible";
      this.refs.topItems.forEach((e, i) => K.fade(e, b, 56.875 + i * 0.125, { rise: 8 }));
      this.refs.rows.forEach((r, i) => K.fade(r.row, b, 57.0 + i * 0.125, { rise: 10 }));
      this.refs.cards.forEach((c, j) => {
        const t0 = j === 5 ? 56.625 : 56.75 + j * 0.125;
        K.fade(c.card, b, t0, { rise: 22, dur: 0.85 });
      });
      const mk = K.rect(this.refs.rows[4].marker);
      const at = K.ease.kanon(K.seg(b, 57.8, 58.3));
      const home = K.ease.inOut(K.seg(b, 61.05, 61.95));
      if (b >= 57.8) {
        const x = K.lerp(mk.left + mk.width / 2, 960, home);
        const y = K.lerp(mk.top + mk.height / 2, 540, home);
        K.dot.set({ x, y, r: K.lerp(4 * at, 7, home), op: Math.max(at, home) });
      }
    },
  });

  K.scene({
    id: "coda",
    from: 62,
    to: 80,
    mount(root) {
      const lock = K.box(root, "abs", { left: "0px", width: `${K.W}px`, top: "366px", display: "flex", justifyContent: "center", alignItems: "center", gap: "34px" });
      this.mono = monogram(lock, 72);
      const word = K.box(lock, "", { font: "400 58px Inter", letterSpacing: "0.38em", marginRight: "-0.38em", color: "var(--ink)" });
      this.word = K.split(word, COPY.coda.word);
      for (const g of this.word) K.css(g, sheenCss);
      const en = K.box(root, "abs", { left: "0px", width: `${K.W}px`, textAlign: "center", top: "512px", fontFamily: "var(--display)", fontSize: "70px", color: "var(--ink)", whiteSpace: "nowrap" });
      this.en1 = K.el(en, "span", "g", COPY.coda.en[0]);
      en.appendChild(document.createTextNode(" "));
      this.en2 = K.el(en, "span", "g", COPY.coda.en[1]);
      this.en2.style.fontStyle = "italic";
      this.period = K.el(en, "span", "", ".");
      this.period.style.visibility = "hidden";
      const zh = K.box(root, "abs t-serif", { left: "0px", width: `${K.W}px`, textAlign: "center", top: "652px", fontSize: "26px", letterSpacing: "0.34em", paddingLeft: "0.34em", boxSizing: "border-box" });
      const z1 = K.el(zh, "span", "");
      z1.style.color = "var(--ink3)";
      const z2 = K.el(zh, "span", "");
      z2.style.color = "var(--ink2)";
      this.zh = [...K.split(z1, COPY.coda.zh[0]), ...K.split(z2, COPY.coda.zh[1])];
      this.url = K.box(root, "abs t-mono", { left: "0px", width: `${K.W}px`, textAlign: "center", top: "968px", fontSize: "14px", letterSpacing: "0.3em", paddingLeft: "0.3em", boxSizing: "border-box" }, COPY.coda.url);
      this.all = root;
    },
    measure() {
      this.periodAt = K.glyphBox(this.period);
    },
    update(b) {
      const end = 1 - K.ease.exit(K.seg(b, 70.6, 71.9));
      this.all.style.opacity = end.toFixed(4);
      const [stem, arm, leg] = this.mono;
      const p1 = K.ease.kanon(K.seg(b, 62.0, 62.8));
      const p2 = K.ease.kanon(K.seg(b, 62.12, 62.95));
      const p3 = K.ease.kanon(K.seg(b, 62.5, 63.2));
      stem.style.opacity = p1;
      stem.style.transform = `translateY(${((1 - p1) * 14).toFixed(2)}px)`;
      arm.style.opacity = p2;
      arm.style.transform = `translateY(${((1 - p2) * 14).toFixed(2)}px)`;
      leg.style.opacity = p3;
      leg.style.transformBox = "fill-box";
      leg.style.transformOrigin = "0% 0%";
      leg.style.transform = `scale(${(0.55 + 0.45 * p3).toFixed(4)})`;
      K.reveal(this.word, b, 62.3, { stagger: 0.075, dur: 1.1, rise: 0.28, blur: 10 });
      const sweep = K.ease.inOutSine(K.seg(b, 63.0, 64.7));
      for (const g of this.word) g.style.backgroundPosition = `${(100 - 100 * sweep).toFixed(2)}% 0`;
      K.reveal([this.en1], b, 64.0, { dur: 1.2, rise: 0.22, blur: 9 });
      K.reveal([this.en2], b, 64.3, { dur: 1.2, rise: 0.22, blur: 9 });
      K.reveal(this.zh, b, 66.0, { stagger: 0.045, dur: 1.0, rise: 0.25, blur: 8 });
      K.fade(this.url, b, 67.9, { rise: 8, dur: 1.0 });
      const pa = this.periodAt;
      const go = K.ease.glide(K.seg(b, 62.3, 63.4));
      const fadeDot = 1 - K.ease.exit(K.seg(b, 71.2, 72.0));
      K.dot.set({ x: K.lerp(960, pa.cx, go), y: K.lerp(540, pa.cy, go), r: K.lerp(7, pa.w / 2, go), op: fadeDot });
    },
  });
})();
