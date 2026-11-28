// KANON score — an original canon over the D–A–Bm–F#m–G–D–G–A ground, synthesized from first principles.
// The climax quotes Pachelbel's Canon theme (public domain). Timing is read from src/timeline.js.
import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import * as D from "./lib/dsp.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "out");
mkdirSync(out, { recursive: true });
const ctx = {};
vm.runInNewContext(readFileSync(join(here, "src", "timeline.js"), "utf8"), ctx);
const { TL } = ctx;
const T = (b) => TL.time(b);
const LEN = TL.duration + 0.05;
const log = (s) => process.stdout.write(`${s}\n`);

// ---------------------------------------------------------------- harmony
const CH = ["D", "A", "Bm", "F#m", "G", "D", "G", "A"];
const ci = (b) => (((Math.floor(b + 1e-6) - 6) % 8) + 8) % 8;
const TONES = { D: [62, 66, 69], A: [61, 64, 69], Bm: [62, 66, 71], "F#m": [61, 66, 69], G: [62, 67, 71] };
const PCS = { D: [2, 6, 9], A: [9, 1, 4], Bm: [11, 2, 6], "F#m": [6, 9, 1], G: [7, 11, 2] };
const BASS_LO = [38, 33, 35, 30, 31, 26, 31, 33];
const PAD = [
  [57, 62, 66, 69],
  [57, 61, 64, 69],
  [59, 62, 66, 71],
  [57, 61, 66, 69],
  [59, 62, 67, 71],
  [57, 62, 66, 69],
  [59, 62, 67, 71],
  [57, 61, 64, 69],
];
const V1_A = [66, 69, 71, 73, 74, 69, 71, 73];
const V1_B = [74, 76, 78, 73, 74, 78, 79, 76];
const THEME = [78, 76, 74, 73, 71, 69, 71, 73];
const chordAbove = (b, lo, k) => {
  const pcs = PCS[CH[ci(b)]];
  const list = [];
  for (let m = lo; m < lo + 36; m++) if (pcs.includes(m % 12)) list.push(m);
  return list[k];
};
const curve = (pts) => (t) => {
  const tb = TL.beat(t);
  if (tb <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (tb <= pts[i][0]) {
      const u = (tb - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]);
      return pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u;
    }
  }
  return pts[pts.length - 1][1];
};
const at = (pts, b) => curve(pts)(T(b));

// ---------------------------------------------------------------- buses
const piano = D.bus(LEN);
const pad = D.bus(LEN);
const voices = D.bus(LEN);
const low = D.bus(LEN);
const bells = D.bus(LEN);
const sfx = D.bus(LEN);
const pre = D.bus(LEN);

// ---------------------------------------------------------------- ground bass + sub
const BASS_VEL = [
  [6, 0.34],
  [14, 0.41],
  [22, 0.47],
  [30, 0.37],
  [38, 0.53],
  [46, 0.56],
  [51.5, 0.6],
  [52, 0.36],
  [54, 0.72],
  [61, 0.64],
];
const subNotes = [];
for (let b = 6; b < 62; b++) {
  const c = ci(b);
  const accent = (b - 6) % 4 === 0 ? 0.05 : 0;
  const v = at(BASS_VEL, b) + accent;
  const dur = T(b + 1) - T(b) + 0.05;
  D.piano(piano, T(b), dur, BASS_LO[c], v, { gain: 0.56, release: 0.18 });
  D.piano(piano, T(b) + 0.004, dur, BASS_LO[c] + 12, v * 0.72, { release: 0.18 });
  subNotes.push({ t0: T(b), t1: T(b + 1), midi: BASS_LO[c] });
}
subNotes.push({ t0: T(62), t1: T(69), midi: 26 });
D.sub(low, subNotes, curve([
  [6, 0.024],
  [14, 0.03],
  [30, 0.027],
  [38, 0.042],
  [46, 0.046],
  [52, 0.03],
  [54, 0.06],
  [62, 0.06],
  [66, 0.034],
  [70, 0],
]));

