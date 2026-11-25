#!/usr/bin/env python3
"""
KANON (卡农) — Cinema-Grade Orchestral-Minimalist Canon in D Audio Engine.
Pure Python 3 stdlib (zero external dependencies).
Generates two bespoke 48 kHz 16-bit stereo master soundtracks:
  - web    (36.0s): Flagship Luxury Brand Film score for kanon.hk
  - github (22.0s): High-Velocity Product & Brand Showcase score for GitHub
"""

from __future__ import annotations

import array
import math
import os
import random
import struct
import sys
import wave

SAMPLE_RATE = 48000
TWO_PI = 2.0 * math.pi


def midi_to_hz(note: float) -> float:
    return 440.0 * (2.0 ** ((note - 69.0) / 12.0))


def clamp(v: float, lo: float = -1.0, hi: float = 1.0) -> float:
    return lo if v < lo else (hi if v > hi else v)


def soft_limit(x: float) -> float:
    """Warm analog bus saturation limiter."""
    return math.tanh(x * 1.18) / math.tanh(1.18)


def pan_gains(pan: float, amp: float) -> tuple[float, float]:
    angle = (clamp(pan, -1.0, 1.0) + 1.0) * math.pi * 0.25
    return amp * math.cos(angle), amp * math.sin(angle)


