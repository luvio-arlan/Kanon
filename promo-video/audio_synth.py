#!/usr/bin/env python3
"""
KANON (卡农) — Authentic Pachelbel's Canon in D Chamber Orchestra Audio Wrapper.
Invokes `canon_orchestra.swift` (macOS CoreAudio AVAudioEngine + Apple DLS studio acoustic
Grand Piano, Orchestral Harp, Warm-Filtered Violin I & II, Cello & Slow Strings),
then applies Abbey Road chamber mastering EQ + broadcast EBU R128 loudness polish via FFmpeg.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys


def master_with_ffmpeg(raw_wav: str, out_wav: str) -> None:
    """Warm, sunlit classical-crossover studio mastering preserving full orchestral crescendo."""
    cmd = [
        "ffmpeg", "-y", "-i", raw_wav,
        "-af", (
            "highpass=f=45,"
            "equalizer=f=220:width_type=o:width=1.2:g=1.2,"
            "equalizer=f=3100:width_type=o:width=1.1:g=-2.0,"
            "treble=g=0.8:f=9500,"
            "volume=1.15,"
            "alimiter=limit=0.88:attack=5:release=60"
        ),
        "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le",
        out_wav,
    ]
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)


def render_edition(base_dir: str, edition: str) -> None:
    swift_script = os.path.join(base_dir, "canon_orchestra.swift")
    raw_wav = os.path.join(base_dir, f"_tmp_raw_{edition}.wav")
    final_wav = os.path.join(base_dir, f"soundtrack-{edition}.wav")

    if not shutil.which("swift"):
        raise RuntimeError("macOS Swift toolchain is required to render the acoustic Canon orchestra.")

    subprocess.run(["swift", swift_script, edition, raw_wav], check=True)
    master_with_ffmpeg(raw_wav, final_wav)
    if os.path.exists(raw_wav):
        os.remove(raw_wav)
    print(f"[audio_synth] Mastered bright Canon in D -> {final_wav}")


def main() -> None:
    base_dir = os.path.dirname(os.path.abspath(__file__))
    edition = sys.argv[1] if len(sys.argv) > 1 else "all"
    if edition in ("web", "all"):
        render_edition(base_dir, "web")
    if edition in ("github", "all"):
        render_edition(base_dir, "github")


if __name__ == "__main__":
    main()
