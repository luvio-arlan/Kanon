#!/usr/bin/env python3
"""
KANON (卡农) — 24.0s V5 "Cathedral of Light" Poised Canon Soundtrack.
Zero frantic static or noisy chatter. Opens in monastic stillness with a single
velvet cello harmonic and crystalline felt-piano Canon notes, building gracefully
through four contrapuntal voices into a spacious Dmaj9 cathedral climax.
"""

from __future__ import annotations

import math
import os
import random
import struct
import wave

SAMPLE_RATE = 48000
DURATION = 24.0
NUM_SAMPLES = int(SAMPLE_RATE * DURATION)


def midi_to_hz(note: float) -> float:
    return 440.0 * (2.0 ** ((note - 69.0) / 12.0))


def clamp(v: float, lo: float = -1.0, hi: float = 1.0) -> float:
    return lo if v < lo else (hi if v > hi else v)


def soft_clip(x: float) -> float:
    return math.tanh(x * 1.12) / math.tanh(1.12)


def add_felt_piano(
    buf_l: list[float],
    buf_r: list[float],
    start_s: float,
    midi_note: float,
    dur_s: float,
    amp: float,
    pan: float = 0.0,
) -> None:
    freq = midi_to_hz(midi_note)
    start_i = max(0, int(start_s * SAMPLE_RATE))
    end_i = min(NUM_SAMPLES, int((start_s + dur_s) * SAMPLE_RATE))
    if end_i <= start_i:
        return
    gain_l = amp * math.cos((pan + 1.0) * math.pi * 0.25)
    gain_r = amp * math.sin((pan + 1.0) * math.pi * 0.25)
    two_pi = 2.0 * math.pi
    attack = 0.014
    decay = 1.85 / max(0.45, dur_s)
    for i in range(start_i, end_i):
        t = (i - start_i) / SAMPLE_RATE
        env = (t / attack) ** 0.72 if t < attack else math.exp(-(t - attack) * decay)
        rem = (end_i - i) / SAMPLE_RATE
        if rem < 0.12:
            env *= rem / 0.12
        br = math.exp(-t * 3.1)
        s = (
            1.00 * math.sin(two_pi * freq * t)
            + 0.32 * br * math.sin(two_pi * freq * 2.001 * t + 0.18)
            + 0.12 * br * math.sin(two_pi * freq * 3.003 * t + 0.45)
            + 0.04 * math.exp(-t * 8.0) * math.sin(two_pi * freq * 4.006 * t)
            + 0.14 * math.sin(two_pi * freq * 1.0018 * t + 0.6)
        )
        v = s * env * 0.58
        buf_l[i] += v * gain_l
        buf_r[i] += v * gain_r


def add_cello_pad(
    buf_l: list[float],
    buf_r: list[float],
    start_s: float,
    end_s: float,
    midi_note: float,
    amp: float,
    pan: float = 0.0,
    attack_s: float = 0.95,
    release_s: float = 1.15,
) -> None:
    freq = midi_to_hz(midi_note)
    start_i = max(0, int(start_s * SAMPLE_RATE))
    end_i = min(NUM_SAMPLES, int(end_s * SAMPLE_RATE))
    total_s = end_s - start_s
    if end_i <= start_i or total_s <= 0:
        return
    gain_l = amp * math.cos((pan + 1.0) * math.pi * 0.25)
    gain_r = amp * math.sin((pan + 1.0) * math.pi * 0.25)
    two_pi = 2.0 * math.pi
    for i in range(start_i, end_i):
        t = (i - start_i) / SAMPLE_RATE
        env = 1.0
        if t < attack_s:
            env = 0.5 - 0.5 * math.cos(math.pi * t / attack_s)
        rem = total_s - t
        if rem < release_s:
            env *= 0.5 - 0.5 * math.cos(math.pi * max(0.0, rem) / release_s)
        f = freq * (1.0 + 0.0018 * math.sin(two_pi * 3.9 * t))
        s = (
            1.00 * math.sin(two_pi * f * t)
            + 0.30 * math.sin(two_pi * f * 2.0 * t + 0.14)
            + 0.10 * math.sin(two_pi * f * 3.0 * t + 0.36)
            + 0.03 * math.sin(two_pi * f * 4.0 * t)
        )
        breath = 0.90 + 0.10 * math.sin(two_pi * 0.28 * t)
        v = s * env * breath * 0.52
        buf_l[i] += v * gain_l
        buf_r[i] += v * gain_r