class MasterBus:
    def __init__(self, duration_s: float) -> None:
        self.duration_s = duration_s
        self.n = int(SAMPLE_RATE * duration_s)
        self.l = array.array("d", [0.0]) * self.n
        self.r = array.array("d", [0.0]) * self.n

    def add_imperial_pedal(
        self,
        start_s: float,
        end_s: float,
        midi_note: float,
        amp: float,
        swell_peak: float = 0.68,
        pan: float = 0.0,
        attack_s: float = 1.1,
        release_s: float = 1.3,
    ) -> None:
        """Deep orchestral contrabass + warm low brass/organ crescendo swell."""
        freq = midi_to_hz(midi_note)
        si = max(0, int(start_s * SAMPLE_RATE))
        ei = min(self.n, int(end_s * SAMPLE_RATE))
        dur = end_s - start_s
        if ei <= si or dur <= 0:
            return
        gl, gr = pan_gains(pan, amp)
        bl, br = self.l, self.r
        inv_sr = 1.0 / SAMPLE_RATE
        w = TWO_PI * freq
        for i in range(si, ei):
            t = (i - si) * inv_sr
            env = 1.0
            if t < attack_s:
                env = 0.5 - 0.5 * math.cos(math.pi * t / attack_s)
            rem = dur - t
            if rem < release_s:
                env *= 0.5 - 0.5 * math.cos(math.pi * max(0.0, rem) / release_s)
            # Dynamic brass brightness blooms smoothly toward swell_peak
            u = t / dur
            bright = 0.25 + 0.75 * math.exp(-((u - swell_peak) / 0.34) ** 2)
            wt = w * t
            # Fundamental + warm octave + rich low-brass harmonics
            s = (
                1.00 * math.sin(wt)
                + 0.44 * math.sin(wt * 2.001 + 0.12)
                + 0.22 * bright * math.sin(wt * 3.002 + 0.31)
                + 0.12 * bright * math.sin(wt * 4.003 + 0.58)
                + 0.06 * bright * math.sin(wt * 5.004 + 0.90)
                + 0.18 * math.sin(wt * 0.9985 + 0.4)
            ) * 0.42
            v = s * env
            bl[i] += v * gl
            br[i] += v * gr

    def add_string_ensemble(
        self,
        start_s: float,
        end_s: float,
        midi_note: float,
        amp: float,
        pan: float = 0.0,
        attack_s: float = 0.78,
        release_s: float = 1.05,
        vibrato_hz: float = 4.6,
    ) -> None:
        """Lush multi-voice stereo string section (detuned ensemble chorus)."""
        freq = midi_to_hz(midi_note)
        si = max(0, int(start_s * SAMPLE_RATE))
        ei = min(self.n, int(end_s * SAMPLE_RATE))
        dur = end_s - start_s
        if ei <= si or dur <= 0:
            return
        gl, gr = pan_gains(pan, amp)
        bl, br = self.l, self.r
        inv_sr = 1.0 / SAMPLE_RATE
        w1 = TWO_PI * freq * 0.9962  # -6.6 cents left ensemble
        w2 = TWO_PI * freq * 1.0000  # center core
        w3 = TWO_PI * freq * 1.0041  # +7.1 cents right ensemble
        wv = TWO_PI * vibrato_hz
        for i in range(si, ei):
            t = (i - si) * inv_sr
            env = 1.0
            if t < attack_s:
                env = (0.5 - 0.5 * math.cos(math.pi * t / attack_s)) ** 0.9
            rem = dur - t
            if rem < release_s:
                env *= 0.5 - 0.5 * math.cos(math.pi * max(0.0, rem) / release_s)
            vib = 1.0 + 0.0024 * math.sin(wv * t) * min(1.0, t / 0.5)
            p1 = w1 * t * vib
            p2 = w2 * t * vib
            p3 = w3 * t * vib
            vl = (
                math.sin(p1)
                + 0.34 * math.sin(p1 * 2.0 + 0.2)
                + 0.14 * math.sin(p1 * 3.0 + 0.5)
                + 0.70 * math.sin(p2)
                + 0.22 * math.sin(p2 * 2.0)
            ) * 0.30
            vr = (
                math.sin(p3)
                + 0.34 * math.sin(p3 * 2.0 + 0.3)
                + 0.14 * math.sin(p3 * 3.0 + 0.7)
                + 0.70 * math.sin(p2)
                + 0.22 * math.sin(p2 * 2.0)
            ) * 0.30
            bl[i] += vl * env * gl
            br[i] += vr * env * gr

    def add_concert_piano(
        self,
        start_s: float,
        midi_note: float,
        dur_s: float,
        amp: float,
        pan: float = 0.0,
    ) -> None:
        """Warm studio felt concert grand with hammer transient & crystalline decay."""
        freq = midi_to_hz(midi_note)
        si = max(0, int(start_s * SAMPLE_RATE))
        ei = min(self.n, int((start_s + dur_s) * SAMPLE_RATE))
        if ei <= si:
            return
        gl, gr = pan_gains(pan, amp)
        bl, br = self.l, self.r
        inv_sr = 1.0 / SAMPLE_RATE
        w = TWO_PI * freq
        attack = 0.011
        decay = 1.65 / max(0.45, dur_s)
        for i in range(si, ei):
            t = (i - si) * inv_sr
            env = (t / attack) ** 0.68 if t < attack else math.exp(-(t - attack) * decay)
            rem = (ei - i) * inv_sr
            if rem < 0.12:
                env *= rem / 0.12
            br_decay = math.exp(-t * 2.9)
            hammer = math.exp(-t * 42.0) * 0.16 * math.sin(w * 5.02 * t)
            wt = w * t
            s = (
                1.00 * math.sin(wt)
                + 0.36 * br_decay * math.sin(wt * 2.0008 + 0.15)
                + 0.15 * br_decay * math.sin(wt * 3.0022 + 0.42)
                + 0.06 * math.exp(-t * 6.5) * math.sin(wt * 4.0045)
                + 0.16 * math.sin(wt * 1.0014 + 0.55)
                + hammer
            ) * 0.52
            v = s * env
            bl[i] += v * gl
            br[i] += v * gr

    def add_titanium_detent(
        self,
        at_s: float,
        freq: float = 1920.0,
        amp: float = 0.10,
        pan: float = 0.0,
        decay: float = 48.0,
    ) -> None:
        """Swiss horological bezel / Leica shutter tactile micro-click."""
        si = max(0, int(at_s * SAMPLE_RATE))
        ei = min(self.n, si + int(0.14 * SAMPLE_RATE))
        if ei <= si:
            return
        gl, gr = pan_gains(pan, amp)
        bl, br = self.l, self.r
        inv_sr = 1.0 / SAMPLE_RATE
        w = TWO_PI * freq
        for i in range(si, ei):
            t = (i - si) * inv_sr
            env = math.exp(-t * decay)
            body = math.sin(w * t) + 0.42 * math.sin(w * 1.618 * t) + 0.20 * math.sin(w * 2.71 * t)
            thump = 0.55 * math.exp(-t * 95.0) * math.sin(TWO_PI * 145.0 * t)
            v = (body * env + thump) * 0.65
            bl[i] += v * gl
            br[i] += v * gr

    def add_cinema_bloom(
        self,
        at_s: float,
        amp: float = 0.38,
        shimmer_amp: float = 0.13,
        dur_s: float = 2.4,
    ) -> None:
        """Monumental IMAX sub-harmonic arrival bloom + crystalline D-major overtone halo."""
        si = max(0, int(at_s * SAMPLE_RATE))
        ei = min(self.n, int((at_s + dur_s) * SAMPLE_RATE))
        if ei <= si:
            return
        bl, br = self.l, self.r
        inv_sr = 1.0 / SAMPLE_RATE
        for i in range(si, ei):
            t = (i - si) * inv_sr
            f_sub = 36.71 + 48.0 * math.exp(-t * 4.6)
            sub_env = min(1.0, t / 0.022) * math.exp(-t * 1.65)
            sub = (math.sin(TWO_PI * f_sub * t) + 0.35 * math.sin(TWO_PI * f_sub * 2.0 * t)) * sub_env * amp * 0.78
            sh_env = min(1.0, t / 0.05) * math.exp(-t * 1.85)
            sh = (
                math.sin(TWO_PI * 587.33 * t)
                + 0.72 * math.sin(TWO_PI * 880.0 * t)
                + 0.48 * math.sin(TWO_PI * 1174.66 * t)
                + 0.28 * math.sin(TWO_PI * 1479.98 * t)
            ) * sh_env * shimmer_amp * 0.68
            bl[i] += sub + sh * 1.08
            br[i] += sub + sh * 0.92

    def add_vault_deadbolt(self, at_s: float, amp: float = 0.48) -> None:
        """Heavy CNC-machined titanium deadbolt lock impact (sub-thud + metallic latch)."""
        si = max(0, int(at_s * SAMPLE_RATE))
        ei = min(self.n, int((at_s + 1.45) * SAMPLE_RATE))
        if ei <= si:
            return
        bl, br = self.l, self.r
        inv_sr = 1.0 / SAMPLE_RATE
        rng = random.Random(2026)
        for i in range(si, ei):
            t = (i - si) * inv_sr
            # Deep heavy vault slam sub-impact
            f_sub = 34.0 + 88.0 * math.exp(-t * 14.0)
            sub = math.sin(TWO_PI * f_sub * t) * math.exp(-t * 3.1) * min(1.0, t / 0.005)
            # Machined metallic ring transient (in-harmonic titanium modes)
            metal = (
                math.sin(TWO_PI * 890.0 * t) * math.exp(-t * 28.0)
                + 0.55 * math.sin(TWO_PI * 1460.0 * t) * math.exp(-t * 38.0)
                + 0.35 * math.sin(TWO_PI * 2380.0 * t) * math.exp(-t * 52.0)
                + 0.25 * rng.uniform(-1.0, 1.0) * math.exp(-t * 85.0)
            ) * 0.42
            v = (sub * 0.85 + metal) * amp
            bl[i] += v * 1.02
            br[i] += v * 0.98

    def add_silk_wipe(
        self,
        center_s: float,
        width_s: float = 0.62,
        amp: float = 0.095,
        pan_dir: float = 1.0,
    ) -> None:
        """Silky sweeping optical curtain air-breath moving smoothly across stereo field."""
        rng = random.Random(int(center_s * 1000) + 41)
        si = max(0, int((center_s - width_s) * SAMPLE_RATE))
        ei = min(self.n, int((center_s + width_s) * SAMPLE_RATE))
        if ei <= si:
            return
        bl, br = self.l, self.r
        inv_sr = 1.0 / SAMPLE_RATE
        lp1 = 0.0
        lp2 = 0.0
        for i in range(si, ei):
            t = i * inv_sr
            u = (t - center_s) / width_s
            env = math.exp(-3.1 * u * u)
            white = rng.uniform(-1.0, 1.0)
            alpha = 0.015 + 0.12 * (0.5 + 0.5 * u)
            lp1 += alpha * (white - lp1)
            lp2 += (alpha * 0.55) * (lp1 - lp2)
            v = (lp1 - lp2 * 0.45) * env * amp * 2.4
            pan = clamp(u * 0.72 * pan_dir, -0.78, 0.78)
            bl[i] += v * (0.5 - pan * 0.42)
            br[i] += v * (0.5 + pan * 0.42)

    def add_prism_shimmer(self, at_s: float, amp: float = 0.14) -> None:
        """Optical glass refraction arpeggio across Dmaj9 high partials."""
        notes = [74, 81, 86, 90, 93]  # D5, A5, D6, F#6, A6
        for idx, n in enumerate(notes):
            self.add_concert_piano(at_s + idx * 0.085, n, 1.9, amp * (1.0 - idx * 0.1), pan=-0.38 + idx * 0.19)

    def apply_hall_reverb(self, wet: float = 0.38) -> None:
        """Warm 6-tap cross-coupled cathedral stereo hall reverb."""
        taps_l = [
            (int(0.029 * SAMPLE_RATE), 0.40),
            (int(0.067 * SAMPLE_RATE), 0.32),
            (int(0.131 * SAMPLE_RATE), 0.25),
            (int(0.241 * SAMPLE_RATE), 0.18),
            (int(0.389 * SAMPLE_RATE), 0.12),
        ]
        taps_r = [
            (int(0.037 * SAMPLE_RATE), 0.40),
            (int(0.083 * SAMPLE_RATE), 0.31),
            (int(0.157 * SAMPLE_RATE), 0.24),
            (int(0.277 * SAMPLE_RATE), 0.17),
            (int(0.419 * SAMPLE_RATE), 0.11),
        ]
        n = self.n
        bl, br = self.l, self.r
        rev_l = array.array("d", [0.0]) * n
        rev_r = array.array("d", [0.0]) * n
        dl = 0.0
        dr = 0.0
        for i in range(n):
            al = 0.0
            for d, g in taps_l:
                if i >= d:
                    al += (bl[i - d] + rev_r[i - d] * 0.38) * g
            ar = 0.0
            for d, g in taps_r:
                if i >= d:
                    ar += (br[i - d] + rev_l[i - d] * 0.38) * g
            dl += 0.19 * (al - dl)
            dr += 0.19 * (ar - dr)
            rev_l[i] = dl
            rev_r[i] = dr
        dry = 1.0 - wet * 0.30
        for i in range(n):
            bl[i] = bl[i] * dry + rev_l[i] * wet
            br[i] = br[i] * dry + rev_r[i] * wet

    def write_wav(self, out_path: str) -> None:
        self.apply_hall_reverb(wet=0.38)
        n = self.n
        bl, br = self.l, self.r
        peak = 1e-6
        for i in range(n):
            av = abs(bl[i])
            if av > peak:
                peak = av
            av = abs(br[i])
            if av > peak:
                peak = av
        norm = 0.90 / peak
        fade_in = int(0.18 * SAMPLE_RATE)
        fade_out = int(0.85 * SAMPLE_RATE)
        frames = bytearray(n * 4)
        for i in range(n):
            f = 1.0
            if i < fade_in:
                f = i / fade_in
            rem = n - 1 - i
            if rem < fade_out:
                f *= 0.5 - 0.5 * math.cos(math.pi * rem / fade_out)
            ls = soft_limit(bl[i] * norm) * f
            rs = soft_limit(br[i] * norm) * f
            struct.pack_into("<hh", frames, i * 4, int(clamp(ls) * 32767), int(clamp(rs) * 32767))
        os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
        with wave.open(out_path, "wb") as wf:
            wf.setnchannels(2)
            wf.setsampwidth(2)
            wf.setframerate(SAMPLE_RATE)
            wf.writeframes(frames)
        print(f"[audio_synth] Wrote {out_path} ({self.duration_s:.1f}s, 48kHz stereo, norm={norm:.3f})")


