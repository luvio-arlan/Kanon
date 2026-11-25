#!/usr/bin/env python3
"""
KANON (卡农) — Multi-Edition Deterministic Luxury Brand Film Renderer.
Pure Python 3 stdlib + headless Google Chrome (CDP) + FFmpeg.

Outputs:
  1. Website Flagship Cinema Cut (36s · 1920x1080 @ 60fps · 48kHz stereo):
       - promo-video/kanon-brand-film.mp4
       - marketing/assets/kanon-brand-film.mp4
       - marketing/assets/film-poster.jpg (bespoke high-craft poster frame)
  2. GitHub Showcase Cinema Cut (22s · 1920x1080 @ 60fps · 48kHz stereo):
       - docs/assets/kanon-github-film.mp4
       - docs/assets/film-preview.jpg (high-craft keyframe still)
  3. GitHub Inline Autoplay Animated Reel (14s · 960x540 @ 20fps · 2-pass palette GIF < 8MB):
       - docs/assets/kanon-github-reel.gif
  4. QA Keyframe Stills across every act:
       - promo-video/preview_stills/*.png
"""

from __future__ import annotations

import base64
import http.server
import json
import os
import shutil
import socket
import struct
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request

EDITIONS = {
    "web": {
        "fps": 60,
        "duration": 36,
        "width": 1920,
        "height": 1080,
        "scale": 1.0,
        "audio": "soundtrack-web.wav",
        "stills": {
            135: "web_01_overture_2.25s.png",
            390: "web_02_manifesto_6.50s.png",
            630: "web_03_cockpit_dark_10.50s.png",
            672: "web_04_cockpit_wipe_11.20s.png",
            1085: "web_05_forensics_18.08s.png",
            1445: "web_06_valuation_climax_24.08s.png",
            1785: "web_07_ic_polyphony_29.75s.png",
            1930: "web_08_vault_lock_32.16s.png",
            2110: "web_09_finale_monogram_35.16s.png",
        },
        "poster_frame": 390,
        "preview_frame": 1445,
    },
    "github": {
        "fps": 60,
        "duration": 22,
        "width": 1920,
        "height": 1080,
        "scale": 1.0,
        "audio": "soundtrack-github.wav",
        "stills": {
            115: "gh_01_manifesto_1.92s.png",
            306: "gh_02_cockpit_wipe_5.10s.png",
            580: "gh_03_forensics_9.66s.png",
            830: "gh_04_valuation_13.83s.png",
            1045: "gh_05_ic_approved_17.42s.png",
            1150: "gh_06_vault_19.16s.png",
            1285: "gh_07_finale_21.42s.png",
        },
        "poster_frame": None,
        "preview_frame": 830,
    },
    "gif": {
        "fps": 20,
        "duration": 14,
        "width": 1920,
        "height": 1080,
        "scale": 1.0,
        "audio": None,
        "stills": {},
        "poster_frame": None,
        "preview_frame": None,
    },
}


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def find_chrome_binary() -> str:
    candidates = [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    raise FileNotFoundError("Google Chrome / Chromium binary not found.")


class MinimalCDPClient:
    """Zero-dependency RFC 6455 WebSocket client for local Chrome DevTools Protocol."""

    def __init__(self, ws_url: str) -> None:
        assert ws_url.startswith("ws://"), f"Unsupported WS URL: {ws_url}"
        rest = ws_url[len("ws://") :]
        host_port, path = rest.split("/", 1)
        path = "/" + path
        host, port_s = host_port.split(":")
        self.sock = socket.create_connection((host, int(port_s)), timeout=30.0)
        self.sock.settimeout(60.0)
        key = base64.b64encode(os.urandom(16)).decode("ascii")
        req = (
            f"GET {path} HTTP/1.1\r\n"
            f"Host: {host_port}\r\n"
            f"Upgrade: websocket\r\n"
            f"Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            f"Sec-WebSocket-Version: 13\r\n\r\n"
        )
        self.sock.sendall(req.encode("ascii"))
        resp = b""
        while b"\r\n\r\n" not in resp:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise RuntimeError("WebSocket handshake closed unexpectedly")
            resp += chunk
        if b"101 " not in resp.split(b"\r\n", 1)[0]:
            raise RuntimeError(f"WebSocket upgrade rejected: {resp[:200]!r}")
        self._buf = resp.split(b"\r\n\r\n", 1)[1]
        self._msg_id = 0

    def _read_exact(self, n: int) -> bytes:
        while len(self._buf) < n:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise RuntimeError("WebSocket stream closed")
            self._buf += chunk
        out = self._buf[:n]
        self._buf = self._buf[n:]
        return out

    def _send_text(self, text: str) -> None:
        payload = text.encode("utf-8")
        mask = os.urandom(4)
        header = bytearray([0x81])
        length = len(payload)
        if length < 126:
            header.append(0x80 | length)
        elif length < 65536:
            header.append(0x80 | 126)
            header.extend(struct.pack("!H", length))
        else:
            header.append(0x80 | 127)
            header.extend(struct.pack("!Q", length))
        header.extend(mask)
        masked = bytes(b ^ mask[i & 3] for i, b in enumerate(payload))
        self.sock.sendall(bytes(header) + masked)

    def _recv_message(self) -> str:
        chunks = []
        while True:
            b1, b2 = self._read_exact(2)
            fin = (b1 & 0x80) != 0
            opcode = b1 & 0x0F
            masked = (b2 & 0x80) != 0
            length = b2 & 0x7F
            if length == 126:
                length = struct.unpack("!H", self._read_exact(2))[0]
            elif length == 127:
                length = struct.unpack("!Q", self._read_exact(8))[0]
            mask = self._read_exact(4) if masked else b""
            data = self._read_exact(length)
            if masked:
                data = bytes(b ^ mask[i & 3] for i, b in enumerate(data))
            if opcode == 0x8:
                raise RuntimeError("CDP WebSocket closed by browser")
            if opcode == 0x9:
                self.sock.sendall(b"\x8a\x80\x00\x00\x00\x00")
                continue
            chunks.append(data)
            if fin:
                return b"".join(chunks).decode("utf-8")

    def call(self, method: str, params: dict | None = None) -> dict:
        self._msg_id += 1
        req_id = self._msg_id
        payload = {"id": req_id, "method": method}
        if params is not None:
            payload["params"] = params
        self._send_text(json.dumps(payload))
        while True:
            msg = json.loads(self._recv_message())
            if msg.get("id") == req_id:
                if "error" in msg:
                    raise RuntimeError(f"CDP {method} failed: {msg['error']}")
                return msg.get("result", {})

    def close(self) -> None:
        try:
            self.sock.close()
        except OSError:
            pass


def start_static_server(directory: str) -> tuple[http.server.ThreadingHTTPServer, int]:
    port = find_free_port()

    class QuietHandler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=directory, **kwargs)

        def log_message(self, format, *args):
            return

    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), QuietHandler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    return server, port


