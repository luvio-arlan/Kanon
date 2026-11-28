// KANON product film — timing source of truth, in beats.
// Loaded by the page (window.TL) and by the score synth (globalThis.TL via node:vm).
(function (root) {
  const TL = {
    fps: 60,
    bpm: 60,
    // Seconds-per-beat multipliers: a gentle ritardando into the final cadence.
    stretch: { 60: 1.1, 61: 1.25 },
    endBeat: 72,
  };
  const SPB = 60 / TL.bpm;
  const starts = [0];
  for (let i = 0; i < 240; i++) starts.push(starts[i] + SPB * (TL.stretch[i] || 1));
  TL.time = (b) => {
    const i = Math.max(0, Math.min(239, Math.floor(b)));
    return starts[i] + (b - i) * SPB * (TL.stretch[i] || 1);
  };
  TL.beat = (t) => {
    let i = 0;
    while (i < 239 && starts[i + 1] <= t) i++;
    return i + (t - starts[i]) / (SPB * (TL.stretch[i] || 1));
  };
  TL.duration = TL.time(TL.endBeat);
  root.TL = TL;
})(typeof window !== "undefined" ? window : globalThis);