def build_web_soundtrack(out_path: str) -> None:
    """36.0s Website Flagship Luxury Brand Film Score (8 Acts)."""
    bus = MasterBus(36.0)

    # ACT I (0.00 - 4.20s): Monastic Stillness & Titanium Monolith
    bus.add_silk_wipe(0.55, width_s=0.65, amp=0.07, pan_dir=1.0)
    bus.add_imperial_pedal(0.08, 4.70, 26, 0.30, swell_peak=0.72, pan=0.0, attack_s=1.2, release_s=1.0)  # D1
    bus.add_string_ensemble(0.25, 4.50, 50, 0.16, pan=-0.12, attack_s=1.1, release_s=0.9)  # D3
    bus.add_concert_piano(0.55, 62, 2.8, 0.24, pan=-0.20)  # D4
    bus.add_concert_piano(1.75, 69, 2.6, 0.21, pan=0.22)   # A4
    bus.add_concert_piano(2.85, 66, 2.4, 0.20, pan=-0.10)  # F#4

    # ACT II (4.20 - 8.60s): Architectural Sanctuary & "Conviction, composed."
    bus.add_cinema_bloom(4.25, amp=0.38, shimmer_amp=0.13, dur_s=2.6)
    bus.add_silk_wipe(4.20, width_s=0.58, amp=0.085, pan_dir=-1.0)
    bus.add_imperial_pedal(4.20, 8.90, 38, 0.30, swell_peak=0.62, pan=-0.06)  # D2
    bus.add_string_ensemble(4.35, 8.80, 57, 0.19, pan=0.16)  # A3
    bus.add_string_ensemble(5.80, 8.90, 62, 0.18, pan=-0.20)  # D4
    for st, n, d, a, p in [
        (4.45, 62, 2.4, 0.25, -0.24),
        (5.30, 57, 2.3, 0.22, 0.22),
        (6.15, 59, 2.4, 0.23, -0.18),
        (7.05, 66, 2.4, 0.24, 0.20),
        (7.90, 67, 2.2, 0.22, -0.14),
    ]:
        bus.add_concert_piano(st, n, d, a, pan=p)

    # ACT III (8.60 - 14.20s): Research Cockpit + Light/Dark Optical Wipe
    bus.add_silk_wipe(8.62, width_s=0.55, amp=0.085, pan_dir=1.0)
    bus.add_titanium_detent(9.10, freq=1680.0, amp=0.09, pan=0.0)
    bus.add_imperial_pedal(8.60, 11.60, 33, 0.28, pan=0.08)   # A1
    bus.add_imperial_pedal(11.30, 14.40, 35, 0.29, pan=-0.08)  # B1
    bus.add_string_ensemble(8.70, 14.30, 64, 0.18, pan=-0.22)  # E4
    bus.add_string_ensemble(11.30, 14.40, 66, 0.20, pan=0.24)  # F#4
    for st, n, d, a, p in [
        (8.90, 69, 2.2, 0.23, -0.25),
        (9.75, 74, 2.3, 0.21, 0.26),
        (10.60, 73, 2.2, 0.22, -0.20),
        (11.40, 71, 2.4, 0.24, 0.22),
        (12.35, 69, 2.2, 0.22, -0.24),
        (13.20, 74, 2.2, 0.23, 0.24),
    ]:
        bus.add_concert_piano(st, n, d, a, pan=p)
    # Dramatic Light <-> Dark Optical Curtain Wipe at 11.35s + Cursor click NVDA at 13.45s
    bus.add_silk_wipe(11.35, width_s=0.68, amp=0.115, pan_dir=1.0)
    bus.add_titanium_detent(11.35, freq=2150.0, amp=0.09, pan=0.12)
    bus.add_titanium_detent(13.45, freq=1840.0, amp=0.11, pan=-0.10)

    # ACT IV (14.20 - 19.60s): SEC EDGAR Forensics & 10-K Source Lineage
    bus.add_silk_wipe(14.22, width_s=0.52, amp=0.085, pan_dir=-1.0)
    bus.add_imperial_pedal(14.20, 17.10, 30, 0.28, pan=0.06)  # F#1
    bus.add_imperial_pedal(16.90, 19.80, 31, 0.30, pan=-0.06)  # G1
    bus.add_string_ensemble(14.30, 19.70, 67, 0.21, pan=-0.26)  # G4
    bus.add_string_ensemble(16.80, 19.80, 71, 0.20, pan=0.28)   # B4
    for idx, bt in enumerate([15.20, 15.70, 16.20, 16.70]):
        bus.add_titanium_detent(bt, freq=1780.0 + idx * 170.0, amp=0.08, pan=-0.28 + idx * 0.18)
    for st, n, d, a, p in [
        (14.55, 66, 2.2, 0.22, -0.24),
        (15.40, 67, 2.2, 0.23, 0.22),
        (16.25, 69, 2.3, 0.23, -0.20),
        (17.10, 74, 2.4, 0.24, 0.24),
        (17.65, 78, 2.5, 0.23, 0.30),  # 10-K footnote binding chime
        (18.60, 76, 2.3, 0.22, -0.18),
    ]:
        bus.add_concert_piano(st, n, d, a, pan=p)
    bus.add_titanium_detent(17.65, freq=2420.0, amp=0.10, pan=0.22, decay=32.0)

    # ACT V (19.60 - 26.20s): Dual-Engine Valuation & 3D 5x5 Matrix (ORCHESTRAL CLIMAX)
    bus.add_silk_wipe(19.62, width_s=0.58, amp=0.095, pan_dir=1.0)
    bus.add_imperial_pedal(19.60, 23.40, 38, 0.33, swell_peak=0.82, pan=0.0)   # D2 crescendo
    bus.add_imperial_pedal(23.35, 26.40, 33, 0.34, swell_peak=0.45, pan=0.0)   # A1 majesty
    bus.add_string_ensemble(19.70, 26.30, 69, 0.24, pan=-0.30)  # A4
    bus.add_string_ensemble(20.60, 26.30, 74, 0.25, pan=0.30)   # D5 soaring
    bus.add_string_ensemble(22.40, 26.30, 78, 0.22, pan=-0.15)  # F#5 crest
    # Tactile titanium slider detents while cursor drags EPS & P/E (21.0 - 22.9s)
    for k in range(10):
        bus.add_titanium_detent(21.05 + k * 0.19, freq=2200.0 + k * 65.0, amp=0.048, pan=-0.26 + k * 0.04, decay=68.0)
    # Climax conviction cell lock at 23.40s ($268 · 3.42x)
    bus.add_cinema_bloom(23.40, amp=0.42, shimmer_amp=0.16, dur_s=2.8)
    bus.add_titanium_detent(23.40, freq=2560.0, amp=0.13, pan=0.16, decay=26.0)
    for st, n, d, a, p in [
        (19.85, 74, 2.4, 0.24, -0.25),
        (20.70, 73, 2.2, 0.23, 0.24),
        (21.55, 71, 2.3, 0.24, -0.22),
        (22.45, 73, 2.3, 0.25, 0.20),
        (23.40, 74, 2.8, 0.28, -0.18),
        (23.42, 86, 2.8, 0.22, 0.28),
        (24.40, 81, 2.5, 0.24, -0.16),
        (25.25, 78, 2.4, 0.23, 0.22),
    ]:
        bus.add_concert_piano(st, n, d, a, pan=p)

    # ACT VI (26.20 - 30.60s): Optical Prisms -> 4-Voice AI IC Polyphony
    bus.add_silk_wipe(26.22, width_s=0.60, amp=0.095, pan_dir=-1.0)
    bus.add_prism_shimmer(26.35, amp=0.15)
    bus.add_imperial_pedal(26.20, 30.65, 31, 0.28, pan=-0.06)  # G1
    bus.add_string_ensemble(26.30, 30.65, 71, 0.20, pan=0.22)  # B4
    for idx, (bt, note) in enumerate([(26.90, 69), (27.45, 71), (28.00, 74), (28.55, 76)]):
        bus.add_concert_piano(bt, note, 2.1, 0.23, pan=-0.28 + idx * 0.18)
        bus.add_titanium_detent(bt, freq=1740.0 + idx * 190.0, amp=0.075, pan=-0.24 + idx * 0.16)
    # HITL Human Approval Click at 29.45s
    bus.add_titanium_detent(29.45, freq=2280.0, amp=0.11, pan=0.18, decay=34.0)
    bus.add_concert_piano(29.45, 81, 2.2, 0.22, pan=0.20)

    # ACT VII (30.60 - 33.40s): 0.00x Zero-Leverage Horological Vault
    bus.add_silk_wipe(30.62, width_s=0.50, amp=0.08, pan_dir=1.0)
    bus.add_imperial_pedal(30.60, 33.50, 26, 0.30, swell_peak=0.52, pan=0.0, attack_s=0.6, release_s=0.9)  # Deep D1
    # Tension ratchet ticks (31.25 -> 31.78s)
    for k in range(4):
        bus.add_titanium_detent(31.28 + k * 0.125, freq=1280.0 + k * 140.0, amp=0.09, pan=0.0, decay=60.0)
    # HEAVY DEADBOLT SLAM at 31.85s!
    bus.add_vault_deadbolt(31.85, amp=0.52)
    bus.add_concert_piano(31.85, 62, 2.4, 0.24, pan=0.0)
    bus.add_concert_piano(32.55, 69, 2.0, 0.21, pan=0.16)

    # ACT VIII (33.40 - 36.00s): Monumental KANON Monogram Finale (Dmaj9 Cathedral)
    bus.add_silk_wipe(33.40, width_s=0.62, amp=0.09, pan_dir=1.0)
    bus.add_imperial_pedal(33.35, 35.95, 26, 0.38, swell_peak=0.45, pan=0.0, attack_s=0.65, release_s=1.2)
    bus.add_imperial_pedal(33.45, 35.95, 38, 0.30, swell_peak=0.45, pan=-0.08, attack_s=0.6, release_s=1.2)
    bus.add_string_ensemble(33.50, 35.95, 57, 0.22, pan=-0.24, attack_s=0.55, release_s=1.2)
    bus.add_string_ensemble(33.60, 35.95, 66, 0.21, pan=0.24, attack_s=0.55, release_s=1.2)
    bus.add_string_ensemble(33.80, 35.95, 76, 0.16, pan=0.0, attack_s=0.65, release_s=1.2)  # E5 maj9 halo
    # 3 sculpted K monogram ingot locks + platinum sheen bloom
    bus.add_titanium_detent(33.65, freq=1240.0, amp=0.11, pan=-0.22)
    bus.add_concert_piano(33.65, 50, 2.3, 0.30, pan=-0.22)
    bus.add_titanium_detent(33.98, freq=1580.0, amp=0.10, pan=0.0)
    bus.add_concert_piano(33.98, 62, 2.0, 0.28, pan=0.0)
    bus.add_concert_piano(34.02, 69, 2.0, 0.24, pan=0.18)
    bus.add_cinema_bloom(34.30, amp=0.36, shimmer_amp=0.16, dur_s=1.7)
    bus.add_concert_piano(34.30, 78, 1.7, 0.27, pan=0.24)
    bus.add_concert_piano(34.36, 76, 1.65, 0.22, pan=-0.18)
    bus.add_concert_piano(34.42, 86, 1.6, 0.18, pan=0.14)

    bus.write_wav(out_path)


