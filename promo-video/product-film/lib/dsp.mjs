// Minimal offline DSP toolkit for the KANON score: instruments, convolution reverb, dynamics, WAV.
import { writeFileSync } from "node:fs";

export const SR = 48000;
export const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
export const db = (x) => 10 ** (x / 20);

export function bus(seconds) {
  const n = Math.ceil(seconds * SR);
  return [new Float32Array(n), new Float32Array(n)];
}

// Deterministic PRNG (mulberry32)
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const panGains = (p) => {
  const a = ((p + 1) * Math.PI) / 4;
  return [Math.cos(a), Math.sin(a)];
};

// ---------------------------------------------------------------- felt piano (additive)
export function piano(out, t0, dur, midi, vel, o = {}) {
  const [L, R] = out;
  const f0 = mtof(midi);
  const s0 = Math.floor(t0 * SR);
  if (s0 >= L.length) return;
  const B = 0.00016 * 2 ** ((midi - 48) / 18);
  const tauBase = 8.5 * 2 ** (-(midi - 36) / 19);
  const rel = o.release ?? 0.14;
  const off = Math.floor((t0 + dur) * SR);
  const tail = Math.floor(rel * 7 * SR);
  const N = Math.max(1, Math.min(22, Math.floor(15500 / f0)));
  const pan = o.pan ?? Math.max(-0.6, Math.min(0.6, (midi - 62) / 46));
  const [gl, gr] = panGains(pan);
  const bright = o.bright ?? 1;
  const end = Math.min(L.length, off + tail, s0 + Math.floor(tauBase * 7 * SR));
  const len = end - s0;
  if (len <= 0) return;
  const amp = vel * 0.22 * (o.gain ?? 1);
  const atk = Math.floor((0.003 + 0.006 * (1 - vel)) * SR);
  const relK = Math.exp(-1 / (rel * SR));
  const r = rng(midi * 7919 + s0);
  for (let n = 1; n <= N; n++) {
    const fn = n * f0 * Math.sqrt(1 + B * n * n);
    if (fn > 17000) break;
    const hammer = Math.abs(Math.sin(Math.PI * n * 0.128)) + 0.08;
    const felt = Math.exp(-(n - 1) * (0.3 - 0.2 * vel) / bright);
    const board = 1 / Math.sqrt(1 + (120 / fn) ** 2); // soundboard radiates weakly below ~120 Hz
    const a = (amp * hammer * felt * board) / n ** 0.85;
    if (a < 1e-6) continue;
    const tau = tauBase / (1 + 0.42 * (n - 1));
    const kSlow = Math.exp(-1 / (tau * SR));
    const kFast = Math.exp(-1 / (tau * 0.16 * SR));
    for (let str = -1; str <= 1; str += 2) {
      const f = fn * (1 + str * 0.00021 * (1 + 0.3 * r()));
      const w = (2 * Math.PI * f) / SR;
      const c = Math.cos(w);
      const s = Math.sin(w);
      const ph = r() * Math.PI * 2;
      let x = Math.cos(ph);
      let y = Math.sin(ph);
      let eS = 0.42;
      let eF = 0.58;
      let eR = 1;
      const sg = str < 0 ? 0.9 : 1.1;
      const gL = gl * sg * 0.5;
      const gR = gr * (2 - sg) * 0.5;
      for (let i = 0; i < len; i++) {
        const nx = x * c - y * s;
        y = x * s + y * c;
        x = nx;
        eS *= kSlow;
        eF *= kFast;
        const k = s0 + i;
        if (k >= off) eR *= relK;
        let env = (eS + eF) * eR;
        if (i < atk) env *= 0.5 - 0.5 * Math.cos((Math.PI * i) / atk);
        const v = y * env * a;
        L[k] += v * gL;
        R[k] += v * gR;
        if ((i & 1023) === 0) {
          const m = 1 / Math.hypot(x, y);
          x *= m;
          y *= m;
          if (env < 2e-6) break;
        }
      }
    }
  }
  // felt hammer: a breath of filtered noise
  const hn = Math.floor(0.018 * SR);
  let lp = 0;
  const kl = Math.exp((-2 * Math.PI * (900 + 2600 * vel)) / SR);
  for (let i = 0; i < hn && s0 + i < L.length; i++) {
    lp = lp * kl + (r() * 2 - 1) * (1 - kl);
    const v = lp * Math.exp(-i / (0.004 * SR)) * amp * 0.5 * vel;
    L[s0 + i] += v * gl;
    R[s0 + i] += v * gr;
  }
}

