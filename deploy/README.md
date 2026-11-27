# KANON Production Infrastructure & Deployment Runbook

> Single source of truth for humans and AI agents operating `kanon.hk` (marketing) and `app.kanon.hk` (Next.js 16 app). Never commit secrets, `.env.local`, `.vercel/`, or credentials to this public repository.

## 1. Live Production Architecture (Active · Zero-ICP · Free Tier)

| Surface            | Live URL                                  | Host / Service                                                                       | Auto / CLI Deploy                                                                                                   |
| :----------------- | :---------------------------------------- | :----------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------ |
| **Marketing Site** | `https://kanon.hk` (`www.kanon.hk` → 301) | **GitHub Pages** (`https_enforced: true`)                                            | Automatic on push to `main` touching `marketing/` via `.github/workflows/deploy-marketing.yml`                      |
| **Main Web App**   | `https://app.kanon.hk`                    | **Vercel** (`kanon-app`, Root Dir: `apps/web`, Region: `sin1`, Node 22, pnpm 12.4.1) | `npx --yes vercel deploy --prod --yes --regions sin1` (run from **repo root**, never inside `apps/web`)             |
| **Database**       | Managed Cloud PostgreSQL                  | **Neon Postgres** (`kanon-db`, Singapore `sin1`, `free_v3` via Vercel Marketplace)   | Bound via Vercel `DATABASE_URL` (pooled app role) + `DATABASE_URL_MIGRATE` (direct owner URL for `pnpm db:migrate`) |

### DNS Records (Managed at Aliyun DNS for `kanon.hk`)

| Host  | Type            | Value                                                                      | Purpose                                |
| :---- | :-------------- | :------------------------------------------------------------------------- | :------------------------------------- |
| `@`   | `A` (4 records) | `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` | GitHub Pages apex (`kanon.hk`)         |
| `www` | `CNAME`         | `luvio-arlan.github.io`                                                    | GitHub Pages redirect (`www.kanon.hk`) |
| `app` | `CNAME`         | `6c6e804451f15b2a.vercel-dns-017.com`                                      | Vercel custom domain (`app.kanon.hk`)  |

## 2. Routine Operations & Verification

```bash
# 1. Apply expand-only migrations via direct (non-pooler) owner URL before deploy when KANON_RUNTIME_MIGRATIONS=off
DATABASE_URL_MIGRATE="<neon-direct-owner-url>" pnpm db:migrate

# 2. Deploy main app updates to https://app.kanon.hk (always run from repo root, pinned to sin1)
npx --yes vercel deploy --prod --yes --regions sin1

# 3. Trigger marketing site publish manually (normally automatic on git push main)
gh workflow run deploy-marketing.yml --ref main

# 4. Verify live production health & Neon Postgres engine ("postgres-external")
curl -sS https://app.kanon.hk/api/health
curl -sI https://kanon.hk/ | head -n 5

# 5. Manage Vercel environment variables (e.g. AI provider keys, KANON_RUNTIME_MIGRATIONS=off)
npx --yes vercel env ls
npx --yes vercel env add <KEY_NAME> production
```

### Monorepo Vercel Configuration Files

- `apps/web/vercel.json`: Monorepo install (`cd ../.. && pnpm install --frozen-lockfile`) and build (`cd ../.. && pnpm --filter @kanon/web build`).
- `.vercelignore`: Excludes `marketing/`, `promo-video/`, `deploy/`, `docs/`, `.data/` so CLI uploads stay < 1 MB.
- `packages/core/src/db/client.ts`: Uses `postgres(DATABASE_URL, { prepare: false })` for Neon PgBouncer transaction pooling (uses transactional `pg_advisory_xact_lock`, supports `KANON_RUNTIME_MIGRATIONS=off` returning `503` on pending migrations without running DDL, and `KANON_RLS_ENFORCE_LOCAL=1` `NOBYPASSRLS` local verification); falls back to local `.data/kanon-pg` (or `/tmp/kanon-pg` on Vercel when `DATABASE_URL` is unset).

## 3. Hard Operational Guardrails (Read Before Changing Infra)

1. **Never point `kanon.hk` to a Mainland China ECS**: `.hk` domains cannot obtain Mainland China ICP filing. Port 80 is blocked at the Aliyun gateway (`HTTP 403 Non-compliance ICP Filing`), which breaks direct browser entry and Let's Encrypt HTTP-01 renewal.
2. **Never run `next build` on <= 2 GiB RAM servers**: Building Next.js 16 + Turborepo on low-memory ECS instances causes swap thrashing / OOM. Always use Vercel cloud builds, or build locally and sync prebuilt artifacts via `deploy/push-to-ecs.sh` if migrating to a dedicated overseas VPS.
3. **Never pull prod `DATABASE_URL` into local `.env.local` by accident**: Local `pnpm dev` and `pnpm test` should run against embedded PGlite (`.data/kanon-pg` / in-memory) unless intentionally running against Neon.
4. **Keep `ssoProtection: null` on Vercel `kanon-app`**: Ensures public preview/prod testing works on mobile and desktop without hitting a Vercel login wall.

## 4. Optional Future Migration: Self-Hosted Overseas VPS (HK / SG / JP)

If scaling beyond Vercel Hobby or moving to a dedicated overseas Ubuntu 22.04/24.04 VPS (>= 4 GiB RAM):

- Pre-wired configs live in `deploy/Caddyfile` (automatic Let's Encrypt HTTPS + HTTP/3), `deploy/kanon-web.service` (systemd), `deploy/deploy.sh` (remote build), and `deploy/push-to-ecs.sh` (local build → rsync).
- Database migration is zero-lock-in: point `DATABASE_URL` to any standard PostgreSQL 16+ instance (or keep Neon Postgres directly).