def wait_for_cdp_ws(debug_port: int, timeout_s: float = 15.0) -> str:
    deadline = time.time() + timeout_s
    url = f"http://127.0.0.1:{debug_port}/json/list"
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1.5) as resp:
                targets = json.loads(resp.read().decode("utf-8"))
                for target in targets:
                    if target.get("type") == "page" and "webSocketDebuggerUrl" in target:
                        return target["webSocketDebuggerUrl"]
        except Exception:
            time.sleep(0.15)
    raise TimeoutError("Timed out waiting for Chrome DevTools Protocol endpoint")


def png_to_jpg(png_bytes: bytes, out_jpg: str, quality: int = 92) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(out_jpg)), exist_ok=True)
    proc = subprocess.run(
        [
            "ffmpeg", "-y", "-f", "image2pipe", "-vcodec", "png", "-i", "-",
            "-frames:v", "1", "-q:v", str(max(2, round((100 - quality) / 3.2))), out_jpg,
        ],
        input=png_bytes,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=True,
    )
    _ = proc


def render_edition(edition: str, repo_root: str, base_dir: str, http_port: int, cdp: MinimalCDPClient) -> None:
    cfg = EDITIONS[edition]
    fps = cfg["fps"]
    total_frames = fps * cfg["duration"]
    width = cfg["width"]
    height = cfg["height"]
    stills_dir = os.path.join(base_dir, "preview_stills")
    os.makedirs(stills_dir, exist_ok=True)

    scene_url = f"http://127.0.0.1:{http_port}/promo-video/scene.html?edition={edition}"
    print(f"\n[render:{edition}] Loading {scene_url} ({cfg['duration']}s @ {fps}fps = {total_frames} frames)...")
    cdp.call("Page.navigate", {"url": scene_url})

    # Wait for scene JS + all luxury photographs + Google Fonts
    for _ in range(80):
        res = cdp.call(
            "Runtime.evaluate",
            {
                "expression": (
                    "typeof window.renderFrame === 'function' && "
                    "document.readyState === 'complete' && "
                    "Array.from(document.images).every(img => img.complete && img.naturalWidth > 0)"
                )
            },
        )
        if res.get("result", {}).get("value") is True:
            break
        time.sleep(0.12)

    cdp.call(
        "Runtime.evaluate",
        {
            "expression": "Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 4500))])",
            "awaitPromise": True,
        },
    )
    time.sleep(0.25)

    # Set up output encoding pipeline
    if edition == "gif":
        tmp_mp4 = os.path.join(base_dir, "_tmp_gif_master.mp4")
        ffmpeg_cmd = [
            "ffmpeg", "-y",
            "-f", "image2pipe", "-vcodec", "png", "-framerate", str(fps), "-i", "-",
            "-vf", "scale=960:540:flags=lanczos",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "12", "-preset", "fast",
            tmp_mp4,
        ]
        out_target = tmp_mp4
    else:
        audio_path = os.path.join(base_dir, cfg["audio"])
        out_target = (
            os.path.join(base_dir, "kanon-brand-film.mp4")
            if edition == "web"
            else os.path.join(repo_root, "docs", "assets", "kanon-github-film.mp4")
        )
        os.makedirs(os.path.dirname(out_target), exist_ok=True)
        ffmpeg_cmd = [
            "ffmpeg", "-y",
            "-f", "image2pipe", "-vcodec", "png", "-framerate", str(fps), "-i", "-",
            "-i", audio_path,
            "-c:v", "libx264", "-pix_fmt", "yuv420p",
            "-crf", "17", "-preset", "medium", "-profile:v", "high", "-level", "4.2",
            "-c:a", "aac", "-b:a", "256k", "-ar", "48000",
            "-shortest", "-movflags", "+faststart",
            out_target,
        ]

    ffmpeg_proc = subprocess.Popen(
        ffmpeg_cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )
    assert ffmpeg_proc.stdin is not None
    t0 = time.time()

    for frame in range(total_frames):
        cdp.call("Runtime.evaluate", {"expression": f"window.renderFrame({frame}, {total_frames})"})
        shot = cdp.call("Page.captureScreenshot", {"format": "png", "optimizeForSpeed": True})
        png_bytes = base64.b64decode(shot["data"])
        ffmpeg_proc.stdin.write(png_bytes)

        if frame in cfg["stills"]:
            with open(os.path.join(stills_dir, cfg["stills"][frame]), "wb") as sf:
                sf.write(png_bytes)
        if cfg["poster_frame"] is not None and frame == cfg["poster_frame"]:
            png_to_jpg(png_bytes, os.path.join(repo_root, "marketing", "assets", "film-poster.jpg"), quality=93)
        if cfg["preview_frame"] is not None and frame == cfg["preview_frame"] and edition == "web":
            png_to_jpg(png_bytes, os.path.join(repo_root, "docs", "assets", "film-preview.jpg"), quality=92)

        if (frame + 1) % max(40, fps * 3) == 0 or frame == total_frames - 1:
            elapsed = time.time() - t0
            print(
                f"[render:{edition}] Frame {frame + 1:4d}/{total_frames} "
                f"({(frame + 1)/total_frames*100:5.1f}%) — {elapsed:5.1f}s ({(frame + 1)/max(0.01, elapsed):.1f} fps)"
            )

    ffmpeg_proc.stdin.close()
    stderr_out = ffmpeg_proc.stderr.read().decode("utf-8", errors="replace") if ffmpeg_proc.stderr else ""
    ret = ffmpeg_proc.wait()
    if ret != 0:
        raise RuntimeError(f"FFmpeg ({edition}) exited with {ret}:\n{stderr_out[-1200:]}")

    if edition == "web":
        marketing_mp4 = os.path.join(repo_root, "marketing", "assets", "kanon-brand-film.mp4")
        shutil.copy2(out_target, marketing_mp4)
        print(f"[render:web] Synced flagship film -> {marketing_mp4} ({os.path.getsize(marketing_mp4)/(1024*1024):.2f} MB)")
    elif edition == "github":
        print(f"[render:github] Wrote GitHub cinema film -> {out_target} ({os.path.getsize(out_target)/(1024*1024):.2f} MB)")
    elif edition == "gif":
        out_gif = os.path.join(repo_root, "docs", "assets", "kanon-github-reel.gif")
        palette_png = os.path.join(base_dir, "_tmp_palette.png")
        # 2-pass ultra-clean luxury palette GIF kept comfortably under GitHub's 10MB Camo proxy limit.
        # Mild temporal denoise removes 3% film-grain shimmer that bloats GIF LZW while preserving razor UI text.
        for gif_w, gif_fps, max_colors, bayer in [
            (840, 14, 128, 5),
            (760, 12, 112, 5),
            (720, 11, 96, 5),
            (680, 10, 80, 5),
        ]:
            vf_base = f"fps={gif_fps},scale={gif_w}:-1:flags=lanczos,hqdn3d=1.8:1.8:5:5"
            subprocess.run(
                [
                    "ffmpeg", "-y", "-i", out_target,
                    "-vf", f"{vf_base},palettegen=max_colors={max_colors}:stats_mode=diff",
                    palette_png,
                ],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True,
            )
            subprocess.run(
                [
                    "ffmpeg", "-y", "-i", out_target, "-i", palette_png,
                    "-lavfi", f"{vf_base}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale={bayer}:diff_mode=rectangle",
                    "-loop", "0", out_gif,
                ],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True,
            )
            sz_mb = os.path.getsize(out_gif) / (1024 * 1024)
            print(f"[render:gif] Encoded {gif_w}px @ {gif_fps}fps ({max_colors} colors) -> {sz_mb:.2f} MB")
            if sz_mb <= 7.8:
                break
        for tmp_f in (out_target, palette_png):
            if os.path.exists(tmp_f):
                os.remove(tmp_f)