// ---------------------------------------------------------------- glass bell (inharmonic additive)
export function bell(out, t0, midi, vel, o = {}) {
  const [L, R] = out;
  const f0 = mtof(midi);
  const s0 = Math.floor(t0 * SR);
  const ratios = [1, 2.756, 5.404, 8.933];
  const amps = [1, 0.24, 0.07, 0.022];
  const taus = [1.25, 0.55, 0.24, 0.11].map((x) => x * (o.decay ?? 1));
  const pan = o.pan ?? 0.15;
  const [gl, gr] = panGains(pan);
  const r = rng(s0 + midi);
  for (let p = 0; p < ratios.length; p++) {
    const f = f0 * ratios[p];
    if (f > 18000) continue;
    for (const det of [-1, 1]) {
      const w = (2 * Math.PI * f * (1 + det * 0.0009)) / SR;
      const n = Math.min(L.length - s0, Math.floor(taus[p] * 7 * SR));
      const k = Math.exp(-1 / (taus[p] * SR));
      let e = vel * 0.12 * amps[p] * 0.5;
      const ph = r() * 6.28;
      const atk = Math.floor(0.002 * SR);
      for (let i = 0; i < n; i++) {
        e *= k;
        const a = i < atk ? i / atk : 1;
        const v = Math.sin(ph + w * i) * e * a;
        L[s0 + i] += v * gl * (det < 0 ? 1.1 : 0.9);
        R[s0 + i] += v * gr * (det < 0 ? 0.9 : 1.1);
      }
    }
  }
}

// ---------------------------------------------------------------- tiny mechanical tick
export function tick(out, t0, freq, amp, pan = 0) {
  const [L, R] = out;
  const s0 = Math.floor(t0 * SR);
  const [gl, gr] = panGains(pan);
  const n = Math.floor(0.012 * SR);
  const r = rng(s0 ^ 0x5bd1);
  const w = (2 * Math.PI * freq) / SR;
  let hp = 0;
  let prev = 0;
  for (let i = 0; i < n && s0 + i < L.length; i++) {
    const tone = Math.sin(w * i) * Math.exp(-i / (0.0016 * SR));
    const nz = r() * 2 - 1;
    hp = 0.85 * (hp + nz - prev);
    prev = nz;
    const v = (tone * 0.8 + hp * 0.35 * Math.exp(-i / (0.0005 * SR))) * amp;
    L[s0 + i] += v * gl;
    R[s0 + i] += v * gr;
  }
}

// ---------------------------------------------------------------- filtered-noise gesture (swipe, pen)
export function noiseGesture(out, t0, dur, o = {}) {
  const [L, R] = out;
  const s0 = Math.floor(t0 * SR);
  const n = Math.floor(dur * SR);
  const r = rng(s0 ^ 0x2c1b);
  const svf = svfState();
  const [gl, gr] = panGains(o.pan ?? 0);
  for (let i = 0; i < n && s0 + i < L.length; i++) {
    const u = i / n;
    const env = (o.env ? o.env(u) : Math.sin(Math.PI * u)) * (o.amp ?? 0.05);
    const fc = o.freq ? o.freq(u) : 2500;
    const v = svfTick(svf, r() * 2 - 1, fc, o.q ?? 1.2).bp * env;
    L[s0 + i] += v * gl;
    R[s0 + i] += v * gr;
  }
}

// ---------------------------------------------------------------- impact: sub drop + air
export function boom(out, t0, amp = 0.5) {
  const [L, R] = out;
  const s0 = Math.floor(t0 * SR);
  const n = Math.floor(4.5 * SR);
  const r = rng(s0 ^ 0x77);
  let ph = 0;
  let lp = 0;
  for (let i = 0; i < n && s0 + i < L.length; i++) {
    const t = i / SR;
    const f = 34 + 52 * Math.exp(-t / 0.11);
    ph += (2 * Math.PI * f) / SR;
    const atk = Math.min(1, t / 0.004);
    const body = Math.sin(ph) * Math.exp(-t / 1.25) * atk;
    lp = lp * 0.985 + (r() * 2 - 1) * 0.015;
    const air = lp * Math.exp(-t / 0.09) * 2.2;
    const v = Math.tanh((body * 0.9 + air) * 1.4) * amp;
    L[s0 + i] += v;
    R[s0 + i] += v;
  }
}

