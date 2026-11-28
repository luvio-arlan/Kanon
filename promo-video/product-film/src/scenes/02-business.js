// Movement I — business quality. Movement II — what must be true, and when we will know.
(() => {
  const { K, COPY } = window;
  const HY = () => K.HEADER_Y;

  const headline = (root, text, top = 236, size = 76) => {
    const el = K.box(root, "abs t-serif", { left: `${K.ML}px`, top: `${top}px`, fontSize: `${size}px` });
    return K.split(el, text);
  };
  K.headline = headline;

  // Hide a roller's decimal point; the protagonist will sit there instead.
  K.decimalOf = (roller) => {
    const d = roller.statics.find((s) => s.c === ".");
    if (d) d.s.style.visibility = "hidden";
    return d ? d.s : null;
  };

  K.scene({
    id: "m1",
    from: 14,
    to: 22,
    mount(root) {
      this.layer = K.box(root, "layer");
      const L = this.layer;
      this.title = headline(L, COPY.m1.title);
      this.heroLabel = K.box(L, "abs t-label", { left: `${K.ML}px`, top: "560px", fontSize: "20px" }, COPY.m1.hero.label);
      const hero = K.box(L, "abs t-num", { left: `${K.ML - 14}px`, top: "586px", fontSize: "300px" });
      this.hero = K.roller(hero, COPY.m1.hero.value, { laps: (o) => (o === 0 ? 3 : o === 1 ? 2 : 1) });
      this.decimal = K.decimalOf(this.hero);
      this.pct = this.hero.statics.find((s) => s.c === "%").s;
      const svg = K.svg(L);
      this.divider = K.stroke(svg, "M1176 600 V872", "var(--hair2)");
      this.side = COPY.m1.side.map((m, i) => {
        const top = i === 0 ? 600 : 744;
        const label = K.box(L, "abs t-label", { left: "1236px", top: `${top}px` }, m.label);
        const num = K.box(L, "abs t-num", { left: "1228px", top: `${top + 24}px`, fontSize: "88px", fontWeight: 300 });
        return { label, roller: K.roller(num, m.value, { laps: (o) => (o === 0 ? 2 : 1) }) };
      });
    },
    update(b) {
      const push = K.ease.inOutSine(K.seg(b, 14, 22.2));
      this.layer.style.transform = `scale(${(1 + 0.022 * push).toFixed(5)})`;
      const exitAt = 21.45;
      K.reveal(this.title, b, 14.2, { stagger: 0.07, dur: 1.05, exitAt, exitDur: 0.45 });
      K.fade(this.heroLabel, b, 15.05, { exitAt, exitDur: 0.4 });
      const heroWrap = this.hero.el;
      K.fade(heroWrap, b, 15.3, { dur: 0.5, rise: 0, exitAt, exitDur: 0.45, exitRise: -16 });
      this.hero.update(K.seg(b, 15.3, 17.0), { ease: K.ease.outQuart, blurK: 0.016 });
      this.pct.style.opacity = K.ease.kanon(K.seg(b, 15.6, 16.4)).toFixed(4);
      K.draw(this.divider, K.ease.kanon(K.seg(b, 17.2, 18.1)), K.ease.exit(K.seg(b, exitAt, exitAt + 0.4)));
      this.side.forEach((s, i) => {
        const t0 = 17.45 + i * 0.75;
        K.fade(s.label, b, t0, { exitAt, exitDur: 0.4 });
        K.fade(s.roller.el, b, t0 + 0.05, { dur: 0.4, rise: 0, exitAt, exitDur: 0.4 });
        s.roller.update(K.seg(b, t0 + 0.05, t0 + 1.05), { blurK: 0.01 });
      });
      // the note travels into the decimal point as the number lands
      const g = K.glyphBox(this.decimal);
      const home = { x: K.ML, y: HY(), r: 5 };
      const seat = { x: g.cx, y: g.cy, r: g.w / 2 };
      const inP = K.ease.inOut(K.seg(b, 16.15, 17.0));
      const outP = K.ease.inOut(K.seg(b, 21.4, 22.0));
      const p = inP * (1 - outP);
      const arc = Math.sin(Math.PI * (b < 19 ? inP : outP)) * -60;
      K.dot.set({ x: K.lerp(home.x, seat.x, p), y: K.lerp(home.y, seat.y, p) + arc * (b < 19 ? 1 : 0.4), r: K.lerp(home.r, seat.r, p) });
    },
  });

  K.scene({
    id: "m2",
    from: 22,
    to: 30,
    mount(root) {
      const L = K.box(root, "layer");
      this.title = headline(L, COPY.m2.title);
      const svg = K.svg(L);
      this.rowTops = [452, 548, 644];
      this.rows = COPY.m2.hyps.map((h, i) => {
        const top = this.rowTops[i];
        const line = K.stroke(svg, `M${K.ML} ${top} H${K.MR}`, "var(--hair)");
        const id = K.box(L, "abs t-mono", { left: `${K.ML}px`, top: `${top + 38}px`, fontSize: "14px" }, h.id);
        const text = K.box(L, "abs", {
          left: "236px",
          top: `${top + 25}px`,
          fontFamily: "var(--sans-sc)",
          fontWeight: 300,
          fontSize: "31px",
          letterSpacing: "0.02em",
          color: "var(--ink)",
          whiteSpace: "nowrap",
        });
        const glyphs = K.split(text, h.text);
        const last = i === 2;
        const note = K.box(
          L,
          last ? "abs t-label" : "abs t-mono",
          { right: `${K.W - K.MR}px`, left: "auto", top: `${top + (last ? 34 : 39)}px`, color: last ? "var(--ink)" : "" },
          h.note,
        );
        return { line, id, glyphs, note };
      });
      this.closer = K.stroke(svg, `M${K.ML} 740 H${K.MR}`, "var(--hair)");
      // 90-day catalyst horizon
      this.tlY = 905;
      this.tl = K.stroke(svg, `M${K.ML} ${this.tlY} H${K.MR}`, "var(--hair2)");
      this.tlDone = K.stroke(svg, `M${K.ML} ${this.tlY} H${K.MR}`, "rgba(243,241,235,0.55)");
      this.ticks = [];
      for (let d = 10; d < 90; d += 10) {
        const x = K.ML + (d / 90) * (K.MR - K.ML);
        this.ticks.push(K.svgEl(svg, "line", { x1: x, x2: x, y1: this.tlY - 4, y2: this.tlY + 4, stroke: "var(--hair2)", "stroke-width": 1 }));
      }
      this.h0 = K.box(L, "abs t-mono", { left: `${K.ML}px`, top: `${this.tlY + 22}px` }, COPY.m2.horizon[0]);
      this.h1 = K.box(L, "abs t-mono", { right: `${K.W - K.MR}px`, left: "auto", top: `${this.tlY + 22}px` }, COPY.m2.horizon[1]);
      this.events = COPY.m2.events.map((e) => {
        const x = K.ML + (e.day / 90) * (K.MR - K.ML);
        const dot = K.svgEl(svg, "circle", { cx: x, cy: this.tlY, r: 3.5, fill: "var(--ink2)" });
        const label = K.box(L, "abs t-label", { left: `${x}px`, top: `${this.tlY - 52}px`, fontSize: "16px", transform: "translateX(-50%)" });
        const inner = K.el(label, "span", "", e.text);
        return { x, dot, label, inner };
      });
    },
    update(b) {
      K.reveal(this.title, b, 22.3, { stagger: 0.07, dur: 1.05 });
      this.rows.forEach((r, i) => {
        const t0 = 24 + i * 0.7;
        K.draw(r.line, K.ease.kanon(K.seg(b, t0, t0 + 0.9)));
        K.fade(r.id, b, t0 + 0.12, { rise: 8 });
        K.reveal(r.glyphs, b, t0 + 0.15, { stagger: 0.025, dur: 0.7, rise: 0.25, blur: 6 });
        K.fade(r.note, b, i === 2 ? 26.2 : t0 + 0.45, { rise: 8 });
      });
      K.draw(this.closer, K.ease.kanon(K.seg(b, 25.4, 26.3)));
      K.draw(this.tl, K.ease.kanon(K.seg(b, 27, 27.7)));
      this.ticks.forEach((tk, i) => {
        tk.style.opacity = K.ease.kanon(K.seg(b, 27.15 + i * 0.03, 27.6 + i * 0.03)).toFixed(3);
      });
      K.fade(this.h0, b, 27.2, { rise: 6 });
      K.fade(this.h1, b, 27.35, { rise: 6 });
      // the note: header → H3's exit condition → the playhead of the horizon
      const noteR = K.rect(this.rows[2].note);
      const bullet = { x: noteR.left - 20, y: noteR.top + noteR.height / 2 };
      const toBullet = K.ease.inOut(K.seg(b, 25.55, 26.2));
      const toLine = K.ease.inOut(K.seg(b, 27.0, 27.45));
      const scrub = K.ease.glide(K.seg(b, 27.45, 29.75));
      const px = K.ML + (78 / 90) * (K.MR - K.ML) * scrub;
      let x = K.lerp(K.ML, bullet.x, toBullet);
      let y = K.lerp(HY(), bullet.y, toBullet);
      x = K.lerp(x, px, toLine);
      y = K.lerp(y, this.tlY, toLine);
      K.dot.set({ x, y, r: 5 + toLine * 1.5 - toBullet * (1 - toLine) * 0.5 });
      K.draw(this.tlDone, toLine * scrub * (78 / 90));
      this.events.forEach((e, i) => {
        K.fade(e.label, b, 27.3 + i * 0.12, { rise: 6 });
        e.label.style.transform += " translateX(-50%)";
        const d = (px - e.x) / 46;
        const pulse = toLine * Math.exp(-d * d);
        const passed = toLine * K.clamp((px - e.x + 30) / 60);
        e.dot.setAttribute("r", (3.5 + 3.5 * pulse).toFixed(2));
        e.dot.setAttribute("fill", passed > 0.5 ? "var(--ink)" : "var(--ink3)");
        e.inner.style.color = `rgba(243,241,235,${(0.62 + 0.38 * passed).toFixed(3)})`;
        const show = K.ease.kanon(K.seg(b, 27.3 + i * 0.12, 27.9 + i * 0.12));
        e.dot.style.opacity = (show * (i === 2 ? 1 - K.seg(px, e.x - 12, e.x) : 1)).toFixed(3);
      });
    },
  });
})();
