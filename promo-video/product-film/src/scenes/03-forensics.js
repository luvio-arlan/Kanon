// Movement III — every number goes back to the original filing. (paper)
(() => {
  const { K, COPY } = window;
  const ROWS = [
    ["Revenue", "$", "130,497", "$", "60,922", "$", "26,974", "top"],
    ["Cost of revenue", "", "32,639", "", "16,621", "", "11,618", ""],
    ["Gross profit", "", "97,858", "", "44,301", "", "15,356", "rule"],
    ["Operating expenses", "", "", "", "", "", "", "head"],
    ["Research and development", "", "12,914", "", "8,675", "", "7,339", "indent"],
    ["Sales, general and administrative", "", "3,491", "", "2,654", "", "2,440", "indent"],
    ["Acquisition termination cost", "", "—", "", "—", "", "1,353", "indent"],
    ["Total operating expenses", "", "16,405", "", "11,329", "", "11,132", "rule"],
    ["Operating income", "", "81,453", "", "32,972", "", "4,224", ""],
    ["Interest income", "", "1,786", "", "866", "", "267", "indent"],
    ["Interest expense", "", "(247)", "", "(257)", "", "(262)", "indent"],
    ["Other, net", "", "1,034", "", "237", "", "(48)", "indent"],
    ["Other income (expense), net", "", "2,573", "", "846", "", "(43)", "rule"],
    ["Income before income tax", "", "84,026", "", "33,818", "", "4,181", ""],
    ["Income tax expense (benefit)", "", "11,146", "", "4,058", "", "(187)", "rule"],
    ["Net income", "$", "72,880", "$", "29,760", "$", "4,368", "double"],
  ];
  const PROSE =
    "The accompanying notes are an integral part of these consolidated financial statements. Revenue is recognized when control of the promised goods or services is transferred to customers, in an amount that reflects the consideration expected to be received in exchange for those goods or services. Product revenue is recognized upon the transfer of control, generally at the time of shipment. Estimates are evaluated on an ongoing basis and are based on historical experience and on various other assumptions believed to be reasonable under the circumstances. ";

  const sheetCss = {
    left: "40px",
    top: "372px",
    width: "1260px",
    padding: "78px 104px 120px",
    boxSizing: "border-box",
    background: "var(--p-sheet)",
    color: "#1b1b1d",
    fontFamily: "var(--filing)",
    boxShadow: "0 60px 140px rgba(17,17,19,0.10), 0 6px 18px rgba(17,17,19,0.05)",
    transformOrigin: "50% 30%",
    whiteSpace: "normal",
  };

  function buildSheet(sheet, refs) {
    const para = (text, css) =>
      K.box(sheet, "", Object.assign({ fontSize: "15px", lineHeight: "1.62", textAlign: "justify", color: "#3a3a3e" }, css), text);
    para(PROSE.repeat(2), { marginBottom: "34px" });
    K.box(sheet, "", { fontSize: "21px", fontWeight: 700, textAlign: "center", letterSpacing: "0.02em" }, "CONSOLIDATED STATEMENTS OF INCOME");
    K.box(sheet, "", { fontSize: "15px", textAlign: "center", margin: "6px 0 26px", color: "#3a3a3e" }, "(In millions, except per share data)");
    const grid = K.box(sheet, "", { display: "grid", gridTemplateColumns: "1fr 22px 132px 34px 22px 132px 34px 22px 132px", fontSize: "18px", rowGap: "0px" });
    const head = ["Year Ended", "", "Jan 26, 2025", "", "", "Jan 28, 2024", "", "", "Jan 29, 2023"];
    head.forEach((h, i) => {
      K.box(grid, "", { fontWeight: 700, fontSize: "15px", textAlign: i ? "right" : "left", padding: "0 0 8px", borderBottom: i && h ? "1px solid #1b1b1d" : "none", gridColumn: i === 2 || i === 5 || i === 8 ? "span 1" : "" }, h);
    });
    for (const r of ROWS) {
      const kind = r[7];
      const cells = [r[0], r[1], r[2], "", r[3], r[4], "", r[5], r[6]];
      cells.forEach((c, i) => {
        const css = { padding: "7px 0 6px", textAlign: i === 0 ? "left" : "right", whiteSpace: "nowrap", position: "relative" };
        if (i === 0 && kind === "indent") css.paddingLeft = "22px";
        if (i === 0 && kind === "head") css.fontStyle = "italic";
        if ((kind === "rule" || kind === "double") && (i === 2 || i === 5 || i === 8)) css.borderBottom = kind === "double" ? "3px double #1b1b1d" : "1px solid #1b1b1d";
        const cell = K.box(grid, "", css);
        if (r === ROWS[0] && i === 2) {
          refs.src = K.el(cell, "span", "", c);
          refs.under = K.box(cell, "abs", { left: "auto", right: "0px", top: "auto", bottom: "1px", height: "3px", background: "var(--p-coral)", transformOrigin: "0 50%" });
        } else cell.textContent = c;
      });
    }
    para(PROSE.repeat(3), { marginTop: "40px" });
  }

  K.scene({
    id: "m3",
    from: 30,
    to: 38,
    mount(root) {
      root.classList.add("paper");
      const hd = K.header(root, 3, COPY.steps[2], true);
      K.placeLabel(hd.label, K.HEADER_Y);
      const svg0 = K.svg(root);
      const rule = K.stroke(svg0, `M${K.ML} ${K.HEADER_Y} H${K.MR}`, "var(--p-hair2)");
      K.draw(rule, 1);
      this.persp = K.box(root, "abs", { width: `${K.W}px`, height: `${K.H}px`, perspective: "2300px", perspectiveOrigin: "960px 260px" });
      this.sheet = K.box(this.persp, "abs", sheetCss);
      this.refs = {};
      buildSheet(this.sheet, this.refs);
      this.title = K.headline(root, COPY.m3.title);
      for (const s of this.title) s.style.color = "var(--p-ink)";
      // lifted number + its trace
      this.svg = K.svg(root);
      this.leader = K.stroke(this.svg, "M0 0 L1 1", "var(--p-coral)", 1.5);
      this.hero = K.box(root, "abs t-num", { left: "auto", right: `${K.W - K.MR}px`, top: "392px", fontSize: "210px", color: "var(--p-ink)", transformOrigin: "0 0" }, "130,497");
      this.tag = K.box(root, "abs t-mono", { left: "auto", right: `${K.W - K.MR}px`, top: "404px", fontSize: "16px", color: "var(--p-ink2)" }, COPY.m3.tag);
      this.src = K.box(root, "abs t-mono", { left: "auto", right: `${K.W - K.MR}px`, top: "636px" }, COPY.m3.source);
      this.ok = K.box(root, "abs t-label", { left: "auto", right: `${K.W - K.MR}px`, top: "668px", fontSize: "16px" }, `✓  ${COPY.m3.verified}`);
      // redline
      const red = K.box(root, "abs", { left: `${K.ML}px`, top: "560px", fontFamily: "var(--filing)", color: "var(--p-ink)" });
      this.redLabel = K.box(red, "t-mono", { fontSize: "13px", marginBottom: "34px" }, COPY.m3.redlineLabel);
      const s = COPY.m3.sentence;
      const l1 = K.box(red, "", { fontSize: "60px", lineHeight: "1.5", whiteSpace: "nowrap" });
      this.w1 = K.split(l1, s[0], "word");
      const l2 = K.box(red, "", { fontSize: "60px", lineHeight: "1.5", whiteSpace: "nowrap", position: "relative" });
      this.struck = K.el(l2, "span", "", s[1]);
      this.struck.style.position = "relative";
      this.strike = K.box(this.struck, "abs", { left: "0px", top: "56%", width: "100%", height: "2.5px", background: "var(--p-ink)", transformOrigin: "0 50%" });
      this.y1 = K.box(this.struck, "abs t-mono", { top: "-6px", fontSize: "12px" }, "FY2024");
      l2.appendChild(document.createTextNode(" "));
      this.ins = K.el(l2, "span", "", "");
      this.ins.style.position = "relative";
      this.insChars = Array.from(s[2]).map((c) => K.el(this.ins, "span", "", c));
      this.insLine = K.box(this.ins, "abs", { left: "0px", top: "auto", bottom: "6px", height: "3px", width: "100%", background: "var(--p-coral)", transformOrigin: "0 50%" });
      this.y2 = K.box(this.ins, "abs t-mono", { top: "-6px", fontSize: "12px" }, "FY2025");
      this.period = K.el(l2, "span", "", ".");
      this.period.style.visibility = "hidden";
      this.redWrap = red;
    },
    measure() {
      this.periodFinal = K.glyphBox(this.period);
    },
    update(b) {
      K.setBg("paper");
      const glide = K.ease.inOutSine(K.seg(b, 30, 38));
      const rx = 37 - 3 * glide;
      const rz = -5.5 + 1.5 * glide;
      const tx = 30 - 110 * glide;
      const ty = 0 - 46 * glide;
      const focus = K.ease.inOut(K.seg(b, 32.1, 33.0));
      const away = K.ease.inOut(K.seg(b, 34, 34.6));
      const dim = focus * 0.46 + away * 0.3;
      const blur = focus * 3.2 + away * 3.6;
      K.css(this.sheet, {
        transform: `translate3d(${tx}px, ${ty}px, 0) rotateX(${rx}deg) rotateZ(${rz}deg)`,
        opacity: (1 - dim).toFixed(3),
        filter: blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : "none",
      });
      K.reveal(this.title, b, 30.3, { stagger: 0.06, dur: 1.0 });
      // highlight the source figure
      const under = K.ease.kanon(K.seg(b, 31.5, 32.0));
      this.refs.under.style.width = `${this.refs.src.offsetWidth}px`;
      this.refs.under.style.transform = `scaleX(${under.toFixed(4)})`;
      this.refs.src.style.opacity = (1 - 0.6 * K.ease.inOut(K.seg(b, 32.1, 32.7))).toFixed(3);
      // lift: the figure leaves the page and becomes the subject
      const sr = K.rect(this.refs.src);
      const sg = K.glyphBox(this.refs.src);
      this.hero.style.transform = "none";
      const hr = K.rect(this.hero);
      const hg = K.glyphBox(this.hero);
      this.hero.style.transformOrigin = `${(hg.cx - hr.left).toFixed(2)}px ${(hg.cy - hr.top).toFixed(2)}px`;
      const lift = K.ease.glide(K.seg(b, 32.0, 33.0));
      const out1 = K.ease.exit(K.seg(b, 34, 34.4));
      const s0 = sg.h / hg.h;
      const k = 1 - lift;
      this.hero.style.transform = `translate(${((sg.cx - hg.cx) * k).toFixed(2)}px, ${((sg.cy - hg.cy) * k).toFixed(2)}px) rotate(${(-7.4 * k).toFixed(3)}deg) scale(${K.lerp(s0, 1, lift).toFixed(4)})`;
      this.hero.style.opacity = (K.ease.kanon(K.seg(b, 32.0, 32.25)) * (1 - out1)).toFixed(3);
      K.fade(this.tag, b, 33.0, { exitAt: 34, exitDur: 0.35 });
      K.fade(this.src, b, 33.15, { exitAt: 34, exitDur: 0.35 });
      K.fade(this.ok, b, 33.3, { exitAt: 34, exitDur: 0.35 });
      const cur = K.rect(this.hero);
      const fx = cur.left - 34;
      const fy = cur.top + (hg.cy - hr.top) * (cur.height / hr.height);
      const ax = sr.right + 12;
      const ay = sg.cy;
      this.leader.setAttribute("d", `M${ax.toFixed(1)} ${ay.toFixed(1)} C${(ax + 140).toFixed(1)} ${ay.toFixed(1)}, ${(fx - 180).toFixed(1)} ${fy.toFixed(1)}, ${fx.toFixed(1)} ${fy.toFixed(1)}`);
      const lead = K.ease.inOut(K.seg(b, 32.5, 33.0));
      K.draw(this.leader, lead, out1);
      this.lead = { ax, ay, fx, fy, lead };
      // redline
      K.fade(this.redLabel, b, 34.45, { rise: 8 });
      K.reveal(this.w1, b, 34.55, { stagger: 0.08, dur: 0.8, rise: 0.2, blur: 6 });
      K.fade(this.struck, b, 34.85, { rise: 10 });
      this.strike.style.transform = `scaleX(${K.ease.inOut(K.seg(b, 35.25, 35.75)).toFixed(4)})`;
      this.struck.style.color = K.seg(b, 35.5, 36) > 0.5 ? "var(--p-ink3)" : "var(--p-ink)";
      this.y1.style.opacity = K.ease.kanon(K.seg(b, 35.25, 35.75)).toFixed(3);
      const typed = K.seg(b, 36.0, 36.75) * this.insChars.length;
      this.insChars.forEach((c, i) => {
        c.style.opacity = K.clamp(typed - i).toFixed(3);
      });
      this.insLine.style.transform = `scaleX(${K.clamp(typed / this.insChars.length).toFixed(4)})`;
      this.y2.style.opacity = K.ease.kanon(K.seg(b, 36.0, 36.5)).toFixed(3);
      // the note: playhead → source → along the trace → the period of a changed sentence
      this.trackDot(b, typed);
    },
    trackDot(b, typed) {
      const ur = K.rect(this.refs.under);
      const { ax, ay, fx, fy } = this.lead;
      const start = { x: 160 + (78 / 90) * 1600, y: 905, r: 6.5 };
      const p1 = K.ease.inOut(K.seg(b, 30.85, 31.5));
      let x = K.lerp(start.x, ur.left, p1);
      let y = K.lerp(start.y, ur.top + ur.height / 2, p1);
      let r = K.lerp(start.r, 4, p1);
      if (b >= 31.5) {
        x = Math.max(ur.left, ur.right);
        y = ur.top + ur.height / 2;
      }
      if (b >= 32.35) {
        const p0 = K.ease.inOut(K.seg(b, 32.35, 32.5));
        x = K.lerp(x, ax, p0);
        y = K.lerp(y, ay, p0);
      }
      if (b >= 32.5) {
        const t = K.ease.inOut(K.seg(b, 32.5, 33.0));
        const u = 1 - t;
        // follow the cubic leader exactly
        const c1x = ax + 140;
        const c2x = fx - 180;
        x = u * u * u * ax + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * fx;
        y = u * u * u * ay + 3 * u * u * t * ay + 3 * u * t * t * fy + t * t * t * fy;
        r = K.lerp(4, 6, t);
      }
      if (b >= 34) {
        const pg = K.glyphBox(this.period);
        const lastR = K.rect(this.insChars[this.insChars.length - 1]);
        const off = pg.cx - lastR.right;
        const k = Math.max(0, Math.min(this.insChars.length - 1, Math.ceil(typed) - 1));
        const caretX = typed <= 0.001 ? K.rect(this.insChars[0]).left + 2 : K.rect(this.insChars[k]).right + off;
        const p3 = K.ease.inOut(K.seg(b, 34.2, 35.9));
        x = K.lerp(fx, caretX, p3);
        y = K.lerp(fy, pg.cy, p3);
        r = K.lerp(6, pg.w / 2, p3);
      }
      K.dot.set({ x, y, r });
    },
  });
})();
