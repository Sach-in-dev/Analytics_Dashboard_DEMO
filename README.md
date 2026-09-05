# Analytics Dashboard — DEMO Build

A fully isolated, fictional-data copy of the BeautyBarn Analytics Dashboard,
built for sales demos and screen recordings. The original project
(`../analytics-api`, `../analytics-ui`) is untouched — this folder is a
separate copy with its own database, its own containers, and its own ports.

## What's different from the original

- **Data source**: a brand-new local Postgres database (`analytics_demo_db`),
  seeded by `analytics-api-demo/seed_demo_data.py` with ~2.5 years
  (2024-01-01 → yesterday) of internally-consistent, entirely fictional
  data across all 61 analytics tables — orders, RFM/LTV/cohorts, UTM &
  channel attribution, RTO/returns/payments, inventory, reviews, CEO
  dashboard snapshots, etc. There is no connection to `PROD_DB`, and no
  real customer/order/vendor data anywhere in this folder.
- **External services**: Umami and Meta Ads credentials are left empty.
  The handful of endpoints that call those services live
  (`/meta-events` on the API, and the UI's `/api/analytics/umami/*`
  routes) are swapped in this copy to return generated fixture data
  instead of making any outbound call — see "Code changes" below.
- **Everything else** — UI, layout, components, styling, navigation, tabs,
  charts, filters, business formulas/calculations — is byte-for-byte the
  same code as the original project.

## Code changes made only in this copy

| File | Change |
|---|---|
| `analytics-api-demo/app/config.py` | Added `DEMO_MODE` setting (default `false`) |
| `analytics-api-demo/app/main.py` | Skips starting the cron scheduler when `DEMO_MODE=true` (nothing to sync from — no PROD_DB/Umami/Meta) |
| `analytics-api-demo/app/routers/meta_events.py` | Added a demo-data generator, used only when `DEMO_MODE=true`, instead of calling the live Meta Marketing API |
| `analytics-api-demo/app/models/analytics.py` | Fixed a latent bug in two JSONB `server_default` values (only surfaces on a from-scratch schema, never against the original's pre-existing dump); switched JSONB columns to a Postgres/SQLite-portable JSON type (`.with_variant`) so the same models work against either database, with zero behavior change on Postgres |
| `analytics-api-demo/app/routers/active_users.py`, `growth.py`, `products.py`, `inventory.py`, `searches.py`, `channel_roi.py`, `reviews.py` | Rewrote a handful of raw-SQL blocks that used Postgres-only syntax (`generate_series`, `TO_CHAR`, `::date` casts, `ARRAY_AGG`, `ILIKE`, `INTERVAL`, `gen_random_uuid()`) into dialect-portable SQL/Python — needed so the same backend also runs against SQLite for the Vercel build below. Also fixed a data-shape bug in the seed script's `new_vs_returning_data` that broke the Active Users tab regardless of database. |
| `analytics-ui-demo/src/app/api/analytics/umami/*/route.ts` (3 files) | Replaced live Umami calls with generated fixture data in the same response shape |
| `analytics-ui-demo/next.config.ts` | Rewrite destination now auto-switches to the bundled Python function (`/api/py/*`) when `VERCEL=1` is set; unchanged everywhere else |
| `analytics-api-demo/seed_demo_data.py` | **New file** — the demo data generator (works against either Postgres or SQLite) |
| `analytics-ui-demo/api/py/` | **New folder** — a self-contained copy of the API (app code + a pre-seeded SQLite snapshot, `demo.db`) packaged as a Vercel Python Function, for the frontend-only deploy path below |

No dashboard page, chart component, formula, or calculation was touched.

## Folder layout

```
Analytics_Dashboard_DEMO/
├── docker-compose.yml          # demo stack: db, redis, api, ui, seed (all isolated)
├── analytics-api-demo/         # copy of analytics-api + seed_demo_data.py (Postgres-backed)
└── analytics-ui-demo/          # copy of analytics-ui
    ├── vercel.json             # routes UI to @vercel/next, API to @vercel/python
    └── api/py/                 # self-contained FastAPI + bundled SQLite demo.db
```

## Deploying to Vercel (frontend-only — recommended for sending a client a link)

This is a **single Vercel project** — no separate database or backend service
to provision. The Python API runs as a Vercel Function reading from a
bundled, pre-seeded, **read-only** SQLite snapshot (`analytics-ui-demo/api/py/demo.db`,
~50MB) instead of a hosted Postgres. Same FastAPI code, same business logic —
only the SQL that was Postgres-specific was rewritten to be portable (see
table above); everything was re-verified against all 52 dashboard endpoints
after the switch.

1. Push `Analytics_Dashboard_DEMO/analytics-ui-demo/` to a Git repo (GitHub/GitLab/Bitbucket).
   - The repo will be ~55MB (mostly `api/py/demo.db`) — fine for a normal
     `git push`, just don't be surprised by the size.
2. In the Vercel dashboard: **New Project → Import** that repo.
   - Root Directory: the repo root (where `vercel.json` and `package.json` live).
   - No environment variables are required — `DEMO_MODE`, `ANALYTICS_DB`, etc.
     are all set inside `api/py/index.py` itself, and `next.config.ts`
     auto-detects Vercel via the `VERCEL` env var Vercel sets automatically.
3. Deploy. You'll get a URL like `your-project.vercel.app` — that's what you
   send the client. Demo login is the same: `demo@beautybarn.com` / `Demo@12345`.

**To regenerate the data** (new random seed, refreshed date range, etc.):
run `python3 seed_demo_data.py` again with `ANALYTICS_DB` pointed at a
`sqlite+aiosqlite:///...` path (see the SQLite section under Option B
below), copy the resulting file to `analytics-ui-demo/api/py/demo.db`,
commit, and redeploy.

**Not yet verified live**: the Vercel deployment itself — this was built
and tested as far as it's possible to without a Vercel account (production
Next.js build succeeds cleanly; the exact read-only SQLite connection mode
Vercel's filesystem requires was tested locally under a simulated
read-only filesystem and confirmed working end-to-end; all 52 backend
endpoints were swept against it with zero failures). The one thing that
can only be confirmed by an actual deploy is Vercel's own routing between
the Next.js build and the Python Function via `vercel.json` — if anything
doesn't wire up as expected on first deploy, the error will point at
`vercel.json`/`api/py/index.py` and should be a quick fix.