def render_stills_only(edition: str, repo_root: str, base_dir: str, http_port: int, cdp: MinimalCDPClient) -> None:
    cfg = EDITIONS[edition]
    total_frames = cfg["fps"] * cfg["duration"]
    stills_dir = os.path.join(base_dir, "preview_stills")
    os.makedirs(stills_dir, exist_ok=True)
    scene_url = f"http://127.0.0.1:{http_port}/promo-video/scene.html?edition={edition}"
    cdp.call("Page.navigate", {"url": scene_url})
    for _ in range(80):
        res = cdp.call(
            "Runtime.evaluate",
            {
                "expression": (
                    "typeof window.renderFrame === 'function' && "
                    "document.readyState === 'complete' && "
                    "Array.from(document.images).every(img => img.complete && img.naturalWidth > 0)"
                )
            },
        )
        if res.get("result", {}).get("value") is True:
            break
        time.sleep(0.12)
    cdp.call(
        "Runtime.evaluate",
        {
            "expression": "Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 4500))])",
            "awaitPromise": True,
        },
    )
    time.sleep(0.25)
    for frame, name in sorted(cfg["stills"].items()):
        cdp.call("Runtime.evaluate", {"expression": f"window.renderFrame({frame}, {total_frames})"})
        shot = cdp.call("Page.captureScreenshot", {"format": "png", "optimizeForSpeed": True})
        png_bytes = base64.b64decode(shot["data"])
        with open(os.path.join(stills_dir, name), "wb") as sf:
            sf.write(png_bytes)
        print(f"[stills:{edition}] Saved {name} (frame {frame})")