def add_titanium_click(
    buf_l: list[float],
    buf_r: list[float],
    at_s: float,
    freq: float = 1780.0,
    amp: float = 0.12,
    pan: float = 0.0,
    decay: float = 42.0,
) -> None:
    start_i = max(0, int(at_s * SAMPLE_RATE))
    end_i = min(NUM_SAMPLES, start_i + int(0.16 * SAMPLE_RATE))
    gain_l = amp * math.cos((pan + 1.0) * math.pi * 0.25)
    gain_r = amp * math.sin((pan + 1.0) * math.pi * 0.25)
    two_pi = 2.0 * math.pi
    for i in range(start_i, end_i):
        t = (i - start_i) / SAMPLE_RATE
        env = math.exp(-t * decay)
        body = math.sin(two_pi * freq * t) + 0.40 * math.sin(two_pi * freq * 1.618 * t)
        thump = 0.60 * math.exp(-t * 82.0) * math.sin(two_pi * 132.0 * t)
        v = (body * env + thump) * 0.72
        buf_l[i] += v * gain_l
        buf_r[i] += v * gain_r


def add_warm_bloom(buf_l: list[float], buf_r: list[float], at_s: float, amp: float = 0.32, shimmer_amp: float = 0.12) -> None:
    """Velvet sub-warmth & crystalline harmonic swell (never harsh or loud)."""
    start_i = max(0, int(at_s * SAMPLE_RATE))
    end_i = min(NUM_SAMPLES, int((at_s + 1.85) * SAMPLE_RATE))
    two_pi = 2.0 * math.pi
    for i in range(start_i, end_i):
        t = (i - start_i) / SAMPLE_RATE
        f_sub = 44.0 + 42.0 * math.exp(-t * 5.2)
        sub_env = min(1.0, t / 0.025) * math.exp(-t * 2.1)
        sub = math.sin(two_pi * f_sub * t) * sub_env * amp
        sh_env = min(1.0, t / 0.04) * math.exp(-t * 2.3)
        sh = (
            math.sin(two_pi * 587.33 * t)
            + 0.72 * math.sin(two_pi * 880.0 * t)
            + 0.38 * math.sin(two_pi * 1174.66 * t)
        ) * sh_env * shimmer_amp
        buf_l[i] += sub + sh * 1.05
        buf_r[i] += sub + sh * 0.95


def add_silk_breath(buf_l: list[float], buf_r: list[float], center_s: float, width_s: float = 0.65, amp: float = 0.07) -> None:
    """Whisper-soft airy light transition."""
    rng = random.Random(int(center_s * 1000) + 77)
    start_i = max(0, int((center_s - width_s) * SAMPLE_RATE))
    end_i = min(NUM_SAMPLES, int((center_s + width_s) * SAMPLE_RATE))
    lp1 = 0.0
    lp2 = 0.0
    for i in range(start_i, end_i):
        t = i / SAMPLE_RATE
        u = (t - center_s) / width_s
        env = math.exp(-3.4 * u * u)
        white = rng.uniform(-1.0, 1.0)
        alpha = 0.018 + 0.09 * (0.5 + 0.5 * u)
        lp1 += alpha * (white - lp1)
        lp2 += (alpha * 0.6) * (lp1 - lp2)
        v = (lp1 - lp2 * 0.4) * env * amp * 2.5
        pan = clamp(u * 0.5, -0.65, 0.65)
        buf_l[i] += v * (0.5 - pan * 0.38)
        buf_r[i] += v * (0.5 + pan * 0.38)


