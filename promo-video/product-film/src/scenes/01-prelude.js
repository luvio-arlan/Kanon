// One note in the silence → the staff → five steps.
(() => {
  const { K, COPY } = window;
  const STAFF_Y = [428, 484, 540, 596, 652];
  const HEADER_Y = 150;

  // A chapter header: hairline + "0N  name" label. Shared by every movement.
  K.header = (root, num, name, paper) => {
    const wrap = K.box(root, `abs${paper ? " paper" : ""}`);
    const label = K.box(wrap, "abs", { display: "flex", alignItems: "baseline", gap: "18px" });
    K.el(label, "span", "hd-num", String(num).padStart(2, "0"));
    K.el(label, "span", "hd-name", name);
    return { wrap, label };
  };
  K.placeLabel = (label, y) => {
    label.style.left = `${K.ML}px`;
    label.style.top = `${y - 34}px`;
  };

  K.scene({
    id: "prelude",
    from: 6,
    to: 10.4,
    mount(root) {
      const svg = K.svg(root);
      this.rings = [6, 7, 8, 9].map(() =>
        K.svgEl(svg, "circle", { cx: 960, cy: 540, r: 7, fill: "none", stroke: "#f3f1eb", "stroke-width": 1 }),
      );
      const line = K.box(root, "abs t-serif", {
        left: "0px",
        width: `${K.W}px`,
        top: "604px",
        textAlign: "center",
        fontSize: "42px",
        letterSpacing: "0.42em",
        paddingLeft: "0.42em",
        boxSizing: "border-box",
        color: "var(--ink)",
      });
      this.glyphs = K.split(line, COPY.prelude);
    },
    update(b) {
      this.rings.forEach((c, i) => {
        const s = 6 + i;
        const p = K.seg(b, s, s + 2.8);
        const on = b >= s ? 1 : 0;
        c.setAttribute("r", (7 + 210 * K.ease.outCubic(p)).toFixed(2));
        c.style.opacity = (on * 0.2 * (1 - p) ** 1.7 * (i === 0 ? 1.2 : 1)).toFixed(4);
      });
      K.reveal(this.glyphs, b, 6.6, {
        stagger: 0.13,
        dur: 1.4,
        rise: 0.22,
        blur: 12,
        exitAt: 9.5,
        exitDur: 0.6,
      });
      const pop = K.spring(K.seg(b, 6, 7.4) * 1.4, 1.6, 0.5);
      K.dot.set({ x: 960, y: 540, r: 7 * pop, glow: 1 - K.seg(b, 6, 7.2) });
    },
  });

  K.scene({
    id: "staff",
    from: 10,
    to: 14,
    mount(root) {
      const svg = K.svg(root);
      this.halves = STAFF_Y.map(() => [
        K.stroke(svg, "M960 0 H160", "var(--hair2)"),
        K.stroke(svg, "M960 0 H1760", "var(--hair2)"),
      ]);
      this.labels = COPY.steps.map((name, i) => K.header(root, i + 1, name).label);
    },
    update(b) {
      const lift = K.ease.inOut(K.seg(b, 13, 14));
      const y0 = K.lerp(STAFF_Y[0], HEADER_Y, lift);
      const starts = [10.8, 10.4, 10.0, 10.4, 10.8];
      this.halves.forEach(([l, r], i) => {
        const y = i === 0 ? y0 : STAFF_Y[i];
        l.setAttribute("d", `M960 ${y} H160`);
        r.setAttribute("d", `M960 ${y} H1760`);
        const p = K.ease.kanon(K.seg(b, starts[i], starts[i] + 1.15));
        const out = i === 0 ? 0 : K.ease.inOut(K.seg(b, 12.95 + Math.abs(i - 2.5) * 0.05, 13.55 + Math.abs(i - 2.5) * 0.05));
        K.draw(l, p * (1 - out));
        K.draw(r, p * (1 - out));
      });
      this.labels.forEach((lab, i) => {
        const y = i === 0 ? y0 : STAFF_Y[i];
        K.placeLabel(lab, y);
        K.fade(lab, b, 11.25 + i * 0.25, {
          dur: 0.9,
          rise: 10,
          exitAt: i === 0 ? 99 : 12.95 + (i - 1) * 0.05,
          exitDur: 0.35,
          exitRise: 8,
        });
      });
      const move = K.ease.inOut(K.seg(b, 11.9, 12.8));
      K.dot.set({ x: K.lerp(960, K.ML, move), y: K.lerp(540, STAFF_Y[0], move) + (y0 - STAFF_Y[0]), r: K.lerp(7, 5, move) });
    },
  });

  // Header that persists across movements I and II: the staff line becomes the page rule.
  K.scene({
    id: "chrome12",
    from: 14,
    to: 30,
    mount(root) {
      const svg = K.svg(root);
      this.rule = K.stroke(svg, `M${K.ML} ${HEADER_Y} H${K.MR}`, "var(--hair2)");
      K.draw(this.rule, 1);
      this.h1 = K.header(root, 1, COPY.steps[0]).label;
      this.h2 = K.header(root, 2, COPY.steps[1]).label;
      K.placeLabel(this.h1, HEADER_Y);
      K.placeLabel(this.h2, HEADER_Y);
    },
    update(b) {
      K.fade(this.h1, b, 0, { dur: 0.01, rise: 0, exitAt: 21.55, exitDur: 0.35, exitRise: -8 });
      K.fade(this.h2, b, 21.85, { dur: 0.8, rise: 10 });
    },
  });

  K.STAFF_Y = STAFF_Y;
  K.HEADER_Y = HEADER_Y;
})();
