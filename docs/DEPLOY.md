# Deploying Meklit Jobs (server names keep the moxie-jobs prefix)

Same route as GoMoxie: a push to `main` runs `.github/workflows/main.yml`, which SSHes into the VPS,
fetches the code into `~/apps/moxie-jobs`, builds it, applies migrations and restarts pm2
(`ecosystem.config.cjs`).

| Process | Port | Address |
|---|---|---|
| `moxie-jobs-api` (API + bot webhook + payments) | 4040 | https://jobs-api.gomoxie.app |
| `moxie-jobs-web` (Mini App + landing) | 3003 | https://jobs.gomoxie.app |
| `moxie-jobs-worker` (channel listener, extraction, delivery) | none | exactly one instance |
| GoMoxie backend (CV engine, partner API) | 4030 | called on localhost |

## One-time setup

1. **GitHub secrets** (repo → Settings → Secrets → Actions): `HOST`, `USERNAME`, `PRIVATE_KEY`, `SSH_PORT`, the same values as GoMoxie's repos.
2. **Server `.env`**: `~/apps/moxie-jobs/.env`, from `.env.production.example`. The first deploy stops with a clear message if it's missing.
3. **GoMoxie `.env`** on the server: add `PARTNER_API_KEYS=moxiejobs:<secret>` (same secret as `GOMOXIE_PARTNER_KEY`), then `pm2 restart gomoxie-backend --update-env`.
4. **Cloudflare DNS**: `A jobs` and `A jobs-api` → the VPS IP (proxied).
5. **Nginx** (`/etc/nginx/sites-available/moxie-jobs`, then link into `sites-enabled`, `nginx -t`, reload):

```nginx
server {
  server_name jobs.gomoxie.app;
  location / {
    proxy_pass http://127.0.0.1:3003;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
server {
  server_name jobs-api.gomoxie.app;
  client_max_body_size 12m;   # CV uploads (10 MB)
  location / {
    proxy_pass http://127.0.0.1:4040;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 120s;  # CV generation can take ~30s
  }
}
```
   SSL: the same way as GoMoxie's sites (`certbot --nginx -d jobs.gomoxie.app -d jobs-api.gomoxie.app`, or a Cloudflare origin certificate).

6. **Telegram session for the worker** (after the first deploy):
   `cd ~/apps/moxie-jobs/apps/worker && npx pnpm@10.13.1 tg:login`, then put the printed session in `TG_SESSION` and `pm2 restart moxie-jobs-worker --update-env`.

The API registers the bot's webhook, commands and menu button itself at startup.

## Local development after launch

Your laptop must never use the production bot token: local dev runs the bot in polling mode, which
deletes the production webhook. Use a separate dev bot (BotFather) and a Neon dev branch in your local `.env`.

## Everyday

- Deploy: push to `main`.
- Logs: `pm2 logs moxie-jobs-api` (or `-worker`, `-web`).
- New migration: commit it in `packages/db/prisma/migrations`; the deploy applies it.