def build_github_soundtrack(out_path: str) -> None:
    """22.0s GitHub Edition High-Velocity Luxury Showcase Score (7 Acts)."""
    bus = MasterBus(22.0)

    # ACT I (0.0 - 3.0s): Titanium Monolith + Conviction, composed.
    bus.add_cinema_bloom(0.22, amp=0.34, shimmer_amp=0.13, dur_s=2.4)
    bus.add_imperial_pedal(0.05, 3.30, 38, 0.30, pan=0.0, attack_s=0.6, release_s=0.8)
    bus.add_string_ensemble(0.20, 3.30, 62, 0.19, pan=-0.18, attack_s=0.6, release_s=0.8)
    bus.add_concert_piano(0.35, 62, 2.2, 0.25, pan=-0.20)
    bus.add_concert_piano(1.15, 69, 2.1, 0.23, pan=0.22)
    bus.add_concert_piano(1.95, 66, 2.0, 0.22, pan=-0.12)

    # ACT II (3.0 - 7.0s): Cockpit + Light/Dark Optical Wipe (5.0s)
    bus.add_silk_wipe(3.02, width_s=0.45, amp=0.09, pan_dir=1.0)
    bus.add_imperial_pedal(3.00, 7.20, 33, 0.29, pan=0.08, attack_s=0.55)
    bus.add_string_ensemble(3.10, 7.20, 64, 0.20, pan=0.20, attack_s=0.55)
    bus.add_titanium_detent(3.45, freq=1720.0, amp=0.09, pan=0.0)
    bus.add_silk_wipe(5.00, width_s=0.52, amp=0.115, pan_dir=1.0)
    bus.add_titanium_detent(5.00, freq=2180.0, amp=0.10, pan=0.14)
    bus.add_titanium_detent(6.45, freq=1860.0, amp=0.10, pan=-0.10)
    for st, n, p in [(3.20, 69, -0.24), (4.10, 74, 0.24), (5.00, 71, -0.20), (5.95, 73, 0.20)]:
        bus.add_concert_piano(st, n, 2.0, 0.23, pan=p)

    # ACT III (7.0 - 10.8s): SEC XBRL Forensics & 10-K Source Lineage (9.2s)
    bus.add_silk_wipe(7.02, width_s=0.44, amp=0.085, pan_dir=-1.0)
    bus.add_imperial_pedal(7.00, 11.00, 35, 0.30, pan=-0.08, attack_s=0.55)
    bus.add_string_ensemble(7.10, 11.00, 67, 0.21, pan=-0.22, attack_s=0.55)
    for idx, bt in enumerate([7.55, 7.95, 8.35, 8.75]):
        bus.add_titanium_detent(bt, freq=1780.0 + idx * 170.0, amp=0.08, pan=-0.25 + idx * 0.16)
    bus.add_titanium_detent(9.25, freq=2420.0, amp=0.11, pan=0.22, decay=30.0)
    for st, n, p in [(7.25, 67, -0.20), (8.20, 71, 0.22), (9.25, 78, 0.28), (10.05, 76, -0.18)]:
        bus.add_concert_piano(st, n, 2.0, 0.24, pan=p)

    # ACT IV (10.8 - 15.2s): Valuation Sliders & 3D 5x5 Matrix Climax (13.4s)
    bus.add_silk_wipe(10.82, width_s=0.48, amp=0.095, pan_dir=1.0)
    bus.add_imperial_pedal(10.80, 15.40, 38, 0.34, swell_peak=0.65, pan=0.0, attack_s=0.55)
    bus.add_string_ensemble(10.90, 15.40, 74, 0.24, pan=0.26, attack_s=0.55)
    bus.add_string_ensemble(11.60, 15.40, 78, 0.20, pan=-0.24, attack_s=0.55)
    for k in range(7):
        bus.add_titanium_detent(11.65 + k * 0.21, freq=2180.0 + k * 75.0, amp=0.052, pan=-0.22 + k * 0.06, decay=66.0)
    bus.add_cinema_bloom(13.40, amp=0.42, shimmer_amp=0.16, dur_s=2.2)
    bus.add_titanium_detent(13.40, freq=2560.0, amp=0.13, pan=0.16, decay=26.0)
    for st, n, p in [(11.05, 74, -0.24), (12.15, 73, 0.22), (13.40, 74, -0.18), (13.42, 86, 0.26), (14.35, 81, 0.16)]:
        bus.add_concert_piano(st, n, 2.2, 0.26, pan=p)

    # ACT V (15.2 - 18.0s): Prisms -> 4-Voice AI IC Polyphony + HITL Click (17.1s)
    bus.add_silk_wipe(15.22, width_s=0.45, amp=0.09, pan_dir=-1.0)
    bus.add_prism_shimmer(15.30, amp=0.14)
    bus.add_imperial_pedal(15.20, 18.10, 31, 0.28, pan=-0.06, attack_s=0.45)
    for idx, (bt, note) in enumerate([(15.65, 69), (16.00, 71), (16.35, 74), (16.70, 76)]):
        bus.add_concert_piano(bt, note, 1.8, 0.22, pan=-0.25 + idx * 0.17)
        bus.add_titanium_detent(bt, freq=1760.0 + idx * 180.0, amp=0.075, pan=-0.22 + idx * 0.15)
    bus.add_titanium_detent(17.15, freq=2280.0, amp=0.11, pan=0.18, decay=32.0)

    # ACT VI (18.0 - 20.0s): 0.00x Zero-Leverage Vault Slam (18.95s)
    bus.add_silk_wipe(18.00, width_s=0.40, amp=0.08, pan_dir=1.0)
    bus.add_imperial_pedal(18.00, 20.15, 26, 0.30, pan=0.0, attack_s=0.35, release_s=0.6)
    for k in range(3):
        bus.add_titanium_detent(18.45 + k * 0.13, freq=1300.0 + k * 150.0, amp=0.09, pan=0.0, decay=60.0)
    bus.add_vault_deadbolt(18.95, amp=0.52)
    bus.add_concert_piano(18.95, 62, 2.0, 0.24, pan=0.0)

    # ACT VII (20.0 - 22.0s): Monumental KANON Monogram Finale
    bus.add_imperial_pedal(19.95, 21.95, 26, 0.38, swell_peak=0.42, pan=0.0, attack_s=0.45, release_s=0.95)
    bus.add_imperial_pedal(20.05, 21.95, 38, 0.30, swell_peak=0.42, pan=-0.08, attack_s=0.45, release_s=0.95)
    bus.add_string_ensemble(20.05, 21.95, 57, 0.22, pan=-0.22, attack_s=0.45, release_s=0.95)
    bus.add_string_ensemble(20.12, 21.95, 66, 0.21, pan=0.22, attack_s=0.45, release_s=0.95)
    bus.add_titanium_detent(20.15, freq=1240.0, amp=0.11, pan=-0.20)
    bus.add_concert_piano(20.15, 50, 1.8, 0.30, pan=-0.20)
    bus.add_concert_piano(20.42, 62, 1.55, 0.28, pan=0.0)
    bus.add_cinema_bloom(20.68, amp=0.36, shimmer_amp=0.16, dur_s=1.3)
    bus.add_concert_piano(20.68, 78, 1.3, 0.27, pan=0.22)
    bus.add_concert_piano(20.74, 86, 1.25, 0.19, pan=-0.16)

    bus.write_wav(out_path)


def main() -> None:
    base_dir = os.path.dirname(os.path.abspath(__file__))
    edition = sys.argv[1] if len(sys.argv) > 1 else "all"
    if edition in ("web", "all"):
        build_web_soundtrack(os.path.join(base_dir, "soundtrack-web.wav"))
    if edition in ("github", "all"):
        build_github_soundtrack(os.path.join(base_dir, "soundtrack-github.wav"))


if __name__ == "__main__":
    main()
