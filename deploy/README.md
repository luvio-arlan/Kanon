# KANON Production Server Deployment Guide (`kanon.hk` + `app.kanon.hk`)

Single-server production architecture serving both the static marketing site (`https://kanon.hk`) and the full Next.js 16 Investment Thesis OS (`https://app.kanon.hk`) behind Caddy with automatic Let's Encrypt HTTPS and HTTP/3.

## 1. DNS Records (Point to Your Server IPv4)

| Type | Name  | Value         |
| :--- | :---- | :------------ |
| `A`  | `@`   | `<SERVER_IP>` |
| `A`  | `www` | `<SERVER_IP>` |
| `A`  | `app` | `<SERVER_IP>` |

## 2. Initial Ubuntu 22.04 / 24.04 Bootstrap

```bash
# Install Node.js 22 + pnpm + Caddy
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git caddy
sudo corepack enable && sudo corepack prepare pnpm@12.4.1 --activate

# Clone repository into /srv/kanon
sudo mkdir -p /srv/kanon && sudo chown "$USER:$USER" /srv/kanon
git clone https://github.com/luvio-arlan/Kanon.git /srv/kanon
cd /srv/kanon

# Optional: configure DATABASE_URL or BYOK keys (.env.local)
cp .env.example .env.local

# Install, build & register systemd + Caddy
pnpm install --frozen-lockfile
pnpm build
sudo cp deploy/kanon-web.service /etc/systemd/system/kanon-web.service
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl daemon-reload
sudo systemctl enable --now kanon-web caddy
```

## 3. One-Command Future Updates

```bash
bash /srv/kanon/deploy/deploy.sh
```