// ---------------------------------------------------------------- state-variable filter (TPT)
export function svfState() {
  return { ic1: 0, ic2: 0 };
}
export function svfTick(st, x, fc, q = 0.707) {
  const g = Math.tan((Math.PI * Math.min(fc, SR * 0.45)) / SR);
  const k = 1 / q;
  const a1 = 1 / (1 + g * (g + k));
  const a2 = g * a1;
  const a3 = g * a2;
  const v3 = x - st.ic2;
  const v1 = a1 * st.ic1 + a2 * v3;
  const v2 = st.ic2 + a2 * st.ic1 + a3 * v3;
  st.ic1 = 2 * v1 - st.ic1;
  st.ic2 = 2 * v2 - st.ic2;
  return { lp: v2, bp: v1, hp: x - k * v1 - v2 };
}

// ---------------------------------------------------------------- bowed ensemble voice (PolyBLEP saws)
const blep = (t, dt) => {
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
};

// notes: [{t0, t1, midi}] legato line; gain(t) → linear dynamics; o: {detune, voices, bright, pan, vib}
export function strings(out, notes, gain, o = {}) {
  const [L, R] = out;
  if (!notes.length) return;
  const sStart = Math.max(0, Math.floor(notes[0].t0 * SR));
  const sEnd = Math.min(L.length, Math.floor((notes[notes.length - 1].t1 + (o.release ?? 1.6)) * SR));
  const V = o.voices ?? 6;
  const det = [];
  for (let v = 0; v < V; v++) det.push((((v / (V - 1)) * 2 - 1) * (o.detune ?? 11)) / 1200);
  const phase = det.map((_, v) => rng(v * 31 + (o.seed ?? 1))());
  const pans = det.map((_, v) => ((v / (V - 1)) * 2 - 1) * (o.width ?? 0.7) + (o.pan ?? 0));
  const gls = pans.map((p) => panGains(Math.max(-1, Math.min(1, p))));
  const f1 = svfState();
  const f2 = svfState();
  let ni = 0;
  let freq = mtof(notes[0].midi);
  let env = 0;
  const glide = Math.exp(-1 / (0.07 * SR));
  const atkK = Math.exp(-1 / ((o.attack ?? 0.35) * SR));
  const relK = Math.exp(-1 / ((o.release ?? 1.6) * 0.3 * SR));
  const vibRate = o.vibRate ?? 5.1;
  for (let s = sStart; s < sEnd; s++) {
    const t = s / SR;
    while (ni < notes.length - 1 && t >= notes[ni + 1].t0) ni++;
    const nt = notes[ni];
    const on = t >= nt.t0 && t < nt.t1;
    const target = mtof(nt.midi);
    freq = target + (freq - target) * glide;
    const goal = on ? gain(t) : 0;
    env = goal > env ? goal + (env - goal) * atkK : goal + (env - goal) * relK;
    if (env < 1e-7 && !on) continue;
    const vib = 1 + (o.vib ?? 0.0035) * Math.sin(2 * Math.PI * vibRate * t + ni);
    let l = 0;
    let r = 0;
    for (let v = 0; v < V; v++) {
      const dt = (freq * vib * (1 + det[v])) / SR;
      let p = phase[v] + dt;
      if (p >= 1) p -= 1;
      phase[v] = p;
      const saw = 2 * p - 1 - blep(p, dt);
      l += saw * gls[v][0];
      r += saw * gls[v][1];
    }
    const fc = Math.min(11000, freq * (o.bright ?? 3.2) + 1100);
    const m = (l + r) * 0.5;
    const side = (l - r) * 0.5;
    const yl = svfTick(f1, m + side, fc, 0.6).lp;
    const yr = svfTick(f2, m - side, fc, 0.6).lp;
    const g = (env * (o.level ?? 0.06)) / V;
    L[s] += yl * g;
    R[s] += yr * g;
  }
}

