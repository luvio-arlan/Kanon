// Movement IV — the price already holds an assumption. Then: the odds, cell by cell.
(() => {
  const { K, COPY } = window;
  const M = COPY.m4;
  const CW = 188;
  const CH = 82;
  const GX = 400;
  const GY = 420;

  K.scene({
    id: "m4",
    from: 38,
    to: 46.05,
    mount(root) {
      this.root = root;
      const hd = K.header(root, 4, COPY.steps[3]);
      K.placeLabel(hd.label, K.HEADER_Y);
      const svg0 = K.svg(root);
      K.draw(K.stroke(svg0, `M${K.ML} ${K.HEADER_Y} H${K.MR}`, "var(--hair2)"), 1);
      this.title = K.headline(root, M.title);
      // price → implied growth
      this.priceLabel = K.box(root, "abs t-label", { left: "auto", right: `${K.W - K.MR}px`, top: "556px", fontSize: "20px" }, M.price.label);
      const price = K.box(root, "abs t-num", { left: "auto", right: `${K.W - K.MR + 6}px`, top: "584px", fontSize: "190px" });
      this.price = K.roller(price, M.price.value, { from: "$904.17", laps: (o) => (o < 2 ? 1 : 0), spread: 0.3 });
      this.priceDec = this.price.statics.find((s) => s.c === ".").s;
      this.impLabel = K.box(root, "abs t-label", { left: `${K.ML}px`, top: "556px", fontSize: "20px" }, M.implied.label);
      const imp = K.box(root, "abs t-num", { left: `${K.ML - 10}px`, top: "584px", fontSize: "190px" });
      this.imp = K.roller(imp, M.implied.value, { laps: (o) => (o === 0 ? 3 : o === 1 ? 2 : 1) });
      this.impDec = K.decimalOf(this.imp);
      this.impNote = K.box(root, "abs t-mono", { left: `${K.ML}px`, top: "828px" }, M.implied.note);
      this.svg = K.svg(root);
      this.rev = K.stroke(this.svg, "M0 0 H1", "var(--coral)", 1.5);
      // 5×5 sensitivity
      this.grid = K.box(root, "abs", { left: "0px", top: "0px" });
      this.colsLabel = K.box(this.grid, "abs t-label", { left: `${GX}px`, top: `${GY - 92}px`, fontSize: "15px", color: "var(--ink3)" }, M.colsLabel);
      this.rowsLabel = K.box(this.grid, "abs t-label", { left: `${K.ML}px`, top: `${GY + 24}px`, fontSize: "15px", color: "var(--ink3)" }, M.rowsLabel);
      this.colHeads = M.cols.map((c, j) =>
        K.box(this.grid, "abs t-mono", { left: `${GX + j * CW}px`, width: `${CW}px`, textAlign: "center", top: `${GY - 40}px`, fontSize: "14px", letterSpacing: "0.06em" }, `$${c.toFixed(2)}`),
      );
      this.rowHeads = M.rows.map((r, i) =>
        K.box(this.grid, "abs t-mono", { left: `${GX - 96}px`, width: "72px", textAlign: "right", top: `${GY + i * CH + 32}px`, fontSize: "14px", letterSpacing: "0.06em" }, `${r}×`),
      );
      const vals = M.rows.map((r) => M.cols.map((c) => Math.round(r * c)));
      const flat = vals.flat();
      const lo = Math.min(...flat);
      const hi = Math.max(...flat);
      this.cells = [];
      vals.forEach((row, i) =>
        row.forEach((v, j) => {
          const a = 0.012 + 0.085 * ((v - lo) / (hi - lo));
          const cell = K.box(this.grid, "abs", {
            left: `${GX + j * CW}px`,
            top: `${GY + i * CH}px`,
            width: `${CW}px`,
            height: `${CH}px`,
            boxSizing: "border-box",
            border: "1px solid var(--hair)",
            background: `rgba(229,227,221,${a.toFixed(3)})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--mono)",
            fontSize: "22px",
            color: "var(--ink2)",
            letterSpacing: "0.02em",
          });
          cell.textContent = `$${v}`;
          this.cells.push({ cell, i, j, k: i + j, center: i === 2 && j === 2 });
        }),
      );
      this.results = M.result.map((r, n) => {
        const top = GY + n * 140 - 4;
        const label = K.box(root, "abs t-label", { left: "1444px", top: `${top}px`, fontSize: "16px" }, r.label);
        const num = K.box(root, "abs t-num", { left: "1438px", top: `${top + 24}px`, fontSize: "60px", fontWeight: 300 });
        return { label, roller: K.roller(num, r.value, { laps: () => 1 }) };
      });
    },
    update(b) {
      const titleOut = 41.85;
      K.reveal(this.title, b, 38.3, { stagger: 0.06, dur: 1.0, exitAt: titleOut, exitDur: 0.4 });
      const blockOut = 41.9;
      K.fade(this.priceLabel, b, 38.3, { exitAt: blockOut, exitDur: 0.4 });
      K.fade(this.price.el, b, 38.35, { dur: 0.3, rise: 0, exitAt: blockOut, exitDur: 0.4 });
      this.price.update(K.seg(b, 38.35, 39.35), { ease: K.ease.outCubic, blurK: 0.02 });
      K.fade(this.impLabel, b, 40.4, { exitAt: blockOut, exitDur: 0.4 });
      K.fade(this.imp.el, b, 40.5, { dur: 0.3, rise: 0, exitAt: blockOut, exitDur: 0.4 });
      this.imp.update(K.seg(b, 40.5, 41.5), { blurK: 0.016 });
      K.fade(this.impNote, b, 41.0, { exitAt: blockOut, exitDur: 0.4 });
      // geometry for the reverse line
      const pr = K.rect(this.price.el);
      const ir = K.rect(this.imp.el);
      const pd = K.glyphBox(this.priceDec);
      const mid = pd.baseline - 0.36 * 190;
      const xs = pr.left - 40;
      const xe = ir.right + 40;
      this.rev.setAttribute("d", `M${xs.toFixed(1)} ${mid.toFixed(1)} H${xe.toFixed(1)}`);
      const runP = K.ease.inOut(K.seg(b, 40.0, 40.75));
      K.draw(this.rev, runP, K.ease.inOut(K.seg(b, 41.3, 41.9)));
      // matrix
      const gridOut = K.ease.exit(K.seg(b, 45.6, 46.0));
      for (const lab of [this.colsLabel, this.rowsLabel]) K.fade(lab, b, 42.0, { rise: 8, exitAt: 45.6, exitDur: 0.4 });
      this.colHeads.forEach((h, j) => K.fade(h, b, 42.05 + j * 0.06, { rise: 6, exitAt: 45.6, exitDur: 0.4 }));
      this.rowHeads.forEach((h, i) => K.fade(h, b, 42.05 + i * 0.06, { rise: 6, exitAt: 45.6, exitDur: 0.4 }));
      for (const c of this.cells) {
        const t0 = 42.0 + c.k * 0.25;
        const p = K.ease.kanon(K.seg(b, t0, t0 + 0.55));
        c.cell.style.opacity = (p * (1 - gridOut)).toFixed(3);
        c.cell.style.transform = `scale(${(0.94 + 0.06 * p).toFixed(4)})`;
        if (c.center) {
          const lit = K.seg(b, 44.4, 44.65) * (1 - K.seg(b, 45.35, 45.55));
          c.cell.style.color = lit > 0.5 ? "#07080a" : "var(--ink2)";
          c.cell.style.fontWeight = lit > 0.5 ? 500 : 400;
        }
      }
      this.root.style.zIndex = b > 44.1 && b < 45.6 ? 55 : "";
      this.results.forEach((r, n) => {
        const t0 = 44.75 + n * 0.25;
        K.fade(r.label, b, t0, { exitAt: 45.6, exitDur: 0.4 });
        K.fade(r.roller.el, b, t0 + 0.05, { dur: 0.3, rise: 0, exitAt: 45.6, exitDur: 0.4 });
        r.roller.update(K.seg(b, t0 + 0.05, t0 + 0.85), { blurK: 0.01 });
      });
      this.trackDot(b, { xs, xe, mid });
    },
    trackDot(b, g) {
      const pg = K.scenes.find((s) => s.id === "m3").periodFinal;
      const ig = K.glyphBox(this.impDec);
      const cc = this.cells.find((c) => c.center).cell;
      const cr = K.rect(cc);
      let x = pg.cx;
      let y = pg.cy;
      let r = pg.w / 2;
      let w = null;
      let h = null;
      let radius = null;
      const a = K.ease.inOut(K.seg(b, 38.6, 39.5));
      x = K.lerp(x, g.xs, a);
      y = K.lerp(y, g.mid, a);
      r = K.lerp(r, 6, a);
      const run = K.ease.inOut(K.seg(b, 40.0, 40.75));
      x = K.lerp(x, g.xe, run);
      const seat = K.ease.inOut(K.seg(b, 40.75, 41.5));
      x = K.lerp(x, ig.cx, seat);
      y = K.lerp(y, ig.cy, seat);
      r = K.lerp(r, ig.w / 2, seat);
      const go = K.ease.glide(K.seg(b, 42.4, 44.2));
      x = K.lerp(x, cr.left + cr.width / 2, go);
      y = K.lerp(y, cr.top + cr.height / 2, go);
      r = K.lerp(r, 7, go);
      const grow = K.ease.kanon(K.seg(b, 44.2, 44.7)) * (1 - K.ease.inOut(K.seg(b, 45.35, 45.7)));
      if (grow > 0) {
        w = K.lerp(r * 2, cr.width - 2, grow);
        h = K.lerp(r * 2, cr.height - 2, grow);
        radius = K.lerp(r, 2, grow);
      }
      const leave = K.ease.inOut(K.seg(b, 45.7, 46.0));
      x = K.lerp(x, 300, leave);
      y = K.lerp(y, 625, leave);
      r = K.lerp(r, 6, leave);
      K.dot.set({ x, y, r, w, h, radius });
    },
  });
})();
