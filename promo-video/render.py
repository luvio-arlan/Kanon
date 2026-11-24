#!/usr/bin/env python3
"""
KANON (卡农) — 15.0s 1080p 60fps Programmatic Video Renderer.
Pure Python 3 stdlib (zero pip/npm dependencies).
Drives headless Chrome via raw Chrome DevTools Protocol (CDP) WebSocket,
steps `window.renderFrame(frame, 900)` deterministically for all 900 frames,
pipes lossless PNG frames into FFmpeg alongside `soundtrack.wav`, and outputs:
  - promo-video/kanon-launch-15s.mp4
  - marketing/assets/kanon-launch-15s.mp4 (auto-synced for the website theater)
  - promo-video/preview_stills/*.png (6 keyframe verification stills)
"""

from __future__ import annotations

import base64
import functools
import hashlib
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

FPS = 60
DURATION_SEC = 24
TOTAL_FRAMES = FPS * DURATION_SEC  # 1440 frames exact
WIDTH = 1920
HEIGHT = 1080

# Keyframe stills for visual QA across all 6 cinematic acts
PREVIEW_FRAMES = {
    120: "01_first_light_2.0s.png",
    240: "02_horizon_glide_4.0s.png",
    360: "03_conviction_composed_6.0s.png",
    615: "04_prism_refraction_10.25s.png",
    864: "05_matrix_3d_14.4s.png",
    1068: "06_vault_lock_17.8s.png",
    1335: "07_kanon_mark_22.25s.png",
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
            if opcode == 0x9:  # Ping -> Pong
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
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=directory)

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


def main() -> None:
    base_dir = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.dirname(base_dir)
    audio_path = os.path.join(base_dir, "soundtrack.wav")
    audio_script = os.path.join(base_dir, "audio_synth.py")
    out_mp4 = os.path.join(base_dir, "kanon-brand-film.mp4")
    marketing_mp4 = os.path.join(repo_root, "marketing", "assets", "kanon-brand-film.mp4")
    stills_dir = os.path.join(base_dir, "preview_stills")
    os.makedirs(stills_dir, exist_ok=True)

    # 1. Always re-synthesize soundtrack to stay locked to DURATION_SEC
    print("[render] Synthesizing 24.0s stereo Canon soundtrack...")
    subprocess.run([sys.executable, audio_script], check=True)

    # 2. Serve scene.html locally so fonts and assets resolve cleanly
    server, http_port = start_static_server(base_dir)
    debug_port = find_free_port()
    chrome_bin = find_chrome_binary()
    user_data_dir = tempfile.mkdtemp(prefix="kanon-cdp-")

    chrome_cmd = [
        chrome_bin,
        "--headless=new",
        f"--remote-debugging-port={debug_port}",
        f"--user-data-dir={user_data_dir}",
        f"--window-size={WIDTH},{HEIGHT}",
        "--force-device-scale-factor=1",
        "--hide-scrollbars",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-timer-throttling",
        "--disable-renderer-backgrounding",
        "about:blank",
    ]
    chrome_proc = subprocess.Popen(
        chrome_cmd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    ffmpeg_cmd = [
        "ffmpeg",
        "-y",
        "-f", "image2pipe",
        "-vcodec", "png",
        "-framerate", str(FPS),
        "-i", "-",
        "-i", audio_path,
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-crf", "15",
        "-preset", "medium",
        "-profile:v", "high",
        "-level", "4.2",
        "-c:a", "aac",
        "-b:a", "256k",
        "-ar", "48000",
        "-shortest",
        "-movflags", "+faststart",
        out_mp4,
    ]
    ffmpeg_proc = None
    cdp = None

    try:
        ws_url = wait_for_cdp_ws(debug_port)
        cdp = MinimalCDPClient(ws_url)
        cdp.call("Page.enable")
        cdp.call("Runtime.enable")
        cdp.call(
            "Emulation.setDeviceMetricsOverride",
            {
                "width": WIDTH,
                "height": HEIGHT,
                "deviceScaleFactor": 1,
                "mobile": False,
            },
        )
        scene_url = f"http://127.0.0.1:{http_port}/scene.html"
        print(f"[render] Loading {scene_url} in headless Chrome...")
        cdp.call("Page.navigate", {"url": scene_url})

        # Wait for window.renderFrame & webfonts
        for _ in range(60):
            res = cdp.call(
                "Runtime.evaluate",
                {"expression": "typeof window.renderFrame === 'function' && document.readyState === 'complete'"},
            )
            if res.get("result", {}).get("value") is True:
                break
            time.sleep(0.1)

        # Wait up to 3.5s for Google Fonts (Instrument Serif / JetBrains Mono / Noto Sans SC)
        cdp.call(
            "Runtime.evaluate",
            {
                "expression": "Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 3500))])",
                "awaitPromise": True,
            },
        )
        time.sleep(0.25)

        ffmpeg_proc = subprocess.Popen(
            ffmpeg_cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )

        t0 = time.time()
        print(f"[render] Rendering {TOTAL_FRAMES} deterministic frames ({WIDTH}x{HEIGHT} @ {FPS}fps)...")
        for frame in range(TOTAL_FRAMES):
            cdp.call(
                "Runtime.evaluate",
                {"expression": f"window.renderFrame({frame}, {TOTAL_FRAMES})"},
            )
            shot = cdp.call(
                "Page.captureScreenshot",
                {"format": "png", "optimizeForSpeed": True},
            )
            png_bytes = base64.b64decode(shot["data"])
            assert ffmpeg_proc.stdin is not None
            ffmpeg_proc.stdin.write(png_bytes)

            if frame in PREVIEW_FRAMES:
                still_path = os.path.join(stills_dir, PREVIEW_FRAMES[frame])
                with open(still_path, "wb") as sf:
                    sf.write(png_bytes)

            if (frame + 1) % 150 == 0 or frame == TOTAL_FRAMES - 1:
                elapsed = time.time() - t0
                fps_eff = (frame + 1) / max(0.01, elapsed)
                print(f"[render] Frame {frame + 1:3d}/{TOTAL_FRAMES} ({(frame + 1)/TOTAL_FRAMES*100:5.1f}%) — {elapsed:5.1f}s ({fps_eff:.1f} fps)")

        assert ffmpeg_proc.stdin is not None
        ffmpeg_proc.stdin.close()
        stderr_out = ffmpeg_proc.stderr.read().decode("utf-8", errors="replace") if ffmpeg_proc.stderr else ""
        ret = ffmpeg_proc.wait()
        if ret != 0:
            raise RuntimeError(f"FFmpeg exited with {ret}:\n{stderr_out[-1200:]}")

        # Sync rendered MP4 into marketing/assets/ so the website Launch Film Theater works out of the box
        if os.path.isdir(os.path.dirname(marketing_mp4)):
            shutil.copy2(out_mp4, marketing_mp4)
            print(f"[render] Synced launch film to {marketing_mp4}")

        size_mb = os.path.getsize(out_mp4) / (1024 * 1024)
        print(f"[render] DONE -> {out_mp4} ({size_mb:.2f} MB in {time.time() - t0:.1f}s)")

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