// ---------------------------------------------------------------- ensemble strings (pad)
for (let v = 0; v < 4; v++) {
  const notes = [];
  for (let b = 14; b < 62; b++) {
    if (b >= 46 && b < 54) continue;
    const m = PAD[ci(b)][v];
    const last = notes[notes.length - 1];
    if (last && last.midi === m && Math.abs(last.t1 - T(b)) < 1e-6) last.t1 = T(b + 1);
    else notes.push({ t0: T(b), t1: T(b + 1), midi: m });
  }
  notes.push({ t0: T(62), t1: T(70.5), midi: PAD[0][v] });
  D.strings(pad, notes, curve([
    [14, 0],
    [15.6, 0.42],
    [22, 0.52],
    [29.6, 0.6],
    [30.2, 0.18],
    [37.4, 0.24],
    [38.2, 0.52],
    [45.6, 0.72],
    [54, 0.92],
    [60, 0.86],
    [62, 0.84],
    [66, 0.5],
    [70.4, 0],
  ]), { seed: v + 1, pan: (v - 1.5) * 0.18, level: 0.055, attack: 0.5, release: 1.8, bright: 3.6 });
}

// four voices of the committee: cello → viola → violin II → violin I, entering one beat apart
const OCT = [-12, 0, 0, 12];
for (let v = 0; v < 4; v++) {
  const e = 46 + v;
  const notes = [];
  for (let b = e; b < 54; b++) notes.push({ t0: T(b), t1: T(b + 1), midi: PAD[ci(b)][v] + OCT[v] });
  D.strings(voices, notes, curve([
    [e, 0],
    [e + 0.35, 0.72],
    [50, 0.78],
    [51.3, 0.95],
    [52.1, 0.36],
    [53.5, 0.34],
    [54, 0],
  ]), { seed: 40 + v, pan: (v - 1.5) * 0.3, level: 0.07, attack: 0.18, release: 0.9, bright: 4.4, vib: 0.0045, voices: 5, detune: 8 });
}
// the theme sung by the violins at the climax
{
  const notes = THEME.map((m, i) => ({ t0: T(54 + i), t1: T(55 + i), midi: m }));
  notes.push({ t0: T(62), t1: T(67), midi: 74 });
  D.strings(voices, notes, curve([
    [54, 0],
    [54.25, 0.85],
    [61.5, 0.9],
    [62.5, 0.7],
    [66.5, 0],
  ]), { seed: 77, pan: 0.1, level: 0.075, attack: 0.12, release: 1.4, bright: 4.2, vib: 0.005, voices: 6, detune: 7 });
}

