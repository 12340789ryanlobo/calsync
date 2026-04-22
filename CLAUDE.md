# CalSync — Calendar Availability Tool

## What it does
CalSync connects to your Google Calendar, keeps your events in sync via a background worker, and auto-generates availability for scheduling tools like Calendly and When2Meet. Friends sign in with Google once, pick which calendars to watch, and their dashboard stays live without manual refreshes.

## Architecture (bun-workspaces monorepo)

```
calsync/
├── apps/
│   ├── web/        Next.js 16 frontend on Vercel
│   └── worker/     Node polling loop on Railway
├── packages/
│   └── shared/     types + Google fetch + syncUser (used by both web and worker)
├── supabase/
│   └── migrations/ reference SQL of the live schema
```

## Data flow
1. User signs in with Google via Clerk. Calendar scope (`calendar.readonly`) granted at sign-in.
2. First-time users land on `/onboard`, see a checklist of their Google calendars, pick which ones to sync.
3. `/api/sync-now` triggers an immediate first sync for that user (shared `syncUser` function).
4. Worker polls every 5 minutes from then on, refreshes events for every connected user.
5. Frontend subscribes to Supabase Realtime on the `events` table (filtered to the user). Dashboard recomputes free slots client-side whenever events change.

## Supabase tables (all RLS'd on Clerk `sub` claim)
- `connected_calendars` — user's opted-in Google calendars `(id, user_id, google_calendar_id, name, color, enabled, created_at)`
- `events` — normalized event rows `(id, user_id, google_calendar_id, google_event_id, title, start_at, end_at, updated_at)` — Realtime-enabled
- `user_settings` — per-user working hours, buffer, meeting length, platforms, timezone

Reference SQL in `supabase/migrations/0001_multiuser_schema.sql`.

## Key pages (apps/web)
- `/` — Dashboard: week view with busy/free blocks. Server Component checks `connected_calendars`, redirects new users to `/onboard`, else renders `DashboardClient`.
- `/sign-in/[[...rest]]` — Clerk sign-in with Google
- `/onboard` — Calendar picker for first-time users
- `/day/[date]` — Day detail with slot overrides (local state)
- `/review` — Export preview (Calendly / When2Meet strings)
- `/settings` — Working hours, buffer, meeting length (persists via `/api/settings`)

## API routes (apps/web)
- `GET /api/calendars/list` — calls Google calendarList via Clerk-issued access token
- `POST /api/calendars/select` — upsert `connected_calendars` rows
- `DELETE /api/calendars/[id]` — disconnect a calendar
- `POST /api/sync-now` — run one sync iteration for the current user (shared `syncUser`)
- `GET /api/settings` / `POST /api/settings` — user settings CRUD
- `POST /api/when2meet` — When2Meet auto-fill helper (legacy, used by `/review`)

## Worker (apps/worker)
Long-lived Node process. `setInterval(tick, POLL_INTERVAL_MS)` where the default is 300000 (5 min). Each tick:
1. Distinct `user_id` from `connected_calendars` (service role).
2. For each user: `clerkClient.users.getUserOauthAccessToken(userId, "google")` → current Google access token (Clerk auto-refreshes).
3. For each enabled calendar: fetch events in `now..now+30d`, upsert into `events`, delete events in that window not in the fresh set (handles cancellations).
4. Structured log line per tick; per-user errors logged but don't abort the tick.
5. SIGTERM handler waits for in-flight tick before exiting.

Shared sync function lives in `packages/shared/src/sync.ts` so `/api/sync-now` reuses the same code for immediate first sync.

## Tech stack
- Next.js 16 App Router + React 19 + TypeScript + Tailwind v4
- Clerk v7 (auth + Google OAuth w/ Calendar scope + JWT template for Supabase)
- Supabase (Postgres + Realtime + RLS)
- `googleapis` (Google Calendar API)
- `@clerk/backend` (worker-side token retrieval)
- `bun` as package manager and worker runtime

## Local dev
```bash
bun install
# In two terminals:
bun --cwd apps/web dev     # Next.js on :3000
bun --cwd apps/worker dev  # polling loop
```

Env vars live in `apps/web/.env.local` and `apps/worker/.env.local` (examples at `.env.local.example` in each app).

## Deployment
- **Frontend:** Vercel with root directory `apps/web`, framework preset Next.js, `bun install` / `bun run build`.
- **Worker:** Railway with root directory `apps/worker`, start command `bun run start`.
- **Supabase + Clerk:** shared across both environments via env vars.

## Clerk configuration (one-time)
- Google social connection with custom credentials (Google Cloud OAuth client)
- Scope `https://www.googleapis.com/auth/calendar.readonly`
- JWT template named `supabase` (uses Clerk's default RS256 signing; Supabase validates via JWKS)
- Supabase: Clerk registered as third-party auth provider → trusts Clerk-issued JWTs

## After every code change
Commit and push to GitHub so Vercel auto-deploys the frontend. Worker redeploys automatically from Railway's GitHub integration. (Note: commits are typically batched at the end of a working session per the maintainer's MPCS workflow rule.)
