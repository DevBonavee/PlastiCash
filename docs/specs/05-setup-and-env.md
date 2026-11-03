# 05 — Setup, accounts, env vars, deploy

## Accounts to create (Kenzy does this before Claude Code starts)

| Service | What to get | Notes |
|---|---|---|
| GitHub | New repo `plasticash` | Push the docs folder first |
| Supabase | New project (region close to Nigeria, e.g. EU) | Copy Project URL, anon/publishable key, service role key, database connection string. Auth → Email provider on. |
| Paystack | Account in **test mode** | Copy test secret key. Set the test webhook URL once the API is deployed. Check the transfers settings: API transfers may need the "OTP for transfers" setting turned off to go through automatically. |
| Cloudinary | Free account | Cloud name, API key, API secret |
| Resend | Account + verified sending domain | API key for guardian consent and marketing emails (added 3 Nov 2026) |
| PostHog | EU cloud project (optional) | Project key for analytics after cookie consent (added 3 Nov 2026) |
| Termii | Account | API key; request a sender ID (e.g. "EcoCyclers"), which needs approval and can take time, so apply early |
| Vercel | Account linked to GitHub | For `web/` |
| Render | Account linked to GitHub | For `api/` (Docker web service) |
| cron-job.org or GitHub Actions | Free scheduled call | Calls `/jobs/reminders` every 15 min |

Free tiers to know about: Supabase pauses inactive free projects, and Render's free service sleeps when idle (the first request is slow). Wake both up before the demo.

## Env vars

`api/.env` (never committed; add `api/.env.example` with empty values):

```
DATABASE_URL=postgresql+asyncpg://...        # Supabase connection string (session pooler port 5432, or direct)
TEST_DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5433/plasticash_test
DB_POOL_SIZE=5                                # optional; pool + overflow must stay under the
DB_MAX_OVERFLOW=5                             # Supabase session pooler limit (15 clients)
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_JWT_SECRET=                          # only if the project uses legacy HS256 JWTs; else JWKS is used
SUPABASE_SERVICE_ROLE_KEY=                    # server only: creating collector accounts
PAYSTACK_SECRET_KEY=sk_test_...
PAYSTACK_FAKE_TRANSFERS=false  # local testing only: approve = PAID without Paystack; refused with sk_live_
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
TERMII_API_KEY=
TERMII_SENDER_ID=
TERMII_BASE_URL=                              # from your Termii dashboard
OTP_SECRET=                                   # random 32+ chars
CRON_SECRET=                                  # random 32+ chars
FRONTEND_ORIGIN=http://localhost:3000         # CORS; the Vercel URL in production
MIN_WITHDRAWAL_KOBO=500000
DOOR_MIN_KG=50
AUTO_CONFIRM_HOURS=48
SMS_ENABLED=false                             # true only when Termii is ready; when false, log "SMS would send" without the code
RESEND_API_KEY=                               # Resend (email, added 3 Nov 2026); empty = log "email would send" without the content
EMAIL_FROM=PlastiCash <hello@plasticash.app>  # sender on a domain verified in Resend
SITE_URL=http://localhost:3000                # public web address for links in emails and SMS (guardian consent, unsubscribe)
API_PUBLIC_URL=http://localhost:8000/api/v1   # this API's public URL, for the one-click List-Unsubscribe header
HUB_ADDRESS=21A Off Umuawulu, by Ugwuaji, Enugu/PH Expressway, Enugu   # sender address in marketing emails
```

`web/.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=
NEXT_PUBLIC_HUB_ADDRESS=
NEXT_PUBLIC_WHATSAPP_NUMBER=234...
NEXT_PUBLIC_POSTHOG_KEY=                      # PostHog project key; empty = analytics off (added 3 Nov 2026)
NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com
```

Analytics (PostHog, EU cloud) loads only after the visitor accepts analytics in the cookie banner (`pc_consent` cookie,
12 months), never on `/collector` or `/ops-portal`. Session recordings need their own "Session recordings" consent;
inputs and text are masked, and nothing is recorded on `/app/wallet`, `/app/settings`, `/collector` or `/ops-portal`.
Events: page views, `signup_completed`, `pickup_requested`, `pickup_confirmed`, `pickup_disputed`,
`withdrawal_requested`, `pwa_installed`, identified by the Supabase user id only. Set the key in Vercel to turn it on; the CSP then
allows the PostHog hosts.

The service role key, Paystack secret and Cloudinary secret must **never** appear in `web/`.

