<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

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
2. First-time users land on `/onboard`, pick which Google calendars to sync.
3. `/api/sync-now` triggers an immediate first sync for that user (shared `syncUser`).
4. Worker polls every 5 minutes, refreshes events for every connected user.
5. Frontend subscribes to Supabase Realtime on `events` (filtered to user). Dashboard recomputes free slots client-side when events change.

## Supabase tables (all RLS'd on Clerk `sub`)
- `connected_calendars` — opted-in Google calendars
- `events` — normalized event rows (Realtime-enabled)
- `user_settings` — per-user working hours, buffer, etc.

Reference SQL: `supabase/migrations/0001_multiuser_schema.sql`.

## Key surfaces
- **Pages (apps/web):** `/`, `/sign-in/[[...rest]]`, `/onboard`, `/day/[date]`, `/review`, `/settings`
- **API routes (apps/web):** `/api/calendars/{list,select,[id]}`, `/api/sync-now`, `/api/settings`, `/api/when2meet`
- **Worker:** `apps/worker/src/index.ts` — `setInterval(tick, POLL_INTERVAL_MS)` loop calling `syncUser` per user
- **Shared:** `packages/shared/src/` — types, `google-calendar.ts`, `sync.ts`

## Tech stack
- Next.js 16 App Router + React 19 + TypeScript + Tailwind v4
- Clerk v7 (auth + Google OAuth Calendar scope + `supabase` JWT template)
- Supabase (Postgres + Realtime + RLS)
- `googleapis`, `@clerk/backend`
- `bun` as package manager and worker runtime

## Local dev
```bash
bun install
bun --cwd apps/web dev     # :3000
bun --cwd apps/worker dev
```

Env vars: `apps/web/.env.local`, `apps/worker/.env.local` (see `.env.local.example` in each).

## Deployment
- **Frontend:** Vercel, root `apps/web`
- **Worker:** Railway, root `apps/worker`
- **Supabase + Clerk:** shared via env vars

## Clerk setup notes
- Google social connection uses custom credentials (own Google Cloud OAuth client)
- Extra scope: `https://www.googleapis.com/auth/calendar.readonly`
- JWT template `supabase` (default RS256, verified via JWKS in Supabase)
- Supabase Auth → third-party provider: Clerk (issuer = Clerk frontend domain)

## After every code change
Commit and push so Vercel auto-deploys. Worker redeploys from Railway's GitHub integration. (Commits are typically batched at session end per the MPCS workflow rule.)