def apply_cathedral_reverb(buf_l: list[float], buf_r: list[float], wet: float = 0.36) -> None:
    taps_l = [(int(0.033 * SAMPLE_RATE), 0.44), (int(0.079 * SAMPLE_RATE), 0.33), (int(0.163 * SAMPLE_RATE), 0.24), (int(0.311 * SAMPLE_RATE), 0.17)]
    taps_r = [(int(0.041 * SAMPLE_RATE), 0.44), (int(0.097 * SAMPLE_RATE), 0.32), (int(0.191 * SAMPLE_RATE), 0.23), (int(0.347 * SAMPLE_RATE), 0.16)]
    rev_l = [0.0] * NUM_SAMPLES
    rev_r = [0.0] * NUM_SAMPLES
    dl = 0.0
    dr = 0.0
    for i in range(NUM_SAMPLES):
        al = 0.0
        for d, g in taps_l:
            if i >= d:
                al += (buf_l[i - d] + rev_r[i - d] * 0.40) * g
        ar = 0.0
        for d, g in taps_r:
            if i >= d:
                ar += (buf_r[i - d] + rev_l[i - d] * 0.40) * g
        dl += 0.20 * (al - dl)
        dr += 0.20 * (ar - dr)
        rev_l[i] = dl
        rev_r[i] = dr
    dry = 1.0 - wet * 0.34
    for i in range(NUM_SAMPLES):
        buf_l[i] = buf_l[i] * dry + rev_l[i] * wet
        buf_r[i] = buf_r[i] * dry + rev_r[i] * wet