// ---------------------------------------------------------------- piano voices
const play = (b, m, v, dur = 1.02, o = {}) => D.piano(piano, T(b), T(b + dur) - T(b), m, v, o);
for (let i = 0; i < 8; i++) play(14 + i, V1_A[i], 0.3);
for (let i = 0; i < 8; i++) play(22 + i, V1_B[i], 0.27);
// canon: the first line answered two beats later, an octave up
for (let b = 22; b < 30; b++) play(b, V1_A[(b - 24 + 16) % 8] + 12, 0.15, 1.0, { bright: 1.3 });
for (let i = 0; i < 8; i++) play(38 + i, V1_A[i] + 12, 0.2, 1.0, { bright: 1.2 });
for (let b = 40; b < 46; b++) play(b, V1_A[(b - 40) % 8], 0.12, 1.0, { bright: 1.2 });
// climax: the theme in octaves
for (let i = 0; i < 8; i++) {
  play(54 + i, THEME[i], 0.5, 1.02);
  play(54 + i, THEME[i] - 12, 0.36, 1.02);
}
// eighths (motion) — movements II and the climax
for (const [b0, b1, vel] of [
  [22, 30, 0.13],
  [54, 62, 0.15],
]) {
  for (let b = b0; b < b1; b++) {
    const t = TONES[CH[ci(b)]];
    play(b, t[1], vel, 0.48);
    play(b + 0.5, t[2], vel * 0.8, 0.48);
  }
}
// clockwork sixteenths on paper — precise, quiet
for (let b = 30.5; b < 38; b += 0.25) {
  const t = TONES[CH[ci(b)]];
  const k = Math.round((b % 1) * 4) % 4;
  const m = [t[2] + 12, t[1] + 12, t[0] + 12, t[1] + 12][k];
  play(b, m, k === 0 ? 0.1 : 0.075, 0.14, { bright: 1.2, release: 0.08 });
}
// rising sixteenths under the valuation
for (let b = 38; b < 46; b += 0.25) {
  const t = TONES[CH[ci(b)]];
  const k = Math.round((b % 1) * 4) % 4;
  const m = [t[0], t[1], t[2], t[0] + 12][k];
  play(b, m, k === 0 ? 0.14 : 0.105, 0.34);
}
// the final cadence
for (const [m, v] of [
  [26, 0.6],
  [38, 0.55],
  [45, 0.42],
  [50, 0.42],
  [54, 0.36],
  [57, 0.34],
  [62, 0.36],
  [66, 0.32],
  [69, 0.3],
  [74, 0.42],
]) {
  D.piano(piano, T(62) + (m < 40 ? 0 : 0.012 * (m - 40) * 0.4), 8, m, v, { release: 2.5 });
}
for (const [b, m, v] of [
  [64, 78, 0.18],
  [64.3, 81, 0.15],
  [66, 86, 0.13],
]) {
  play(b, m, v, 3, { bright: 1.1, release: 1.5 });
}

// ---------------------------------------------------------------- the note: glass bells
const ring = (b, m, v, o) => D.bell(bells, T(b), m, v, o);
ring(6, 86, 0.42, { decay: 1.3 });
[81, 86, 78, 81, 83].forEach((m, i) => play(11.25 + i * 0.25, m, 0.1, 0.6, { bright: 1.2 }));
ring(17, 81, 0.3);
ring(26.2, 83, 0.14);
ring(36.75, 86, 0.24);
ring(41.5, 90, 0.18);
ring(57.8, 93, 0.12);
ring(63.4, 86, 0.3, { decay: 1.4 });
// catalyst events: the playhead touches each one
{
  const glide = (q) => {
    // same curve as the page's K.ease.glide (cubic-bezier .45,.05,.2,1) — sampled numerically
    const bz = (x1, y1, x2, y2, x) => {
      let lo = 0;
      let hi = 1;
      let tt = x;
      for (let i = 0; i < 40; i++) {
        const sx = 3 * (1 - tt) ** 2 * tt * x1 + 3 * (1 - tt) * tt * tt * x2 + tt ** 3;
        if (sx < x) lo = tt;
        else hi = tt;
        tt = (lo + hi) / 2;
      }
      return 3 * (1 - tt) ** 2 * tt * y1 + 3 * (1 - tt) * tt * tt * y2 + tt ** 3;
    };
    return bz(0.45, 0.05, 0.2, 1, q);
  };
  for (const [day, m] of [
    [12, 81],
    [41, 86],
    [78, 90],
  ]) {
    let q = 0;
    while (q < 1 && glide(q) < day / 78) q += 0.001;
    ring(27.45 + 2.3 * q, m, day === 78 ? 0.3 : 0.2);
  }
}
[93, 90, 86, 81].forEach((m, i) => ring(40 + i * 0.19, m, 0.13, { decay: 0.7 }));
[81, 86, 90].forEach((m, i) => ring(32.0 + i * 0.25, m, 0.15, { decay: 0.8 }));
// matrix: each diagonal is a plucked chord tone, ascending
for (let k = 0; k < 9; k++) {
  const b = 42.0 + k * 0.25;
  play(b, chordAbove(b, 69, k), 0.16, 0.3, { bright: 1.25, release: 0.2 });
}
for (const m of [83, 86, 91]) ring(44.25, m, 0.17);
// the verdict
for (const m of [62, 66, 69, 74]) play(51.3, m, 0.22, 2.5, { release: 0.6 });
// cards assembling
[56.625, 56.75, 56.875, 57.0, 57.125, 57.25].forEach((b, i) => play(b, chordAbove(b, 81, i), 0.08, 0.4, { bright: 1.2 }));

