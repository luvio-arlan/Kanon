#!/usr/bin/env bash
# KANON Zero-Build-RAM Production Deploy Script (Local Build -> Incremental Rsync -> ECS Reload)
# Protects low-RAM servers (e.g. 1.6GB ECS shared with other live services) from ever running next build on-box.
set -euo pipefail

SSH_HOST="${KANON_SSH_HOST:-talent-ecs}"
REMOTE_DIR="${KANON_REMOTE_DIR:-/srv/kanon}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT_DIR"

echo "[kanon-ecs] 1/5 Building @kanon/web locally (zero build RAM on ECS)..."
pnpm build

echo "[kanon-ecs] 2/5 Syncing static marketing site -> $SSH_HOST:$REMOTE_DIR/marketing/ ..."
ssh "$SSH_HOST" "mkdir -p '$REMOTE_DIR/marketing' '$REMOTE_DIR/apps/web' '$REMOTE_DIR/packages' '$REMOTE_DIR/deploy'"
rsync -az --delete "$ROOT_DIR/marketing/" "$SSH_HOST:$REMOTE_DIR/marketing/"

echo "[kanon-ecs] 3/5 Syncing prebuilt .next bundle & workspace manifests..."
rsync -az --delete \
  --exclude 'cache' \
  --exclude 'trace' \
  "$ROOT_DIR/apps/web/.next/" "$SSH_HOST:$REMOTE_DIR/apps/web/.next/"
rsync -az \
  "$ROOT_DIR/package.json" \
  "$ROOT_DIR/pnpm-lock.yaml" \
  "$ROOT_DIR/pnpm-workspace.yaml" \
  "$ROOT_DIR/tsconfig.base.json" \
  "$ROOT_DIR/turbo.json" \
  "$SSH_HOST:$REMOTE_DIR/"
rsync -az \
  "$ROOT_DIR/apps/web/package.json" \
  "$ROOT_DIR/apps/web/next.config.ts" \
  "$SSH_HOST:$REMOTE_DIR/apps/web/"
rsync -az --delete \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude '.turbo' \
  "$ROOT_DIR/packages/" "$SSH_HOST:$REMOTE_DIR/packages/"
rsync -az "$ROOT_DIR/deploy/" "$SSH_HOST:$REMOTE_DIR/deploy/"

echo "[kanon-ecs] 4/5 Installing runtime deps gently on ECS & restarting kanon-web..."
ssh "$SSH_HOST" "
set -euo pipefail
export PATH=\"/usr/local/bin:\$(npm prefix -g)/bin:\$PATH\"
cd '$REMOTE_DIR'
nice -n 19 ionice -c 3 pnpm install --frozen-lockfile --network-concurrency=1 --child-concurrency=1 --fetch-timeout=180000 --registry=https://registry.npmmirror.com
cp '$REMOTE_DIR/deploy/kanon-web.service' /etc/systemd/system/kanon-web.service
systemctl daemon-reload
systemctl enable --now kanon-web
systemctl restart kanon-web
"

echo "[kanon-ecs] 5/5 Verifying health endpoints..."
sleep 3
ssh "$SSH_HOST" "curl -fsS http://127.0.0.1:3200/api/health && echo ''"
curl -fsS -I https://kanon.hk | head -n 4
curl -fsS -I https://app.kanon.hk | head -n 4
echo "[kanon-ecs] Live -> https://kanon.hk & https://app.kanon.hk"
