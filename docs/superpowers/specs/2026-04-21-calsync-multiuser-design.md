# CalSync Multi-User — Design

**Date:** 2026-04-21
**Status:** Approved for implementation
**Owner:** Ryan Lobo

## Motivation

CalSync currently runs entirely in the browser: paste an `.ics` blob, get free slots, nothing persists past a refresh. The goal is to let friends sign in and use CalSync as a real service — their availability persists across sessions, stays in sync with their actual Google Calendar automatically, and the dashboard updates live without manual re-imports.

This combines the patterns from MPCS 51238 Assignment 3 (Clerk auth + Supabase + RLS) and Assignment 4 (Railway background worker + Supabase Realtime + monorepo).

## Goals

- Friends can sign in with one click and see their own availability.
- Availability auto-refreshes from Google Calendar without the user doing anything.
- Dashboard updates in real time when events change.
- No database-paste workflow; calendar source is the Google Calendar API.
- Ships as a working multi-service system deployable to Vercel + Railway.

## Non-goals (deferred)

- Group scheduling (shared availability, "find a time that works for everyone").
- Email/password or non-Google sign-in.
- Writing back to Google Calendar.
- Multiple calendar providers (Outlook, Apple).
- Calendly-style public scheduling links.

## Architecture

### Repo structure (bun workspaces monorepo)

```
calsync/
├── apps/
│   ├── web/        # Next.js 16 frontend (Vercel)
│   └── worker/     # Node.js poller (Railway)
├── packages/
│   └── shared/     # CalEvent/FreeSlot/Settings types + sync logic shared between web and worker
├── docs/
├── package.json    # workspaces: apps/*, packages/*
├── CLAUDE.md
└── AGENTS.md
```

### Runtime pieces

| Piece | Host | Role |
|---|---|---|
| Frontend | Vercel | Next.js UI. Reads events from Supabase, subscribes to Realtime, computes free slots client-side. |
| Worker | Railway | Long-lived Node process. Every 5 min, loops through connected users, refreshes their events. |
| Auth | Clerk | Sign-in with Google, Calendar scope granted at sign-in. Backend API issues current access tokens for the worker. |
| Database | Supabase | Postgres + Realtime + RLS. Stores `connected_calendars`, `events`, `user_settings`. |
| External | Google Calendar API | Source of truth for event data. |

### Data flow (new user)

```
1. Click "Sign in with Google"
2. Clerk OAuth: identity + https://www.googleapis.com/auth/calendar.readonly
3. Redirect back → signed in, Clerk stores refresh token
4. /onboard: GET /api/calendars/list
   → server reads Clerk access token, calls Google calendarList
   → user picks which calendars to sync
   → POST /api/calendars/select → insert rows in connected_calendars
   → POST /api/sync-now → immediate first sync for this user
5. /dashboard reads events from Supabase + subscribes to Realtime
6. Worker picks up this user on the next 5-min tick; subsequent changes flow in automatically
```

## Database schema

All tables have RLS enabled. Policy shape: `USING (auth.jwt() ->> 'sub' = user_id)` for SELECT/UPDATE/DELETE, `WITH CHECK` for INSERT. Clerk JWT template named `supabase` provides `sub` claim.

```sql
CREATE TABLE connected_calendars (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  google_calendar_id text NOT NULL,
  name text NOT NULL,
  color text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, google_calendar_id)
);

CREATE TABLE events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  google_calendar_id text NOT NULL,
  google_event_id text NOT NULL,
  title text NOT NULL DEFAULT '',
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, google_event_id)
);
CREATE INDEX events_user_start_idx ON events(user_id, start_at);

CREATE TABLE user_settings (
  user_id text PRIMARY KEY,
  working_hours_start text NOT NULL DEFAULT '09:00',
  working_hours_end text NOT NULL DEFAULT '17:00',
  buffer_minutes integer NOT NULL DEFAULT 15,
  meeting_length integer NOT NULL DEFAULT 30,
  platforms text[] NOT NULL DEFAULT ARRAY['calendly','when2meet'],
  timezone text NOT NULL DEFAULT 'America/Chicago',
  updated_at timestamptz DEFAULT now()
);
```

Realtime publication includes the `events` table. Frontend subscribes with filter `user_id=eq.<clerkUserId>`.

## Worker design

**Runtime:** Node.js long-lived process on Railway. `setInterval(tick, POLL_INTERVAL_MS)` where `POLL_INTERVAL_MS` defaults to 300000 (5 min) and is env-configurable.

**Per-tick algorithm:**
1. `SELECT DISTINCT user_id FROM connected_calendars` using Supabase service-role key.
2. For each user:
   a. `clerkClient.users.getUserOauthAccessToken(userId, 'google')` → current access token (Clerk auto-refreshes; verify exact provider slug against installed `@clerk/backend` version).
   b. `SELECT google_calendar_id FROM connected_calendars WHERE user_id = $1 AND enabled = true`.
   c. For each calendar: `GET https://www.googleapis.com/calendar/v3/calendars/{id}/events?timeMin=now&timeMax=now+30d&singleEvents=true&orderBy=startTime&maxResults=250`.
   d. Normalize Google events → `{ user_id, google_calendar_id, google_event_id, title, start_at, end_at }`.
   e. Upsert into `events` on conflict `(user_id, google_event_id)`.
   f. Delete rows where `user_id = $u AND google_calendar_id = $c AND start_at BETWEEN now AND now+30d AND google_event_id NOT IN (<fresh set>)`. Handles cancellations.