// ---------------------------------------------------------------- mechanics: ticks, pen, swipes
const ticksFor = (b0, b1, count, amp, ez, f0 = 3800) => {
  for (let m = 1; m <= count; m++) {
    const q = ez(m / count);
    const t = T(b0 + (b1 - b0) * q);
    D.tick(sfx, t, f0 + 500 * Math.sin(m * 1.7), amp * (0.6 + 0.4 * (1 - m / count)), Math.sin(m) * 0.3);
  }
};
const invQuart = (u) => 1 - (1 - u) ** 0.25;
const invCubic = (u) => 1 - (1 - u) ** (1 / 3);
ticksFor(15.3, 17.0, 34, 0.02, invQuart);
ticksFor(17.5, 18.5, 20, 0.012, invQuart);
ticksFor(18.25, 19.25, 20, 0.012, invQuart);
ticksFor(38.35, 39.35, 16, 0.016, invCubic, 3200);
ticksFor(40.5, 41.5, 30, 0.016, invQuart);
for (const b of [44.75, 45.0, 45.25]) ticksFor(b, b + 0.8, 8, 0.009, invQuart);
for (let i = 0; i < 12; i++) D.tick(sfx, T(36 + i * 0.0625), 1900 + 260 * Math.sin(i * 2.3), 0.022, -0.1);
D.noiseGesture(sfx, T(31.5), T(32.0) - T(31.5), { amp: 0.03, freq: (u) => 2200 + 2400 * u, q: 1.4 });
D.noiseGesture(sfx, T(35.25), T(35.75) - T(35.25), {
  amp: 0.03,
  freq: (u) => 1700 + 600 * Math.sin(u * 40),
  q: 0.9,
  env: (u) => Math.sin(Math.PI * u) * (0.7 + 0.3 * Math.sin(u * 63)),
});
D.noiseGesture(sfx, T(52.6), T(53.4) - T(52.6), {
  amp: 0.026,
  freq: (u) => 2000 + 900 * Math.sin(u * 55),
  q: 0.8,
  env: (u) => Math.sin(Math.PI * u) ** 0.6 * (0.6 + 0.4 * Math.sin(u * 71)),
});
D.noiseGesture(sfx, T(10.0), T(12.0) - T(10.0), { amp: 0.006, freq: (u) => 5000 + 3000 * u, q: 0.7 });
D.noiseGesture(sfx, T(55.0), T(56.6) - T(55.0), { amp: 0.006, freq: (u) => 5200 + 4000 * u, q: 0.7 });
D.noiseGesture(sfx, T(63.0), T(64.7) - T(63.0), { amp: 0.005, freq: (u) => 5200 + 4000 * u, q: 0.7 });
// heartbeat under the valuation and the committee
function thump(t0, amp) {
  const s0 = Math.floor(t0 * D.SR);
  let ph = 0;
  for (let i = 0; i < 0.4 * D.SR && s0 + i < low[0].length; i++) {
    const t = i / D.SR;
    ph += (2 * Math.PI * (46 + 40 * Math.exp(-t / 0.025))) / D.SR;
    const v = Math.sin(ph) * Math.exp(-t / 0.16) * Math.min(1, t / 0.003) * amp;
    low[0][s0 + i] += v;
    low[1][s0 + i] += v;
  }
}
for (let b = 38; b < 52; b++) thump(T(b), (b - 6) % 4 === 0 ? 0.12 : 0.08);
D.boom(low, T(54), 0.26);
D.boom(low, T(62), 0.18);