// ---------------------------------------------------------------- sub sine line
export function sub(out, notes, gain) {
  const [L, R] = out;
  if (!notes.length) return;
  const sStart = Math.floor(notes[0].t0 * SR);
  const sEnd = Math.min(L.length, Math.floor((notes[notes.length - 1].t1 + 1.2) * SR));
  let ph = 0;
  let freq = mtof(notes[0].midi);
  let env = 0;
  let ni = 0;
  const glide = Math.exp(-1 / (0.03 * SR));
  const k = Math.exp(-1 / (0.05 * SR));
  for (let s = sStart; s < sEnd; s++) {
    const t = s / SR;
    while (ni < notes.length - 1 && t >= notes[ni + 1].t0) ni++;
    const nt = notes[ni];
    const on = t >= nt.t0 && t < nt.t1;
    const target = mtof(nt.midi);
    freq = target + (freq - target) * glide;
    env = (on ? gain(t) : 0) + (env - (on ? gain(t) : 0)) * k;
    ph += (2 * Math.PI * freq) / SR;
    if (ph > 1e4) ph -= 2 * Math.PI * 1591;
    const v = Math.tanh(Math.sin(ph) * 1.6) * 0.75 * env;
    L[s] += v;
    R[s] += v;
  }
}

// ---------------------------------------------------------------- FFT + convolution reverb
function fftInPlace(re, im, inverse) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i];
      re[i] = re[j];
      re[j] = t;
      t = im[i];
      im[i] = im[j];
      im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k;
        const b = a + half;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}

export function convolve(x, h) {
  let N = 1;
  while (N < h.length * 2) N <<= 1;
  N = Math.max(N, 1 << 18);
  const blk = N - h.length + 1;
  const Hr = new Float64Array(N);
  const Hi = new Float64Array(N);
  Hr.set(h);
  fftInPlace(Hr, Hi, false);
  const y = new Float32Array(x.length + h.length);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let start = 0; start < x.length; start += blk) {
    re.fill(0);
    im.fill(0);
    const seg = x.subarray(start, Math.min(x.length, start + blk));
    let any = false;
    for (let i = 0; i < seg.length; i++) {
      re[i] = seg[i];
      if (seg[i] !== 0) any = true;
    }
    if (!any) continue;
    fftInPlace(re, im, false);
    for (let i = 0; i < N; i++) {
      const a = re[i] * Hr[i] - im[i] * Hi[i];
      im[i] = re[i] * Hi[i] + im[i] * Hr[i];
      re[i] = a;
    }
    fftInPlace(re, im, true);
    const lim = Math.min(N, y.length - start);
    for (let i = 0; i < lim; i++) y[start + i] += re[i];
  }
  return y;
}

// Synthetic hall: decorrelated noise, frequency-dependent decay, early reflections.
export function hallIR(seconds = 3.6, seed = 7) {
  const n = Math.floor(seconds * SR);
  const out = [];
  for (let ch = 0; ch < 2; ch++) {
    const r = rng(seed + ch * 101);
    const ir = new Float32Array(n);
    const pre = Math.floor(0.019 * SR);
    let lp = 0;
    const rt = seconds * 0.78;
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / SR;
      const fc = 9000 * Math.exp(-t / 0.75) + 600;
      const k = Math.exp((-2 * Math.PI * fc) / SR);
      lp = lp * k + (r() * 2 - 1) * (1 - k);
      const env = 10 ** ((-3 * t) / rt) * Math.min(1, t / 0.012);
      ir[i] = lp * env;
    }
    for (let e = 0; e < 18; e++) {
      const at = pre + Math.floor((0.004 + r() * 0.07) * SR);
      ir[at] += (r() < 0.5 ? -1 : 1) * (0.5 - e * 0.02) * 0.6;
    }
    let energy = 0;
    for (let i = 0; i < n; i++) energy += ir[i] * ir[i];
    const g = 1 / Math.sqrt(energy);
    for (let i = 0; i < n; i++) ir[i] *= g;
    out.push(ir);
  }
  return out;
}

