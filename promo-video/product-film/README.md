# KANON · 卡农 — Product Film

A 72-second product film generated entirely by code: picture, typography, motion and score.
No footage, no stock imagery, no samples.

**Concept.** A canon is one voice answered by others until they agree. The film opens in market
noise, cuts to silence, and lets a single coral note carry the whole story: it lands as the decimal
point of ROIC, scrubs the catalyst horizon, underlines the 10-K figure, draws the reverse-DCF line,
becomes the focal cell of the 5×5 matrix, gathers four committee voices into one verdict, signs the
memo, and finally becomes the period of *Conviction, composed.*

| Beats (= seconds, 60 BPM) | Movement                                              |
| ------------------------- | ----------------------------------------------------- |
| 0–6                       | Noise → hard cut → silence                            |
| 6–14                      | One note · 在噪音里， · the five-line staff           |
| 14–22                     | 01 商业质量评估 — 生意，先于价格。 68.4%              |
| 22–30                     | 02 核心假设与催化剂 — 写下必须成立的事。              |
| 30–38                     | 03 一阶资料印证 (paper) — 每一个数字，都回到原件。    |
| 38–46                     | 04 三情景估值与赔率 — reverse DCF, 5×5 sensitivity    |
| 46–54                     | 05 纪律与备忘录 — 四种声音，一个结论。 AI 只提案…     |
| 54–62                     | 0.00× · the full workbench (Pachelbel theme quoted)   |
| 62–72                     | KANON — Conviction, composed. · kanon.hk              |

## Pipeline

```bash
node tools/fetch-fonts.mjs                          # brand fonts (OFL) + CJK subset of src/
node synth.mjs                                      # out/score.wav (48 kHz / 24-bit, −16 LUFS)
node render.mjs sheet 2                             # contact sheet for review
node render.mjs stills 17 33.5 55                   # stills at given seconds
node render.mjs video --scale 2 --sub 4 --crf 16 --out kanon-product-film-4k60
node render.mjs encode --sub 4 --width 1920 --crf 18 --out kanon-product-film-1080p60
```

- `src/timeline.js` is the single timing source (beats + a ritardando map) for both picture and
  score; `src/copy.js` holds every visible word.
- `src/engine.js` is a deterministic motion kit: every frame is a pure function of time, so frames
  can be rendered in parallel and out of order.
- `render.mjs` drives headless Chrome over `--remote-debugging-pipe` (no ports), captures four
  sub-frames per output frame (180° shutter) and lets FFmpeg blend them into motion blur, then adds
  luma grain after the blend.
- `synth.mjs` + `lib/dsp.mjs` synthesize everything from first principles: additive felt piano with
  soundboard model, PolyBLEP string ensembles, glass bells, sub, mechanical ticks, reverse swells and a
  synthetic-hall convolution reverb, mastered to −16 LUFS / −1 dBTP.

Chrome needs to run outside the Claude Code sandbox (Mach port registration). Output lands in
`out/` (git-ignored).

Fonts: Inter, Instrument Serif, JetBrains Mono, Noto Serif SC — SIL Open Font License.
Music: original composition over the Canon ground bass; the climax quotes Pachelbel (public domain).