// ---------------------------------------------------------------- reverse swells into the cuts
const IR = D.hallIR(3.8, 11);
function swell(bEnd, chord, len, gain) {
  const tmp = D.bus(len + 4);
  for (const m of chord) D.piano(tmp, 0.05, 2.5, m, 0.34, { release: 1.2 });
  const mono = new Float32Array(tmp[0].length);
  for (let i = 0; i < mono.length; i++) mono[i] = (tmp[0][i] + tmp[1][i]) * 0.5;
  const wet = [D.convolve(mono, IR[0]), D.convolve(mono, IR[1])];
  const n = Math.floor(len * D.SR);
  const end = Math.floor(T(bEnd) * D.SR);
  for (let i = 0; i < n; i++) {
    const src = n - 1 - i; // reversed
    const k = end - n + i;
    if (k < 0 || k >= sfx[0].length) continue;
    const fade = Math.min(1, i / (0.4 * D.SR)) * Math.min(1, (n - i) / (0.004 * D.SR));
    const shape = (i / n) ** 1.6;
    sfx[0][k] += wet[0][src] * gain * fade * shape;
    sfx[1][k] += wet[1][src] * gain * fade * shape;
  }
}
swell(30, [69, 73, 76, 81], 1.6, 0.9);
swell(38, [57, 64, 69, 73], 1.4, 0.8);
swell(54, [45, 57, 64, 69, 73, 76, 81], 2.2, 1.25);
swell(62, [45, 57, 61, 64, 69, 73], 2.0, 1.0);

// ---------------------------------------------------------------- prelude: the noise, then nothing
{
  const r = D.rng(2026);
  const N = Math.floor((30 / 0.85) * (Math.exp(0.85 * 5) - 1));
  for (let i = 0; i < N; i++) {
    const t = Math.log(1 + (0.85 * (i + r())) / 30) / 0.85;
    if (t >= 4.995) continue;
    D.tick(pre, t, 1800 + 5200 * r(), (0.003 + 0.011 * r()) * (0.35 + 0.65 * (t / 5)), r() * 2 - 1);
  }
  const NB = Math.floor((2 / 0.5) * (Math.exp(0.5 * 5) - 1));
  for (let i = 0; i < NB; i++) {
    const t0 = Math.log(1 + (0.5 * (i + r())) / 2) / 0.5;
    const f = 700 + 1900 * r();
    const len = Math.floor((0.03 + 0.05 * r()) * D.SR);
    const s0 = Math.floor(t0 * D.SR);
    const a = 0.008 + 0.014 * r();
    const pan = r() * 1.6 - 0.8;
    for (let k = 0; k < len && s0 + k < 5 * D.SR; k++) {
      const u = k / len;
      const v = Math.sin((2 * Math.PI * f * k) / D.SR + 2.2 * Math.sin((2 * Math.PI * f * 1.5 * k) / D.SR)) * Math.sin(Math.PI * u) * a;
      pre[0][s0 + k] += v * (1 - pan) * 0.5;
      pre[1][s0 + k] += v * (1 + pan) * 0.5;
    }
  }
  const sl = D.svfState();
  const sr = D.svfState();
  const dl = D.svfState();
  const rr = D.rng(5);
  const phs = [0, 0, 0];
  const n5 = 5 * D.SR;
  for (let s = 0; s < n5; s++) {
    const t = s / D.SR;
    const u = t / 5;
    const fc = 300 * (3500 / 300) ** u;
    const amp = 0.1 * Math.exp((t - 5) * 0.9);
    pre[0][s] += D.svfTick(sl, r() * 2 - 1, fc, 0.8).bp * amp;
    pre[1][s] += D.svfTick(sr, rr() * 2 - 1, fc * 1.07, 0.8).bp * amp;
    let saw = 0;
    [55, 82.41, 110].forEach((f, k) => {
      phs[k] += (f * 2 ** ((25 * u) / 1200)) / D.SR;
      if (phs[k] >= 1) phs[k] -= 1;
      saw += 2 * phs[k] - 1;
    });
    const drone = D.svfTick(dl, saw / 3, 180 * (1200 / 180) ** u, 0.7).lp * 0.07 * u ** 1.5;
    pre[0][s] += drone;
    pre[1][s] += drone;
  }
}