// ---------------------------------------------------------------- biquad EQ (RBJ)
export function biquad(x, type, f, q = 0.707, gainDb = 0) {
  const A = 10 ** (gainDb / 40);
  const w = (2 * Math.PI * f) / SR;
  const cs = Math.cos(w);
  const sn = Math.sin(w);
  const al = sn / (2 * q);
  let b0;
  let b1;
  let b2;
  let a0;
  let a1;
  let a2;
  if (type === "hp") {
    b0 = (1 + cs) / 2;
    b1 = -(1 + cs);
    b2 = (1 + cs) / 2;
    a0 = 1 + al;
    a1 = -2 * cs;
    a2 = 1 - al;
  } else if (type === "lp") {
    b0 = (1 - cs) / 2;
    b1 = 1 - cs;
    b2 = (1 - cs) / 2;
    a0 = 1 + al;
    a1 = -2 * cs;
    a2 = 1 - al;
  } else if (type === "peak") {
    b0 = 1 + al * A;
    b1 = -2 * cs;
    b2 = 1 - al * A;
    a0 = 1 + al / A;
    a1 = -2 * cs;
    a2 = 1 - al / A;
  } else {
    // high shelf
    const sq = 2 * Math.sqrt(A) * al;
    b0 = A * (A + 1 + (A - 1) * cs + sq);
    b1 = -2 * A * (A - 1 + (A + 1) * cs);
    b2 = A * (A + 1 + (A - 1) * cs - sq);
    a0 = A + 1 - (A - 1) * cs + sq;
    a1 = 2 * (A - 1 - (A + 1) * cs);
    a2 = A + 1 - (A - 1) * cs - sq;
  }
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const x0 = x[i];
    const y0 = (b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
    x[i] = y0;
  }
}

// ---------------------------------------------------------------- dynamics
export function glue(L, R, thresholdDb = -20, ratio = 2, attack = 0.03, release = 0.35) {
  const ka = Math.exp(-1 / (attack * SR));
  const kr = Math.exp(-1 / (release * SR));
  let env = 0;
  const th = db(thresholdDb);
  for (let i = 0; i < L.length; i++) {
    const x = Math.max(Math.abs(L[i]), Math.abs(R[i]));
    env = x > env ? x + (env - x) * ka : x + (env - x) * kr;
    let g = 1;
    if (env > th) g = (th * (env / th) ** (1 / ratio)) / env;
    L[i] *= g;
    R[i] *= g;
  }
}

export function limit(L, R, ceilingDb = -1, look = 0.005, release = 0.12) {
  const n = L.length;
  const la = Math.max(1, Math.floor(look * SR));
  const ceil = db(ceilingDb);
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = Math.max(Math.abs(L[i]), Math.abs(R[i]));
    need[i] = p > ceil ? ceil / p : 1;
  }
  // sliding-window minimum of the required gain over [i, i + la] (monotonic deque, backwards)
  const tgt = new Float32Array(n);
  const dq = new Int32Array(n);
  let h = 0;
  let t = 0;
  for (let i = n - 1; i >= 0; i--) {
    while (t > h && need[dq[t - 1]] >= need[i]) t--;
    dq[t++] = i;
    while (dq[h] > i + la) h++;
    tgt[i] = need[dq[h]];
  }
  const ka = Math.exp(-1 / (la / 5));
  const kr = Math.exp(-1 / (release * SR));
  let g = 1;
  for (let i = 0; i < n; i++) {
    const x = tgt[i];
    g = x < g ? x + (g - x) * ka : x + (g - x) * kr;
    L[i] = Math.max(-ceil, Math.min(ceil, L[i] * g));
    R[i] = Math.max(-ceil, Math.min(ceil, R[i] * g));
  }
}

// ---------------------------------------------------------------- WAV (24-bit PCM)
export function writeWav(path, L, R) {
  const n = L.length;
  const buf = Buffer.alloc(44 + n * 6);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 6, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 6, 28);
  buf.writeUInt16LE(6, 32);
  buf.writeUInt16LE(24, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 6, 40);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (const ch of [L, R]) {
      const v = Math.max(-1, Math.min(1, ch[i]));
      buf.writeIntLE(Math.round(v * 8388607), o, 3);
      o += 3;
    }
  }
  writeFileSync(path, buf);
}
