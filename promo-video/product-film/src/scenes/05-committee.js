// Movement V — four voices, one verdict. The human signs.
(() => {
  const { K, COPY } = window;
  const M = COPY.m5;
  const O = { x: 300, y: 625 };
  const C = { x: 1420, y: 625 };
  const YS = [430, 560, 690, 820];
  const SIGN =
    "M4 58 C18 30 34 12 44 22 C54 32 40 62 30 66 C22 70 26 54 40 48 C60 40 70 56 84 50 C98 44 100 24 110 26 C122 28 112 60 126 58 C140 56 146 34 158 36 C170 38 164 58 178 56 C194 54 200 30 214 34 C226 38 220 60 236 56 C256 50 268 40 290 42 C306 43 318 46 336 40";
  const voicePath = (y, c) => {
    const ye = K.lerp(y, C.y, c);
    const xs = K.lerp(1180, 860, c);
    return `M${O.x} ${O.y} C${O.x + 110} ${O.y} ${O.x + 150} ${y} ${O.x + 250} ${y} L${xs.toFixed(1)} ${y} C${(xs + (C.x - xs) * 0.5).toFixed(1)} ${y} ${(C.x - (C.x - xs) * 0.42).toFixed(1)} ${ye.toFixed(1)} ${C.x} ${ye.toFixed(1)}`;
  };

  K.scene({
    id: "m5",
    from: 45.7,
    to: 54,
    mount(root) {
      const hd = K.header(root, 5, COPY.steps[4]);
      K.placeLabel(hd.label, K.HEADER_Y);
      this.hdLabel = hd.label;
      const svg = K.svg(root);
      this.rule = K.stroke(svg, `M${K.ML} ${K.HEADER_Y} H${K.MR}`, "var(--hair2)");
      this.title = K.headline(root, M.title);
      this.voices = M.voices.map((v, i) => {
        const path = K.stroke(svg, voicePath(YS[i], 0), "rgba(229,227,221,0.34)");
        const role = K.box(root, "abs t-label", { left: `${O.x + 262}px`, top: `${YS[i] - 40}px`, fontSize: "16px" }, v.role);
        const line = K.box(root, "abs", {
          left: "800px",
          top: `${YS[i] - 50}px`,
          fontFamily: "var(--sans-sc)",
          fontWeight: 300,
          fontSize: "27px",
          letterSpacing: "0.02em",
          color: "var(--ink)",
          whiteSpace: "nowrap",
        });
        return { path, role, glyphs: K.split(line, v.line) };
      });
      this.verdictLine = K.stroke(svg, `M${C.x} ${C.y} H${K.MR}`, "var(--hair2)");
      this.verdict = K.box(root, "abs", { left: `${C.x + 28}px`, top: `${C.y - 56}px`, fontFamily: "var(--sans-sc)", fontSize: "28px", letterSpacing: "0.04em", color: "var(--ink)", whiteSpace: "nowrap" });
      this.verdictG = K.split(this.verdict, M.verdict);
      const cap = K.box(root, "abs t-serif", { left: `${K.ML}px`, top: "876px", fontSize: "46px" });
      this.caption = K.split(cap, M.caption);
      this.signRule = K.stroke(svg, "M1380 948 H1760", "var(--hair2)");
      this.signLabel = K.box(root, "abs t-mono", { left: "1380px", top: "962px" }, M.signLabel);
      const g = K.svgEl(svg, "g", { transform: "translate(1400 862)" });
      this.sign = K.svgEl(g, "path", { d: SIGN, fill: "none", stroke: "var(--ink)", "stroke-width": 1.7, "stroke-linecap": "round", "stroke-linejoin": "round" });
      this.signLen = this.sign.getTotalLength();
    },
    update(b) {
      const out = 53.55;
      K.fade(this.hdLabel, b, 45.85, { rise: 10, exitAt: out, exitDur: 0.4 });
      K.draw(this.rule, 1, K.ease.exit(K.seg(b, out, out + 0.4)));
      K.reveal(this.title, b, 46.3, { stagger: 0.07, dur: 1.0, exitAt: out, exitDur: 0.4 });
      const conv = K.ease.inOut(K.seg(b, 50.0, 51.3));
      const gone = K.ease.exit(K.seg(b, out, out + 0.4));
      this.voices.forEach((v, i) => {
        const e = 46 + i;
        v.path.setAttribute("d", voicePath(YS[i], conv));
        K.draw(v.path, K.ease.kanon(K.seg(b, e, e + 1.3)), gone);
        K.fade(v.role, b, e + 0.2, { rise: 8, exitAt: out, exitDur: 0.4, opacity: 1 - 0.6 * K.seg(b, 50, 50.6) });
        K.reveal(v.glyphs, b, e + 0.45, { stagger: 0.03, dur: 0.6, rise: 0.25, blur: 6, exitAt: 50.0, exitDur: 0.4 });
      });
      K.draw(this.verdictLine, K.ease.kanon(K.seg(b, 51.3, 51.85)), gone);
      K.reveal(this.verdictG, b, 51.45, { stagger: 0.05, dur: 0.7, exitAt: out, exitDur: 0.4 });
      K.reveal(this.caption, b, 52.0, { stagger: 0.06, dur: 0.9, exitAt: out, exitDur: 0.4 });
      K.draw(this.signRule, K.ease.kanon(K.seg(b, 52.3, 52.8)), gone);
      K.fade(this.signLabel, b, 52.4, { rise: 6, exitAt: out, exitDur: 0.4 });
      const ink = K.seg(b, 52.6, 53.4);
      const inkE = ink < 0.5 ? 2 * ink * ink : 1 - (-2 * ink + 2) ** 2 / 2;
      this.sign.style.strokeDasharray = `${(this.signLen * inkE).toFixed(2)} ${this.signLen + 10}`;
      this.sign.style.opacity = (ink > 0 ? 1 : 0) * (1 - gone);
      this.trackDot(b, inkE, ink);
    },
    trackDot(b, inkE, ink) {
      if (b < 46) return; // movement IV still owns the note until it reaches the origin
      const pulse = [46, 47, 48, 49].reduce((acc, e) => acc + Math.exp(-(((b - e) / 0.13) ** 2)), 0);
      let x = O.x;
      let y = O.y;
      let r = 6 * (1 + 0.28 * pulse);
      const go = K.ease.inOut(K.seg(b, 50.2, 51.3));
      x = K.lerp(x, C.x, go);
      const p0 = this.sign.getPointAtLength(0);
      const toPen = K.ease.inOut(K.seg(b, 52.15, 52.6));
      x = K.lerp(x, 1400 + p0.x, toPen);
      y = K.lerp(y, 862 + p0.y, toPen);
      r = K.lerp(r, 4, toPen);
      if (ink > 0) {
        const p = this.sign.getPointAtLength(this.signLen * inkE);
        x = 1400 + p.x;
        y = 862 + p.y;
      }
      const end = this.sign.getPointAtLength(this.signLen);
      const tail = K.ease.kanon(K.seg(b, 53.4, 53.55));
      x = K.lerp(x, 1400 + end.x + 14, tail);
      y = K.lerp(y, 862 + end.y + 2, tail);
      const x6 = K.scenes.find((s) => s.id === "m6").timesAt;
      const leap = K.ease.inOut(K.seg(b, 53.6, 54.0));
      x = K.lerp(x, x6.x, leap);
      y = K.lerp(y, x6.y, leap);
      r = K.lerp(r, x6.r, K.ease.inExpo(K.seg(b, 53.6, 54.0)));
      K.dot.set({ x, y, r, op: 1 - K.seg(b, 53.93, 54) });
    },
  });
})();