3. Log `poll_completed users=N events=M duration_ms=X` to stdout.

**Error handling:** per-user try/catch. If Clerk token retrieval fails for a user, log and skip that user this tick. If a Google API call rate-limits, log and skip that calendar this tick.

**Graceful shutdown:** SIGTERM handler clears the interval and waits for the in-flight tick to finish before exiting.

**Shared sync function:** The per-user sync logic lives in `packages/shared/src/sync.ts` so `/api/sync-now` on the frontend can call the exact same code for the immediate first sync.

## Frontend changes

### Moves
- Entire current `calsync/src/*` → `apps/web/src/*`
- `package.json` → `apps/web/package.json` (plus new workspace root `package.json`)

### Removals
- `src/app/import/` page (paste flow)
- `src/lib/ics-parser.ts`
- `src/context/AppContext.tsx` in-memory state (replaced by Supabase + Realtime)
- `CALENDAR_COLORS` assignment logic in context (moved to DB on calendar select)
- `addCalendar`, `removeCalendar`, `addEvents`, `clearEvents` actions (no manual event management)

### Additions
- `ClerkProvider` wrapping `layout.tsx`
- Supabase browser client with Clerk JWT integration (`auth.jwt() ->> 'sub'` = Clerk user id)
- `src/lib/supabase.ts` — browser client + server service client factory (saveur pattern)
- `src/app/sign-in/[[...rest]]/page.tsx` — Clerk SignIn component
- `src/app/onboard/page.tsx` — calendar picker (first sign-in)
- API routes:
  - `GET /api/calendars/list` — calls Google calendarList
  - `POST /api/calendars/select` — upserts into `connected_calendars`
  - `DELETE /api/calendars/[id]`
  - `POST /api/sync-now` — triggers one sync iteration for current user
  - `GET /api/settings` / `POST /api/settings`
- Nav gets `<Show when="signed-in">` / `<Show when="signed-out">` (saveur's Clerk v7 API)
- Middleware (`src/middleware.ts`) protects `/`, `/day/*`, `/review`, `/settings`, `/onboard`

### Reworked
- `AppContext` becomes a thin read layer: `useEvents()` (Supabase + Realtime subscription), `useSettings()` (SWR against `/api/settings`), `useFreeSlots()` (client-side derivation via existing `availability.ts`)
- Dashboard, `/day/[date]`, `/review` swap their data source from context state to these hooks

## UX flow

1. Visit `calsync.vercel.app`. Landing page pitches the tool and shows "Sign in with Google".
2. Clerk runs Google OAuth with scopes `openid email profile https://www.googleapis.com/auth/calendar.readonly`.
3. On successful sign-in, middleware checks: does the user have any rows in `connected_calendars`? No → redirect to `/onboard`. Yes → to `/`.
4. `/onboard` fetches calendar list, renders checkboxes for each calendar (primary checked by default). On "Continue", POST selections + call `/api/sync-now`, then redirect to `/`.
5. `/` dashboard reads events from Supabase, subscribes to Realtime, computes free slots. Shows week view with busy/free blocks.
6. User adjusts settings in `/settings` (persists via API). Reviews export in `/review`.
7. When their Google Calendar changes outside the app, worker catches the change within 5 min, upserts into `events`, Realtime pushes the update, dashboard rerenders without a refresh.

## Environment variables

### Frontend (Vercel)
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server routes only)
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`
- `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/`

### Worker (Railway)
- `CLERK_SECRET_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `POLL_INTERVAL_MS=300000`

## Clerk configuration (one-time manual)

1. In Clerk dashboard → Social Connections → Google → "Use custom credentials".
2. Add scope `https://www.googleapis.com/auth/calendar.readonly`.
3. JWT Templates → create `supabase` template with `{ "sub": "{{user.id}}" }` (for Supabase RLS).
4. Set Authorized redirect URIs to include Vercel prod + preview domains.

## Deployment

- **Vercel:** root directory = `apps/web`, framework preset = Next.js, install command = `bun install`, build command = `bun run build`.
- **Railway:** root directory = `apps/worker`, start command = `bun run start`, service type = long-running.
- **Supabase:** project already exists (from A3 pattern); add new tables via Supabase MCP migrations.

## Testing plan

- Local: run `bun dev` in `apps/web` and `bun dev` in `apps/worker` in two terminals. Sign in with a test Google account. Verify events flow in.
- Classmate test (A4 requirement): send Vercel URL to a classmate. Verify they can sign in, pick calendars, see their own events, and see RLS prevents them from seeing anyone else's.

## Open questions

None at time of writing. All scope decisions locked: per-user auth (not group scheduling), Google OAuth (not paste), single "Sign in with Google" flow (not two-step).
