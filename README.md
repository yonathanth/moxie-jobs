# Meklit Jobs (Ethiopia)

Jobs from Ethiopia's Telegram job channels and websites, matched to each user's profession, degree, experience and city, delivered as Telegram bot messages and shown in a Telegram Mini App.

| Path | What |
|---|---|
| `apps/api` | NestJS API + Telegram bot (`@gomoxiebot`) |
| `apps/web` | Next.js public site + Mini App (`/app`) |
| `packages/db` | Prisma schema, migrations, taxonomy seed |
| `packages/shared` | Shared enums, schemas, DTO types |

## Local development

Requirements: Node 22+, pnpm 10.

```bash
pnpm install
cp .env.example .env                       # fill in DB URLs, bot token, JWT_SECRET
cp apps/web/.env.example apps/web/.env.local
pnpm --filter @ethio/shared build && pnpm --filter @ethio/db build
pnpm db:migrate:deploy && pnpm db:seed     # first time on a new database
pnpm dev                                   # API :4000 (bot in polling mode) + web :3000
```

- **Without Telegram:** open http://localhost:3000/app (dev login, `ALLOW_DEV_AUTH=true` + `NEXT_PUBLIC_DEV_AUTH=true`).
- **Inside Telegram:** Mini Apps need https. Run `cloudflared tunnel --url http://localhost:3000`, set `WEB_APP_URL` to the tunnel URL, add it to `CORS_ORIGINS`, and point `NEXT_PUBLIC_API_URL` at a second tunnel for :4000. Restart the API; the bot's menu button then opens the Mini App.

## Checks

```bash
pnpm typecheck
pnpm test
pnpm build
```

## Production

- **API + bot** on the VPS: `docker compose up -d --build`, behind a TLS reverse proxy (Caddy/Nginx) at e.g. `api.job.gomoxie.app`. Set `NODE_ENV=production`, `BOT_MODE=webhook`, `TELEGRAM_WEBHOOK_SECRET`, `ALLOW_DEV_AUTH=false`, https `PUBLIC_API_URL`/`WEB_APP_URL`. The API registers the webhook on start.
- **Migrations:** `docker compose run --rm migrate`.
- **Web** on Vercel (root directory `apps/web`) at `job.gomoxie.app`, with `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_BOT_USERNAME`.
- In @BotFather, set the Mini App / menu button domain to `job.gomoxie.app`.