## Running the Docker/Postgres version instead

The original two-service (API + UI, each with their own DB/Redis)
Docker stack still works and stays useful for local iteration or if you'd
rather not touch Vercel at all.

### Option A — Docker

```bash
cd Analytics_Dashboard_DEMO
docker compose up -d db redis          # start the demo database + redis
docker compose --profile seed run --rm seed   # one-time: seed fictional data
docker compose up -d --build api ui    # build & start the API and UI
```

- UI: http://localhost:3010
- API docs: http://localhost:8010/docs
- Login: `demo@beautybarn.com` / `Demo@12345` (admin)
  or `viewer@beautybarn.com` / `Demo@12345` (limited permissions, for
  showing RBAC)

Re-run the seed step any time to reset/regenerate the data
(`docker compose --profile seed run --rm seed`) — it truncates and
regenerates deterministically, safe to re-run.

### Option B — Local (no Docker for the app, Docker only for Postgres/Redis)

```bash
cd Analytics_Dashboard_DEMO
docker compose up -d db redis

cd analytics-api-demo
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python3 seed_demo_data.py              # one-time seed
uvicorn app.main:app --port 8010       # API on :8010

# in another terminal
cd ../analytics-ui-demo
npm install
npm run build && PORT=3010 npm start   # or `npx next dev -p 3010` for dev mode
```

### Option C — Local against the SQLite snapshot (same data as the Vercel build)

No Docker at all — points straight at `api/py/demo.db`:

```bash
cd Analytics_Dashboard_DEMO/analytics-api-demo
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt aiosqlite

ANALYTICS_DB="sqlite+aiosqlite:///$(pwd)/../analytics-ui-demo/api/py/demo.db" \
PROD_DB="" DEMO_MODE=true \
uvicorn app.main:app --port 8010
```

Then run the UI as in Option B, with `API_URL=http://localhost:8010` in
`analytics-ui-demo/.env`.

## Ports (all separate from the original stack)

| Service | Demo port | Original port |
|---|---|---|
| UI | 3010 | 3000 |
| API | 8010 | 8000 |
| Postgres | 5544 | 5433 |
| Redis | 6390 | 6379 |

## Confirmed working

Verified in this session:

- **Docker/Postgres stack**: login, CEO Dashboard, Order Metrics,
  Products, Website Events (Umami replacement), Meta Pixel Events (Meta
  API replacement), Growth, Marketing Platforms, Geography Revenue — all
  render fully populated, realistic-looking data with no errors and no
  live external calls.
- **SQLite/Vercel build**: all 52 GET endpoints swept end-to-end (login,
  orders, carts, funnels, RFM/LTV/cohorts, coupons, products, inventory,
  searches, active users, engagement, UTM/attribution, channel/campaign/
  creative/audience/influencer, correlations, RTO/returns/delivery/
  failure zones/geography/courier/payment, CEO dashboard, growth, metric
  library, CLV, retention, reviews, meta events) — **all 200 OK**.
- **Read-only filesystem constraint**: the exact read-only SQLite URI
  mode (`file:...?mode=ro&uri=true`) was tested against a locally
  simulated read-only filesystem (matching Vercel's constraint) — server
  starts, `init_databases()` succeeds, all endpoints respond correctly.
- **Next.js production build**: succeeds cleanly, all 65 routes compile,
  no TypeScript or lint errors.

## Known limitations

- **Not verified live on Vercel** — everything up to the deploy button
  was tested locally; the actual `vercel.json` routing (Next.js build ↔
  Python Function) can only be confirmed by an actual deploy. See the
  "Deploying to Vercel" section above for the (small) list of things
  that would surface first if anything is off.
- **SQLite / Vercel demo is read-only** — `POST /channel-roi/spend` (the
  only user-writable endpoint in the app) will succeed at request-parsing
  but fail at commit-time on Vercel because the SQLite file is served
  read-only. Not a demo-facing issue (the demo user isn't asked to edit
  spend targets), but flagging it in case someone clicks it during a
  recording.
- Two Next.js API routes (`fix_imports.py`, `update_metadata.py` at the
  UI root) are leftover one-off dev scripts from the original project;
  they aren't run automatically and contain no secrets, but were left in
  for reference rather than removed.
- A pre-existing (not demo-related) React key-uniqueness console warning
  on the Customer LTV page was observed in dev mode — cosmetic only, not
  a data or rendering bug, present regardless of data source.
- The root project's `docker-compose.yml` (the **original**, not this
  demo one) has a production database URL and a Meta Ads access token
  committed in plaintext as default values. That file was intentionally
  left untouched per the "don't modify the original" instruction, but is
  worth rotating/removing from version control separately.