## Local development

1. Install: Node 20+, Python 3.12, Docker Desktop, Git.
2. `docker compose up -d db-test` (Postgres 16 on port 5433 for tests).
3. API: `cd api && python -m venv .venv && pip install -r requirements.txt && alembic upgrade head && python -m scripts.seed && uvicorn app.main:app --reload`
4. Web: `cd web && npm install && npm run dev`
5. Paystack webhooks locally: expose the API with a tunnel (e.g. ngrok) and set that URL as the test webhook in the Paystack dashboard.

## Docker

`api/Dockerfile`: `python:3.12-slim`, install WeasyPrint's system libraries (Pango, HarfBuzz, fonts) with apt, then pip install, run `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.

`docker-compose.yml`: `api` (built from `api/`) and `db-test` (postgres:16).

## Deploy

- **API → Render**: Docker web service from `api/` (`render.yaml`), env vars set in the dashboard, health check `/api/v1/health`. On the free plan (no pre-deploy step) `RUN_MIGRATIONS=1` runs `alembic upgrade head` when the container starts; on a paid plan it can move to the pre-deploy command. Step by step: `docs/DEPLOY.md`.
- **Web → Vercel**: root `web/`, env vars set, `NEXT_PUBLIC_API_URL` = Render URL.
- **Paystack**: test webhook URL = `https://<render-url>/api/v1/webhooks/paystack`.
- **Cron**: POST `https://<render-url>/api/v1/jobs/reminders` every 15 min with header `X-Cron-Secret` (GitHub Actions: `.github/workflows/reminders.yml`).
- Set `FRONTEND_ORIGIN` on the API to the Vercel URL.

## PWA (installable app, added 3 Nov 2026)

- Packages in `web/`: `@serwist/turbopack` and `serwist` 9.5.13 (service worker), `esbuild` 0.28.2 (bundles
  `app/sw.ts` at build time), `sharp` 0.35.5 (dev, icons). No new env vars; the worker reads `NEXT_PUBLIC_API_URL`.
- The service worker only runs in production builds: test with `npm run build && npm run start`, not `npm run dev`.
  The admin "Turn on notifications" button still registers it when used.
- Icons: after a logo change run `node scripts/make-icons.mjs` (writes `public/icons/`).
- `/serwist/sw.js` is sent with `Cache-Control: no-cache` so fixes reach phones at once.
- Check: Chrome DevTools → Application → Manifest (no errors, maskable icon) and Service workers (activated);
  Cache Storage should hold only `serwist-precache-*`, `public-pages` and `static-images`.

## Google sign-in (Supabase Auth)

The login and sign-up pages have "Continue with Google". Until it is switched on, the button says so and nothing else happens.

1. Google Cloud Console → APIs & Services → OAuth consent screen: app name PlastiCash, support email, the `email` and `profile` scopes; publish it (or add test users).
2. Credentials → Create credentials → OAuth client ID → Web application.
   - Authorised JavaScript origins: `http://localhost:3001` and the Vercel URL.
   - Authorised redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback` (Supabase shows the exact one on the Google provider page).
3. Supabase → Authentication → Sign In / Providers → Google: enable, paste the client ID and client secret, save.
4. Supabase → Authentication → URL Configuration → Redirect URLs: add `http://localhost:3001/auth/callback` and `https://<vercel-url>/auth/callback`.

A new Google user lands on sign-up step 2 (Individual or Organization) with their name filled in; the API takes the email from the Google-backed token as usual.

## Redis (rate limits and caches)

- Local: `docker compose up -d redis` and `REDIS_URL=redis://127.0.0.1:6379/0` in `api/.env`. Empty `REDIS_URL` turns it off; the API works the same without limits or caches.
- Production: Render Key Value `plasticash-redis` (free, Frankfurt, internal only) from `render.yaml`; `REDIS_URL` is filled in by Render. `TRUST_PROXY=true` so the per-IP limit sees the caller's IP.
- Limits (per signed-in user unless noted): create profile 10/h, bank check 10/h, bank save 5/h, withdrawal 5/h, pickup request 10/day, photo upload 30/h, confirm 30/h, dispute 10/h, collector code 20/10 min, code resend 10/h, phone lookup 60/h, create collector 20/h, public estimate 120/10 min per IP. Over the limit: 429 `RATE_LIMITED` with `Retry-After`.
- Caches: current prices (10 min; cleared when an admin adds a price), impact totals (5 min), Paystack bank list (1 day).

