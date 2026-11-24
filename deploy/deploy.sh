#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${KANON_DIR:-/srv/kanon}"
cd "$APP_DIR"

echo "[kanon-deploy] 1/4 Pulling latest main from origin..."
git pull --ff-only origin main

echo "[kanon-deploy] 2/4 Installing workspace dependencies..."
pnpm install --frozen-lockfile

echo "[kanon-deploy] 3/4 Building @kanon/web production bundle..."
pnpm build

echo "[kanon-deploy] 4/4 Reloading systemd & Caddy..."
if command -v systemctl >/dev/null 2>&1; then
  sudo cp "$APP_DIR/deploy/Caddyfile" /etc/caddy/Caddyfile
  sudo systemctl restart kanon-web
  sudo systemctl reload caddy
fi

echo "[kanon-deploy] Verifying local app health..."
sleep 2
curl -fsS http://127.0.0.1:3000/api/health && echo ""
echo "[kanon-deploy] Deployment complete -> https://kanon.hk & https://app.kanon.hk"