def main() -> None:
    base_dir = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.dirname(base_dir)
    audio_script = os.path.join(base_dir, "audio_synth.py")

    args = sys.argv[1:]
    stills_only = "--stills-only" in args
    args = [a for a in args if a != "--stills-only"]
    requested = args[0] if args else "all"
    targets = ["web", "github", "gif"] if requested == "all" else [requested]

    if not stills_only and ("web" in targets or "github" in targets):
        audio_arg = "all" if ("web" in targets and "github" in targets) else ("web" if "web" in targets else "github")
        print(f"[render] Synthesizing orchestral Canon soundtrack ({audio_arg})...")
        subprocess.run([sys.executable, audio_script, audio_arg], check=True)

    # Serve REPO ROOT so /marketing/assets/*.jpg and /promo-video/scene.html resolve cleanly
    server, http_port = start_static_server(repo_root)
    debug_port = find_free_port()
    chrome_bin = find_chrome_binary()
    user_data_dir = tempfile.mkdtemp(prefix="kanon-cdp-")

    chrome_proc = subprocess.Popen(
        [
            chrome_bin,
            "--headless=new",
            f"--remote-debugging-port={debug_port}",
            f"--user-data-dir={user_data_dir}",
            "--window-size=1920,1080",
            "--force-device-scale-factor=1",
            "--hide-scrollbars",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-background-timer-throttling",
            "--disable-renderer-backgrounding",
            "about:blank",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    cdp = None
    try:
        ws_url = wait_for_cdp_ws(debug_port)
        cdp = MinimalCDPClient(ws_url)
        cdp.call("Page.enable")
        cdp.call("Runtime.enable")
        cdp.call(
            "Emulation.setDeviceMetricsOverride",
            {"width": 1920, "height": 1080, "deviceScaleFactor": 1, "mobile": False},
        )
        for ed in targets:
            if stills_only:
                render_stills_only(ed, repo_root, base_dir, http_port, cdp)
            else:
                render_edition(ed, repo_root, base_dir, http_port, cdp)
    finally:
        if cdp is not None:
            cdp.close()
        if chrome_proc.poll() is None:
            chrome_proc.terminate()
            try:
                chrome_proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                chrome_proc.kill()
        server.shutdown()
        shutil.rmtree(user_data_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