def build_soundtrack(out_path: str) -> None:
    buf_l = [0.0] * NUM_SAMPLES
    buf_r = [0.0] * NUM_SAMPLES

    # =====================================================================
    # ACT I (0.00 - 3.60s): MONASTIC SILENCE & FIRST LIGHT (ZERO NOISE!)
    # Single warm D2 cello breath + solitary echoing felt-piano fifth (D4 -> A4)
    # =====================================================================
    add_cello_pad(buf_l, buf_r, 0.15, 4.40, 38, 0.24, pan=-0.06, attack_s=1.25, release_s=1.20)
    add_felt_piano(buf_l, buf_r, 0.45, 62, 3.2, 0.22, pan=-0.18)   # Pure solitary D4
    add_felt_piano(buf_l, buf_r, 1.85, 69, 2.8, 0.19, pan=0.18)    # Luminous A4 fifth
    add_felt_piano(buf_l, buf_r, 2.85, 66, 2.6, 0.17, pan=-0.08)   # Warm F#4 glow

    # Act II Arrival Bloom (3.60s)
    add_warm_bloom(buf_l, buf_r, 3.60, amp=0.30, shimmer_amp=0.11)

    # Cello Cathedral Progression (D2 -> A1 -> B1 -> F#2 -> G2 -> D2 -> A2 -> Dmaj9)
    chords = [
        (3.55, 7.60, 38, 0.27, -0.10),
        (7.10, 9.80, 33, 0.24, 0.12),
        (9.30, 12.10, 35, 0.25, -0.12),
        (11.60, 14.30, 42, 0.23, 0.10),
        (13.80, 16.30, 43, 0.26, -0.10),
        (15.80, 18.20, 38, 0.25, 0.08),
        (17.50, 19.80, 45, 0.25, -0.08),
        # Final Dmaj9 Cathedral Resolution
        (19.35, 23.85, 38, 0.35, -0.06),
        (19.55, 23.85, 45, 0.22, 0.08),
        (19.95, 23.80, 54, 0.15, 0.0),
    ]
    for st, en, note, amp, pan in chords:
        add_cello_pad(buf_l, buf_r, st, en, note, amp, pan=pan)

    # Polyphonic Canon Voice 1 (Poised Felt Piano)
    voice1 = [
        (3.85, 62, 2.5, 0.24),
        (4.75, 57, 2.3, 0.20),
        (5.65, 59, 2.4, 0.22),
        (6.55, 66, 2.5, 0.23),
        # Act III Prism
        (7.55, 67, 2.4, 0.22),
        (8.45, 62, 2.2, 0.20),
        (9.35, 67, 2.4, 0.22),
        (10.25, 69, 2.5, 0.23),
        # Act IV Valuation
        (11.85, 74, 2.4, 0.24),
        (12.65, 73, 2.2, 0.21),
        (13.45, 71, 2.3, 0.22),
        (13.95, 74, 2.6, 0.25),   # Focal $211 elevation
        (14.85, 76, 2.4, 0.23),
        # Act V Vault
        (16.15, 62, 2.3, 0.21),
        (17.25, 69, 2.6, 0.24),   # Mechanical 0.00x lock
        (18.25, 73, 2.4, 0.22),
    ]
    for st, n, d, a in voice1:
        add_felt_piano(buf_l, buf_r, st, n, d, a, pan=-0.26)

    # Polyphonic Canon Voice 2 (Graceful Octave Counterpoint)
    voice2 = [
        (5.65, 74, 2.3, 0.14),
        (6.55, 69, 2.2, 0.13),
        (7.55, 71, 2.3, 0.15),
        (8.45, 78, 2.4, 0.17),
        (9.35, 79, 2.3, 0.16),
        (10.25, 74, 2.3, 0.15),
        (11.85, 81, 2.4, 0.18),
        (12.65, 86, 2.5, 0.17),
        (13.95, 86, 2.7, 0.19),
        (14.85, 83, 2.4, 0.17),
        (17.25, 81, 2.6, 0.18),
        (18.25, 86, 2.5, 0.17),
    ]
    for st, n, d, a in voice2:
        add_felt_piano(buf_l, buf_r, st, n, d, a, pan=0.28)

    # Restrained Horological Foley (Only on purposeful visual anchors)
    add_silk_breath(buf_l, buf_r, 7.35, width_s=0.60, amp=0.07)
    for idx, bt in enumerate([7.85, 8.60, 9.35, 10.10]):
        add_titanium_click(buf_l, buf_r, bt, freq=1740.0 + idx * 210.0, amp=0.08, pan=-0.30 + idx * 0.20)

    add_silk_breath(buf_l, buf_r, 11.75, width_s=0.58, amp=0.08)
    add_titanium_click(buf_l, buf_r, 13.95, freq=2480.0, amp=0.12, pan=0.14, decay=28.0)

    # Act V Mechanical Deadbolt "ka-da" Lock (16.90s lift -> 17.25s crisp snap shut!)
    add_silk_breath(buf_l, buf_r, 15.95, width_s=0.55, amp=0.07)
    add_titanium_click(buf_l, buf_r, 16.92, freq=1320.0, amp=0.10, pan=0.0, decay=55.0)
    add_warm_bloom(buf_l, buf_r, 17.25, amp=0.28, shimmer_amp=0.08)
    add_titanium_click(buf_l, buf_r, 17.25, freq=980.0, amp=0.20, pan=0.0, decay=30.0)

    # Act VI Sculptural 3-Piece KanonMark Resolution (19.40 - 24.00s)
    add_silk_breath(buf_l, buf_r, 19.35, width_s=0.65, amp=0.08)
    add_felt_piano(buf_l, buf_r, 19.65, 50, 4.2, 0.29, pan=-0.24)
    add_titanium_click(buf_l, buf_r, 19.65, freq=1180.0, amp=0.10, pan=-0.24)
    add_felt_piano(buf_l, buf_r, 20.15, 62, 3.8, 0.27, pan=0.0)
    add_felt_piano(buf_l, buf_r, 20.18, 69, 3.8, 0.23, pan=0.15)
    add_warm_bloom(buf_l, buf_r, 20.65, amp=0.30, shimmer_amp=0.13)
    add_felt_piano(buf_l, buf_r, 20.65, 78, 3.3, 0.26, pan=0.24)
    add_felt_piano(buf_l, buf_r, 20.70, 76, 3.25, 0.20, pan=-0.18)
    add_felt_piano(buf_l, buf_r, 20.76, 86, 3.2, 0.16, pan=0.20)

    apply_cathedral_reverb(buf_l, buf_r, wet=0.36)

    fade_samples = int(0.65 * SAMPLE_RATE)
    peak = max(max(abs(x) for x in buf_l), max(abs(x) for x in buf_r), 1e-6)
    norm = 0.88 / peak

    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    with wave.open(out_path, "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        frames = bytearray(NUM_SAMPLES * 4)
        for i in range(NUM_SAMPLES):
            fade = 1.0
            rem = NUM_SAMPLES - 1 - i
            if rem < fade_samples:
                fade = 0.5 - 0.5 * math.cos(math.pi * rem / fade_samples)
            ls = soft_clip(buf_l[i] * norm) * fade
            rs = soft_clip(buf_r[i] * norm) * fade
            struct.pack_into("<hh", frames, i * 4, int(clamp(ls) * 32767), int(clamp(rs) * 32767))
        wf.writeframes(frames)

    print(f"[audio_synth] Wrote V5 poised soundtrack {out_path} ({DURATION:.2f}s, 48kHz stereo, norm={norm:.3f})")


if __name__ == "__main__":
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "soundtrack.wav")
    build_soundtrack(out)