// ---------------------------------------------------------------- mix
log("mixing…");
const n = piano[0].length;
const send = new Float32Array(n);
const S = { piano: 0.3, pad: 0.42, voices: 0.36, bells: 0.62, sfx: 0.16, pre: 0.22 };
const G = { piano: 1.0, pad: 0.9, voices: 0.95, low: 0.8, bells: 0.7, sfx: 0.9, pre: 1.0 };
const busses = { piano, pad, voices, bells, sfx, pre };
for (const k in busses) {
  const [l, r] = busses[k];
  for (let i = 0; i < n; i++) send[i] += (l[i] + r[i]) * 0.5 * S[k] * G[k];
}
const cut = Math.floor(5 * D.SR);
const preWet = new Float32Array(n);
for (let i = 0; i < cut; i++) preWet[i] = send[i];
for (let i = 0; i < cut; i++) send[i] = 0;
const wet = [D.convolve(send, IR[0]), D.convolve(send, IR[1])];
const IRs = D.hallIR(1.6, 21);
const pwet = [D.convolve(preWet, IRs[0]), D.convolve(preWet, IRs[1])];
const L = new Float32Array(n);
const R = new Float32Array(n);
for (let i = 0; i < n; i++) {
  let l = 0;
  let r = 0;
  for (const k in busses) {
    if (k === "pre") continue;
    l += busses[k][0][i] * G[k];
    r += busses[k][1][i] * G[k];
  }
  l += low[0][i] * G.low + wet[0][i] * 0.85;
  r += low[1][i] * G.low + wet[1][i] * 0.85;
  if (i < cut) {
    const g = Math.min(1, (cut - i) / (0.003 * D.SR));
    l += (pre[0][i] + pwet[0][i] * 0.8) * g;
    r += (pre[1][i] + pwet[1][i] * 0.8) * g;
  }
  L[i] = l;
  R[i] = r;
}
// silence is part of the score: nothing between the cut and the first note
for (let i = cut; i < Math.floor(T(6) * D.SR) - 8; i++) {
  L[i] = 0;
  R[i] = 0;
}
for (const ch of [L, R]) {
  D.biquad(ch, "hp", 26, 0.7);
  D.biquad(ch, "peak", 320, 0.9, -1.2);
  D.biquad(ch, "shelf", 7500, 0.7, 3.5);
  D.biquad(ch, "peak", 2800, 0.8, 1.5);
}
D.glue(L, R, -17, 1.8, 0.03, 0.4);
// filters ring; the silence after the noise must be absolute
for (let i = cut; i < Math.floor(T(6) * D.SR) - 4; i++) {
  L[i] = 0;
  R[i] = 0;
}
// fade to silence with the picture
const f0 = Math.floor(T(70.6) * D.SR);
const f1 = Math.floor(T(71.95) * D.SR);
for (let i = f0; i < n; i++) {
  const u = Math.min(1, (i - f0) / (f1 - f0));
  const g = 0.5 + 0.5 * Math.cos(Math.PI * u);
  L[i] *= g;
  R[i] *= g;
}
// loudness: measure, trim to −16 LUFS, then a transparent ceiling
const tmp = join(out, "_score_pre.wav");
let peak = 0;
for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
for (let i = 0; i < n; i++) {
  L[i] *= 0.5 / peak;
  R[i] *= 0.5 / peak;
}
D.writeWav(tmp, L, R);
const res = execFileSync("sh", ["-c", `ffmpeg -hide_banner -nostats -i "${tmp}" -af ebur128=peak=true -f null - 2>&1 | grep -E "I:|Peak:" | tail -2`], { encoding: "utf8" });
const I = Number((res.match(/I:\s+(-?[\d.]+)/) || [])[1]);
const gain = D.db(-16 - I);
for (let i = 0; i < n; i++) {
  L[i] *= gain;
  R[i] *= gain;
}
D.limit(L, R, -1.2, 0.005, 0.15);
D.writeWav(join(out, "score.wav"), L, R);
log(`score.wav · ${TL.duration.toFixed(2)} s · measured ${I.toFixed(1)} LUFS → trimmed ${(-16 - I).toFixed(1)} dB`);
