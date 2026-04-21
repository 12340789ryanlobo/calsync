# CalSync Multi-User Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn CalSync from a client-only paste-based tool into a deployable multi-user service where friends sign in with Google, pick calendars, and see auto-refreshing availability powered by a Railway worker and Supabase Realtime.

**Architecture:** Bun-workspaces monorepo with `apps/web` (Next.js on Vercel), `apps/worker` (Node polling loop on Railway), `packages/shared` (types + sync logic). Clerk handles auth including Google Calendar OAuth scope. Supabase stores `connected_calendars`, `events`, `user_settings` with RLS on Clerk `sub`. Worker uses Clerk's backend SDK to fetch live Google access tokens; frontend uses Supabase Realtime on the `events` table.

**Tech Stack:** Next.js 16 / React 19, Clerk v7, Supabase (Postgres + Realtime), `googleapis` npm package, TypeScript, Tailwind v4, bun workspaces.

**Reference spec:** `docs/superpowers/specs/2026-04-21-calsync-multiuser-design.md`

---

## Pre-flight: manual external setup

These are one-time config steps the human must do before Phase 0. The plan assumes they're done.

- [ ] **Clerk dashboard:** Create a Clerk app (or reuse from A3). Social Connections → Google → enable **Use custom credentials** → add scope `https://www.googleapis.com/auth/calendar.readonly`. Copy publishable + secret keys.
- [ ] **Clerk JWT template:** Dashboard → JWT Templates → New template → name `supabase` → claims: `{ "sub": "{{user.id}}" }` → signing algorithm RS256. Copy the JWKS URL.
- [ ] **Supabase project:** Create one (or reuse). Settings → API → copy URL + anon key + service role key. Auth → JWT Settings → paste Clerk's JWKS URL under "JWT Keys" so Supabase validates Clerk-issued JWTs. (Supabase now supports third-party auth — pick "Clerk" from the presets if available.)
- [ ] **Google Cloud:** Create project. Enable Google Calendar API. OAuth consent screen → External → Testing mode. Add test users (friends' emails). Create OAuth client (Web application) with redirect URI matching Clerk's callback (Clerk dashboard shows the exact URL — something like `https://<your-clerk>.clerk.accounts.dev/v1/oauth_callback`). Copy client ID + secret into Clerk's Google social connection config.
- [ ] **Railway account** with GitHub integration set up (so the worker can deploy from the repo).

---

## Phase 0: Monorepo restructure

### Task 1: Convert repo to bun workspace

**Files:**
- Create: `package.json` (new root)
- Create: `apps/web/` (move existing Next.js app here)
- Move: everything currently at repo root → `apps/web/`

- [ ] **Step 1: Move existing app into `apps/web/`**

```bash
cd /Users/rlobo/Documents/UChicago/Classes/Fourth-year/Spring2026/MPCS51238\ DBS/Assignments/Assignment2/calsync
mkdir -p apps/web
# Move source-tree files (not docs, not .git)
git mv src apps/web/src
git mv public apps/web/public
git mv tests apps/web/tests
git mv next.config.ts apps/web/next.config.ts
git mv tsconfig.json apps/web/tsconfig.json
git mv postcss.config.mjs apps/web/postcss.config.mjs
git mv eslint.config.mjs apps/web/eslint.config.mjs
git mv next-env.d.ts apps/web/next-env.d.ts
git mv playwright.config.ts apps/web/playwright.config.ts
git mv package.json apps/web/package.json
git mv package-lock.json apps/web/package-lock.json
# Keep README and CLAUDE.md at root
```

- [ ] **Step 2: Create workspace root `package.json`**

File: `package.json`
```json
{
  "name": "calsync-monorepo",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev:web": "bun --cwd apps/web dev",
    "dev:worker": "bun --cwd apps/worker dev",
    "build:web": "bun --cwd apps/web run build",
    "build:worker": "bun --cwd apps/worker run build"
  }
}
```

- [ ] **Step 3: Rename `apps/web` package and add workspace dep placeholder**

Edit `apps/web/package.json`:
```json
{
  "name": "@calsync/web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint"
  },
  "dependencies": {
    "next": "16.2.2",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "@calsync/shared": "workspace:*"
  },
  "devDependencies": {
    "@playwright/test": "^1.59.1",
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "16.2.2",
    "tailwindcss": "^4",
    "typescript": "^5"
  }
}
```

- [ ] **Step 4: Delete the moved lockfile and re-install from root**

```bash
rm apps/web/package-lock.json
rm -rf apps/web/node_modules
bun install
```

Expected: `bun.lock` appears at repo root, `node_modules` resolves correctly.

- [ ] **Step 5: Smoke test the moved app**

```bash
bun --cwd apps/web dev
```

Expected: Next.js dev server starts on :3000. Open browser, confirm dashboard loads. Kill server.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Restructure into bun workspace monorepo"
```

### Task 2: Scaffold `packages/shared`

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/types.ts`

- [ ] **Step 1: Create `packages/shared/package.json`**

```json
{
  "name": "@calsync/shared",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0",
    "googleapis": "^144.0.0",
    "@clerk/backend": "^1.13.0"
  },
  "devDependencies": {
    "typescript": "^5"
  }
}
```

- [ ] **Step 2: Create `packages/shared/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true,
    "declaration": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `packages/shared/src/types.ts` — copy from web**

Copy the existing `apps/web/src/lib/types.ts` content verbatim, then add the DB row shapes:

```ts
// --- UI-facing shapes (unchanged from original) ---
export interface CalendarSource {
  id: string;
  name: string;
  url?: string;
  color: string;
  type: "google" | "paste";
  eventCount: number;
}

export interface CalEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD (local)
  startTime: string; // HH:MM (local)
  endTime: string; // HH:MM (local)
  source: "google" | "manual";
  calendarId: string;
}

export interface FreeSlot {
  date: string;
  startTime: string;
  endTime: string;
  available: boolean;
}

export interface PlatformExport {
  platform: "calendly" | "when2meet" | "other";
  dateRange: { start: string; end: string };
  slots: FreeSlot[];
  status: "pending" | "confirmed" | "sent";
}

export interface Settings {
  workingHoursStart: string;
  workingHoursEnd: string;
  bufferMinutes: number;
  meetingLength: number;
  platforms: ("calendly" | "when2meet" | "other")[];
}

// --- DB row shapes (Supabase) ---
export interface ConnectedCalendarRow {
  id: string;
  user_id: string;
  google_calendar_id: string;
  name: string;
  color: string | null;
  enabled: boolean;
  created_at: string;
}

export interface EventRow {
  id: string;
  user_id: string;
  google_calendar_id: string;
  google_event_id: string;
  title: string;
  start_at: string; // ISO timestamptz
  end_at: string;
  updated_at: string;
}

export interface UserSettingsRow {
  user_id: string;
  working_hours_start: string;
  working_hours_end: string;
  buffer_minutes: number;
  meeting_length: number;
  platforms: string[];
  timezone: string;
  updated_at: string;
}
```

- [ ] **Step 4: Create `packages/shared/src/index.ts`**

```ts
export * from "./types";
```

- [ ] **Step 5: Delete the moved `apps/web/src/lib/types.ts` and re-export from shared**

Replace `apps/web/src/lib/types.ts` with:
```ts
export * from "@calsync/shared";
```

(Keeps existing `@/lib/types` imports working throughout the web app.)

- [ ] **Step 6: Install + smoke test**

```bash
bun install
bun --cwd apps/web run build
```

Expected: build succeeds. If there are import errors from missing `@calsync/shared` resolution, verify `apps/web/package.json` has `"@calsync/shared": "workspace:*"`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add packages/shared with shared types"
```

### Task 3: Scaffold `apps/worker`

**Files:**
- Create: `apps/worker/package.json`
- Create: `apps/worker/tsconfig.json`
- Create: `apps/worker/src/index.ts` (placeholder)

- [ ] **Step 1: Create `apps/worker/package.json`**

```json
{
  "name": "@calsync/worker",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "bun --watch src/index.ts",
    "start": "bun src/index.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@calsync/shared": "workspace:*",
    "@supabase/supabase-js": "^2.45.0",
    "@clerk/backend": "^1.13.0",
    "googleapis": "^144.0.0"
  },
  "devDependencies": {
    "@types/node": "^20",
    "typescript": "^5"
  }
}
```

- [ ] **Step 2: Create `apps/worker/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `apps/worker/src/index.ts` placeholder**

```ts
console.log("[worker] starting placeholder — real loop added in Phase 4");

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 300_000);

setInterval(() => {
  console.log(`[worker] tick at ${new Date().toISOString()} (placeholder)`);
}, POLL_INTERVAL_MS);

process.on("SIGTERM", () => {
  console.log("[worker] SIGTERM received, exiting");
  process.exit(0);
});
```

- [ ] **Step 4: Install + smoke test**

```bash
bun install
bun --cwd apps/worker dev
```

Expected: logs `[worker] starting placeholder...`. Kill after a few seconds.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Scaffold apps/worker with placeholder loop"
```

---

## Phase 1: Supabase schema

### Task 4: Write migration SQL

**Files:**
- Create: `supabase/migrations/0001_multiuser_schema.sql`

- [ ] **Step 1: Write migration**

```sql
-- connected_calendars: which Google calendars each user has opted in to
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

ALTER TABLE connected_calendars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own rows select" ON connected_calendars
  FOR SELECT USING (auth.jwt() ->> 'sub' = user_id);
CREATE POLICY "own rows insert" ON connected_calendars
  FOR INSERT WITH CHECK (auth.jwt() ->> 'sub' = user_id);
CREATE POLICY "own rows update" ON connected_calendars
  FOR UPDATE USING (auth.jwt() ->> 'sub' = user_id);
CREATE POLICY "own rows delete" ON connected_calendars
  FOR DELETE USING (auth.jwt() ->> 'sub' = user_id);

-- events: normalized Google Calendar events. Worker upserts here.
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

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own events select" ON events
  FOR SELECT USING (auth.jwt() ->> 'sub' = user_id);
-- Only worker (service role) writes; no insert/update/delete policies for regular users.

-- user_settings
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

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own settings select" ON user_settings
  FOR SELECT USING (auth.jwt() ->> 'sub' = user_id);
CREATE POLICY "own settings insert" ON user_settings
  FOR INSERT WITH CHECK (auth.jwt() ->> 'sub' = user_id);
CREATE POLICY "own settings update" ON user_settings
  FOR UPDATE USING (auth.jwt() ->> 'sub' = user_id);

-- Enable Realtime on events so the frontend can subscribe
ALTER PUBLICATION supabase_realtime ADD TABLE events;
```

- [ ] **Step 2: Apply via Supabase MCP or SQL editor**

In Supabase dashboard → SQL Editor → paste the contents of `0001_multiuser_schema.sql` → Run. Verify all three tables appear under Database → Tables.

- [ ] **Step 3: Verify RLS + Realtime**

SQL Editor, run:
```sql
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename IN ('connected_calendars','events','user_settings');
SELECT schemaname, tablename FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='events';
```
Expected: rowsecurity = true for all three; one row for `events` in the second query.

- [ ] **Step 4: Commit migration file**

```bash
git add supabase/migrations/0001_multiuser_schema.sql
git commit -m "Add initial multi-user schema migration"
```

---

## Phase 2: Auth wiring (Clerk)

### Task 5: Install Clerk + add provider + middleware

**Files:**
- Modify: `apps/web/package.json` (add deps)
- Create: `apps/web/src/middleware.ts`
- Modify: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/sign-in/[[...rest]]/page.tsx`
- Create: `apps/web/.env.local.example`
- Create: `apps/web/.env.local` (user fills in values)

- [ ] **Step 1: Install Clerk**

```bash
bun add --cwd apps/web @clerk/nextjs@^7
```

- [ ] **Step 2: Create `apps/web/.env.local.example`**

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-in
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/onboard

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

- [ ] **Step 3: User fills in `apps/web/.env.local` with real keys**

Copy `.env.local.example` → `.env.local`, paste real Clerk + Supabase keys. (Not committed — already gitignored by Next.js default.)

- [ ] **Step 4: Create middleware**

File: `apps/web/src/middleware.ts`
```ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/api/webhooks(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
```

- [ ] **Step 5: Wrap root layout with ClerkProvider (keep AppProvider for now)**

Read `apps/web/src/app/layout.tsx` first. It currently wraps children in `<AppProvider>`. Keep that provider — it'll be removed in Task 18 after the new hooks replace it. Only *add* the `ClerkProvider` as the outermost wrapper:

```tsx
import { ClerkProvider } from "@clerk/nextjs";
// ...existing imports including AppProvider...

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="min-h-screen bg-slate-950 text-slate-100">
          {/* preserve whatever structure exists, including: */}
          <AppProvider>
            <Nav />
            {children}
          </AppProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
```

Preserve existing fonts, classes, and the `AppProvider` wrapper exactly. The only guaranteed change is adding `<ClerkProvider>` as the outermost element. The intermediate state (both providers present) is deliberate and makes every phase between here and Task 18 runnable.

- [ ] **Step 6: Create sign-in page**

File: `apps/web/src/app/sign-in/[[...rest]]/page.tsx`
```tsx
import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="max-w-md text-center">
        <h1 className="text-4xl font-semibold">CalSync</h1>
        <p className="mt-2 text-slate-300">
          Auto-refreshing availability from your Google Calendar. Sign in to connect
          your calendars and start sharing free slots in seconds.
        </p>
      </div>
      <SignIn
        path="/sign-in"
        routing="path"
        forceRedirectUrl="/"
        signUpForceRedirectUrl="/onboard"
      />
    </main>
  );
}
```

- [ ] **Step 7: Smoke test sign-in flow**

```bash
bun --cwd apps/web dev
```

Open `http://localhost:3000/`. Expected: redirected to `/sign-in`. The Clerk widget should show "Continue with Google" as the first option. (Scope won't include Calendar yet if you haven't set custom credentials; that's fine for this task.) Click it and verify a successful sign-in lands back at `/`. Sign out from Clerk's user button in dev.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Add Clerk auth: middleware, provider, sign-in page"
```

### Task 6: Update Nav for auth state

**Files:**
- Modify: `apps/web/src/components/Nav.tsx`

- [ ] **Step 1: Read current Nav**

```bash
cat apps/web/src/components/Nav.tsx
```

- [ ] **Step 2: Replace with Clerk-aware version**

File: `apps/web/src/components/Nav.tsx`
```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton, SignInButton, SignedIn, SignedOut } from "@clerk/nextjs";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/review", label: "Review" },
  { href: "/settings", label: "Settings" },
];

export default function Nav() {
  const pathname = usePathname();
  if (pathname?.startsWith("/sign-in")) return null;

  return (
    <nav className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
      <Link href="/" className="text-lg font-semibold">CalSync</Link>
      <div className="flex items-center gap-6">
        <SignedIn>
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={pathname === l.href ? "text-white" : "text-slate-400 hover:text-white"}
            >
              {l.label}
            </Link>
          ))}
          <UserButton afterSignOutUrl="/sign-in" />
        </SignedIn>
        <SignedOut>
          <SignInButton mode="modal">
            <button className="rounded bg-indigo-500 px-3 py-1 text-sm">Sign in</button>
          </SignInButton>
        </SignedOut>
      </div>
    </nav>
  );
}
```

Note: this uses `SignedIn`/`SignedOut` (standard Clerk v7 API). Saveur uses `<Show when="signed-in">` which is Clerk's newer declarative API — both work; pick whichever the installed Clerk version documents. Stick with `SignedIn`/`SignedOut` here since it's stable across versions.

- [ ] **Step 3: Smoke test**

Refresh browser. Signed in → see nav links + UserButton. Signed out (via UserButton) → nav shows Sign in button, dashboard link redirects to /sign-in via middleware.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/Nav.tsx
git commit -m "Update Nav for Clerk auth state"
```

---

## Phase 3: Supabase client + Clerk JWT integration

### Task 7: Add Supabase client helpers

**Files:**
- Modify: `apps/web/package.json` (add `@supabase/supabase-js`)
- Create: `apps/web/src/lib/supabase.ts`
- Create: `apps/web/src/lib/supabase-server.ts`

- [ ] **Step 1: Install Supabase**

```bash
bun add --cwd apps/web @supabase/supabase-js
```

- [ ] **Step 2: Create browser client with Clerk session**

File: `apps/web/src/lib/supabase.ts`
```ts
"use client";

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { useSession } from "@clerk/nextjs";
import { useMemo } from "react";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export function useSupabase(): SupabaseClient | null {
  const { session } = useSession();

  return useMemo(() => {
    if (!session) return null;
    return createClient(url, anon, {
      global: {
        fetch: async (input, init = {}) => {
          const token = await session.getToken({ template: "supabase" });
          const headers = new Headers(init.headers);
          if (token) headers.set("Authorization", `Bearer ${token}`);
          return fetch(input, { ...init, headers });
        },
      },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }, [session]);
}
```

- [ ] **Step 3: Create server client factory**

File: `apps/web/src/lib/supabase-server.ts`
```ts
import { createClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// For server route handlers acting as the signed-in user (respects RLS).
export async function getUserSupabase() {
  const { getToken, userId } = await auth();
  if (!userId) throw new Error("Not signed in");
  const token = await getToken({ template: "supabase" });
  return createClient(url, anon, {
    global: {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// For server-side tasks that must bypass RLS (e.g., sync-now writing events).
export function getServiceSupabase() {
  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

- [ ] **Step 4: Quick smoke test via a throwaway API route**

File: `apps/web/src/app/api/_probe/route.ts`
```ts
import { getUserSupabase } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

export async function GET() {
  const supa = await getUserSupabase();
  const { data, error } = await supa.from("user_settings").select("*").limit(1);
  return NextResponse.json({ data, error: error?.message ?? null });
}
```

Hit `http://localhost:3000/api/_probe` while signed in. Expected: `{"data":[],"error":null}`. Empty array means RLS is working (you have no rows yet) and the JWT is being accepted.

- [ ] **Step 5: Delete the probe route**

```bash
rm -rf apps/web/src/app/api/_probe
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add Supabase client helpers with Clerk JWT integration"
```

---

## Phase 4: Shared sync logic

### Task 8: Google Calendar fetch + normalization in `packages/shared`

**Files:**
- Create: `packages/shared/src/google-calendar.ts`
- Create: `packages/shared/src/sync.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `packages/shared/src/sync.test.ts`

- [ ] **Step 1: Create Google Calendar wrapper**

File: `packages/shared/src/google-calendar.ts`
```ts
import { google } from "googleapis";

export interface GoogleEvent {
  googleEventId: string;
  googleCalendarId: string;
  title: string;
  startAt: string; // ISO
  endAt: string;
}

/** List calendars the user has access to. */
export async function listCalendars(accessToken: string) {
  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: accessToken });
  const cal = google.calendar({ version: "v3", auth: oauth2 });
  const res = await cal.calendarList.list();
  return (res.data.items ?? []).map((c) => ({
    id: c.id!,
    name: c.summary ?? c.id!,
    color: c.backgroundColor ?? null,
    primary: c.primary ?? false,
  }));
}

/** Fetch events for one calendar in a time window. */
export async function fetchEvents(params: {
  accessToken: string;
  calendarId: string;
  timeMinIso: string;
  timeMaxIso: string;
}): Promise<GoogleEvent[]> {
  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: params.accessToken });
  const cal = google.calendar({ version: "v3", auth: oauth2 });
  const res = await cal.events.list({
    calendarId: params.calendarId,
    timeMin: params.timeMinIso,
    timeMax: params.timeMaxIso,
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 250,
  });
  const items = res.data.items ?? [];
  return items
    .filter((e) => e.start?.dateTime && e.end?.dateTime) // drop all-day events for MVP
    .map((e) => ({
      googleEventId: e.id!,
      googleCalendarId: params.calendarId,
      title: e.summary ?? "(no title)",
      startAt: e.start!.dateTime!,
      endAt: e.end!.dateTime!,
    }));
}
```

(All-day events are filtered for MVP — calendar availability rarely hinges on all-day holidays, and they'd incorrectly mark full working days busy. Can be added back later.)

- [ ] **Step 2: Create sync function**

File: `packages/shared/src/sync.ts`
```ts
import { SupabaseClient } from "@supabase/supabase-js";
import { createClerkClient, ClerkClient } from "@clerk/backend";
import { fetchEvents } from "./google-calendar";

export interface SyncUserOpts {
  userId: string;
  supabaseServiceClient: SupabaseClient;
  clerk: ClerkClient;
  windowDays?: number;
}

export interface SyncResult {
  userId: string;
  calendarsSynced: number;
  eventsUpserted: number;
  eventsDeleted: number;
  errors: string[];
}

/**
 * Sync all enabled calendars for one user.
 * Idempotent: safe to call repeatedly; uses upsert + delete-missing pattern.
 */
export async function syncUser(opts: SyncUserOpts): Promise<SyncResult> {
  const { userId, supabaseServiceClient: db, clerk, windowDays = 30 } = opts;
  const result: SyncResult = {
    userId,
    calendarsSynced: 0,
    eventsUpserted: 0,
    eventsDeleted: 0,
    errors: [],
  };

  // Get current Google access token via Clerk
  let accessToken: string;
  try {
    const tokens = await clerk.users.getUserOauthAccessToken(userId, "google");
    const first = Array.isArray(tokens) ? tokens[0] : tokens?.data?.[0];
    if (!first?.token) throw new Error("no token returned");
    accessToken = first.token;
  } catch (err) {
    result.errors.push(`clerk token: ${(err as Error).message}`);
    return result;
  }

  // Fetch enabled calendars
  const { data: calendars, error: calErr } = await db
    .from("connected_calendars")
    .select("google_calendar_id")
    .eq("user_id", userId)
    .eq("enabled", true);

  if (calErr) {
    result.errors.push(`load calendars: ${calErr.message}`);
    return result;
  }

  const now = new Date();
  const timeMinIso = now.toISOString();
  const timeMaxIso = new Date(now.getTime() + windowDays * 86_400_000).toISOString();

  for (const { google_calendar_id } of calendars ?? []) {
    try {
      const events = await fetchEvents({
        accessToken,
        calendarId: google_calendar_id,
        timeMinIso,
        timeMaxIso,
      });

      if (events.length > 0) {
        const rows = events.map((e) => ({
          user_id: userId,
          google_calendar_id,
          google_event_id: e.googleEventId,
          title: e.title,
          start_at: e.startAt,
          end_at: e.endAt,
          updated_at: new Date().toISOString(),
        }));
        const { error: upErr } = await db
          .from("events")
          .upsert(rows, { onConflict: "user_id,google_event_id" });
        if (upErr) throw upErr;
        result.eventsUpserted += rows.length;
      }

      // Delete events in this calendar+window that are no longer in the fresh set.
      const freshIds = events.map((e) => e.googleEventId);
      const { data: deleted, error: delErr } = await db
        .from("events")
        .delete({ count: "exact" })
        .eq("user_id", userId)
        .eq("google_calendar_id", google_calendar_id)
        .gte("start_at", timeMinIso)
        .lte("start_at", timeMaxIso)
        .not("google_event_id", "in", `(${freshIds.map((id) => `"${id}"`).join(",") || '""'})`)
        .select("id");
      if (delErr) throw delErr;
      result.eventsDeleted += deleted?.length ?? 0;

      result.calendarsSynced += 1;
    } catch (err) {
      result.errors.push(`${google_calendar_id}: ${(err as Error).message}`);
    }
  }

  return result;
}

export function getClerkClient(): ClerkClient {
  return createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });
}
```

- [ ] **Step 3: Export from package index**

File: `packages/shared/src/index.ts`
```ts
export * from "./types";
export * from "./google-calendar";
export * from "./sync";
```

- [ ] **Step 4: Install packages**

```bash
bun install
```

Expected: no errors. (`googleapis`, `@clerk/backend`, `@supabase/supabase-js` installed at root via workspace deps.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add shared Google Calendar + syncUser logic"
```

### Task 9: Worker main loop uses shared syncUser

**Files:**
- Modify: `apps/worker/src/index.ts`

- [ ] **Step 1: Replace placeholder with real loop**

File: `apps/worker/src/index.ts`
```ts
import { createClient } from "@supabase/supabase-js";
import { syncUser, getClerkClient } from "@calsync/shared";

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 300_000);

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const clerk = getClerkClient();

let tickInFlight = false;
let stopping = false;

async function tick() {
  if (tickInFlight || stopping) return;
  tickInFlight = true;
  const startedAt = Date.now();

  try {
    const { data: users, error } = await supabase
      .from("connected_calendars")
      .select("user_id")
      .eq("enabled", true);

    if (error) {
      console.error("[worker] load users:", error.message);
      return;
    }

    const uniqueUsers = Array.from(new Set((users ?? []).map((u) => u.user_id)));
    let totalUpserts = 0;
    let totalDeletes = 0;
    let errorCount = 0;

    for (const userId of uniqueUsers) {
      const result = await syncUser({
        userId,
        supabaseServiceClient: supabase,
        clerk,
      });
      totalUpserts += result.eventsUpserted;
      totalDeletes += result.eventsDeleted;
      errorCount += result.errors.length;
      if (result.errors.length > 0) {
        console.error(`[worker] user=${userId} errors:`, result.errors);
      }
    }

    console.log(
      `[worker] tick done users=${uniqueUsers.length} upserts=${totalUpserts} deletes=${totalDeletes} errors=${errorCount} ms=${Date.now() - startedAt}`,
    );
  } catch (err) {
    console.error("[worker] tick failed:", err);
  } finally {
    tickInFlight = false;
  }
}

console.log(`[worker] starting, interval=${POLL_INTERVAL_MS}ms`);
tick();
const handle = setInterval(tick, POLL_INTERVAL_MS);

async function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log("[worker] shutdown signal received");
  clearInterval(handle);
  while (tickInFlight) await new Promise((r) => setTimeout(r, 100));
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
```

- [ ] **Step 2: Create worker env file**

File: `apps/worker/.env.local` (not committed)
```
SUPABASE_URL=<same as frontend NEXT_PUBLIC_SUPABASE_URL>
SUPABASE_SERVICE_ROLE_KEY=<from Supabase dashboard>
CLERK_SECRET_KEY=<same as frontend CLERK_SECRET_KEY>
POLL_INTERVAL_MS=300000
```

- [ ] **Step 3: Add dotenv loading to worker**

Bun auto-loads `.env.local`. No code change needed. Verify:
```bash
bun --cwd apps/worker dev
```
Expected: `[worker] starting, interval=300000ms`. Then `[worker] tick done users=0 upserts=0 deletes=0 errors=0 ms=...` (no users yet — this is correct). Kill.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Implement worker poll loop using shared syncUser"
```

---

## Phase 5: Calendar onboarding

### Task 10: GET /api/calendars/list

**Files:**
- Create: `apps/web/src/app/api/calendars/list/route.ts`

- [ ] **Step 1: Create route**

```ts
import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { listCalendars } from "@calsync/shared";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const clerk = await clerkClient();
  const tokens = await clerk.users.getUserOauthAccessToken(userId, "google");
  const first = Array.isArray(tokens) ? tokens[0] : tokens?.data?.[0];
  if (!first?.token) {
    return NextResponse.json(
      { error: "No Google token. Sign out and sign in with Google again to grant Calendar access." },
      { status: 400 },
    );
  }

  try {
    const calendars = await listCalendars(first.token);
    return NextResponse.json({ calendars });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
```

- [ ] **Step 2: Smoke test**

Sign out, sign back in **with Google** (ensuring the Calendar scope grant prompt appears). Then hit:
```bash
curl -s -b "__session=$(...)" http://localhost:3000/api/calendars/list
```
(Easier: just open `http://localhost:3000/api/calendars/list` in a browser tab signed in.) Expected: JSON with a `calendars` array including your primary calendar.

If you get "No Google token" — the scope wasn't granted. Go to Clerk dashboard → user profile → remove the Google connection, then sign in again.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/calendars/list/route.ts
git commit -m "Add GET /api/calendars/list"
```

### Task 11: POST /api/calendars/select + DELETE /api/calendars/[id]

**Files:**
- Create: `apps/web/src/app/api/calendars/select/route.ts`
- Create: `apps/web/src/app/api/calendars/[id]/route.ts`

- [ ] **Step 1: Create select route**

File: `apps/web/src/app/api/calendars/select/route.ts`
```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getUserSupabase } from "@/lib/supabase-server";

interface SelectBody {
  calendars: { googleCalendarId: string; name: string; color?: string | null }[];
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await req.json()) as SelectBody;
  if (!Array.isArray(body.calendars)) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const supa = await getUserSupabase();
  const rows = body.calendars.map((c) => ({
    user_id: userId,
    google_calendar_id: c.googleCalendarId,
    name: c.name,
    color: c.color ?? null,
    enabled: true,
  }));

  const { error } = await supa
    .from("connected_calendars")
    .upsert(rows, { onConflict: "user_id,google_calendar_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, count: rows.length });
}
```

- [ ] **Step 2: Create delete route**

File: `apps/web/src/app/api/calendars/[id]/route.ts`
```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getUserSupabase } from "@/lib/supabase-server";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { id } = await params;
  const supa = await getUserSupabase();
  const { error } = await supa.from("connected_calendars").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Add POST select + DELETE calendars routes"
```

### Task 12: /onboard page (calendar picker)

**Files:**
- Create: `apps/web/src/app/onboard/page.tsx`

- [ ] **Step 1: Create page**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Calendar {
  id: string;
  name: string;
  color: string | null;
  primary: boolean;
}

export default function OnboardPage() {
  const router = useRouter();
  const [calendars, setCalendars] = useState<Calendar[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/calendars/list")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setCalendars(data.calendars);
        setSelected(new Set(data.calendars.filter((c: Calendar) => c.primary).map((c: Calendar) => c.id)));
      })
      .catch((e) => setError(e.message));
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    if (!calendars) return;
    setLoading(true);
    setError(null);
    try {
      const chosen = calendars.filter((c) => selected.has(c.id));
      const res = await fetch("/api/calendars/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          calendars: chosen.map((c) => ({ googleCalendarId: c.id, name: c.name, color: c.color })),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "save failed");
      // Trigger immediate first sync, don't block navigation on failure
      fetch("/api/sync-now", { method: "POST" }).catch(() => {});
      router.push("/");
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  }

  if (error)
    return (
      <main className="p-8">
        <p className="text-red-400">Error: {error}</p>
      </main>
    );
  if (!calendars) return <main className="p-8">Loading your calendars...</main>;

  return (
    <main className="mx-auto max-w-xl space-y-6 p-8">
      <header>
        <h1 className="text-3xl font-semibold">Pick your calendars</h1>
        <p className="mt-2 text-slate-400">
          CalSync will watch these calendars for busy events. You can change this later.
        </p>
      </header>

      <ul className="divide-y divide-slate-800 rounded border border-slate-800">
        {calendars.map((c) => (
          <li key={c.id} className="flex items-center gap-3 p-3">
            <input
              type="checkbox"
              checked={selected.has(c.id)}
              onChange={() => toggle(c.id)}
              id={c.id}
            />
            <label htmlFor={c.id} className="flex-1">
              {c.name}
              {c.primary && <span className="ml-2 text-xs text-slate-500">(primary)</span>}
            </label>
            {c.color && <span className="h-3 w-3 rounded-full" style={{ background: c.color }} />}
          </li>
        ))}
      </ul>

      <button
        onClick={submit}
        disabled={loading || selected.size === 0}
        className="rounded bg-indigo-500 px-4 py-2 disabled:opacity-50"
      >
        {loading ? "Saving..." : `Continue (${selected.size} selected)`}
      </button>
    </main>
  );
}
```

- [ ] **Step 2: Smoke test**

Sign in → middleware takes you to /. Manually visit `/onboard`. Expected: your Google calendars render as checkboxes, primary is pre-selected. (The redirect-to-onboard-for-new-users wiring happens in Task 13.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/onboard/page.tsx
git commit -m "Add /onboard calendar picker page"
```

### Task 13: Redirect new users to /onboard

**Files:**
- Modify: `apps/web/src/app/page.tsx` (or wherever the dashboard entry is)
- Create: `apps/web/src/lib/onboarding.ts`

- [ ] **Step 1: Create helper**

File: `apps/web/src/lib/onboarding.ts`
```ts
import { getUserSupabase } from "./supabase-server";

export async function userHasConnectedCalendars(): Promise<boolean> {
  const supa = await getUserSupabase();
  const { data, error } = await supa
    .from("connected_calendars")
    .select("id")
    .limit(1);
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}
```

- [ ] **Step 2: Read existing `apps/web/src/app/page.tsx` and find the right place to wrap with a server check**

If the dashboard page is a Client Component, convert the top-level route to a Server Component wrapper that checks onboarding state then renders the client dashboard. Example:

File: `apps/web/src/app/page.tsx`
```tsx
import { redirect } from "next/navigation";
import { userHasConnectedCalendars } from "@/lib/onboarding";
import DashboardClient from "./DashboardClient"; // extract existing client code

export default async function HomePage() {
  const hasCalendars = await userHasConnectedCalendars();
  if (!hasCalendars) redirect("/onboard");
  return <DashboardClient />;
}
```

- [ ] **Step 3: Extract existing dashboard client code into `DashboardClient.tsx`**

Move everything that was in `page.tsx` (the current client component using `useApp`) into a new `apps/web/src/app/DashboardClient.tsx` with `"use client"` at top. Leave the data layer alone for now — we rewire it in Phase 6.

- [ ] **Step 4: Smoke test**

Sign out. Sign back in with Google. Expected: after sign-in, auto-redirected to `/onboard`. Pick a calendar. Continue. Land on dashboard. Sign out/in again — this time lands on dashboard directly (calendars already connected).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Redirect users without connected calendars to /onboard"
```

### Task 14: POST /api/sync-now (immediate first sync)

**Files:**
- Create: `apps/web/src/app/api/sync-now/route.ts`

- [ ] **Step 1: Create route**

```ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getServiceSupabase } from "@/lib/supabase-server";
import { syncUser, getClerkClient } from "@calsync/shared";

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const supa = getServiceSupabase();
  const clerk = getClerkClient();
  const result = await syncUser({ userId, supabaseServiceClient: supa, clerk });
  return NextResponse.json(result);
}
```

- [ ] **Step 2: Smoke test**

After onboarding, open browser devtools → Network → see the POST to `/api/sync-now` fire. Response should show `eventsUpserted > 0` (assuming your calendar has upcoming events). Check Supabase Table Editor → `events` → rows appear.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/sync-now/route.ts
git commit -m "Add POST /api/sync-now for immediate first sync"
```

---

## Phase 6: Frontend data layer rewrite

### Task 15: `useEvents` hook with Realtime subscription

**Files:**
- Create: `apps/web/src/hooks/use-events.ts`

- [ ] **Step 1: Create hook**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import type { CalEvent, EventRow } from "@/lib/types";
import { useSupabase } from "@/lib/supabase";

// Normalize DB row (timestamptz) into the existing CalEvent shape (date + HH:MM local)
function rowToCalEvent(row: EventRow): CalEvent {
  const start = new Date(row.start_at);
  const end = new Date(row.end_at);
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
  const startTime = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
  const endTime = `${pad(end.getHours())}:${pad(end.getMinutes())}`;
  return {
    id: row.id,
    title: row.title,
    date,
    startTime,
    endTime,
    source: "google",
    calendarId: row.google_calendar_id,
  };
}

export function useEvents(): { events: CalEvent[]; loading: boolean; error: string | null } {
  const supabase = useSupabase();
  const { userId } = useAuth();
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase || !userId) return;
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .order("start_at", { ascending: true });
      if (cancelled) return;
      if (error) setError(error.message);
      else setEvents((data ?? []).map(rowToCalEvent));
      setLoading(false);
    })();

    const channel = supabase
      .channel(`events-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events", filter: `user_id=eq.${userId}` },
        (payload) => {
          setEvents((prev) => {
            if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
              const next = rowToCalEvent(payload.new as EventRow);
              const idx = prev.findIndex((e) => e.id === next.id);
              if (idx === -1) return [...prev, next];
              const copy = [...prev];
              copy[idx] = next;
              return copy;
            }
            if (payload.eventType === "DELETE") {
              const oldId = (payload.old as EventRow).id;
              return prev.filter((e) => e.id !== oldId);
            }
            return prev;
          });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [supabase, userId]);

  return { events, loading, error };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/hooks/use-events.ts
git commit -m "Add useEvents hook with Realtime subscription"
```

### Task 16: `useSettings` hook

**Files:**
- Create: `apps/web/src/hooks/use-settings.ts`
- Create: `apps/web/src/app/api/settings/route.ts`

- [ ] **Step 1: Create settings API route**

File: `apps/web/src/app/api/settings/route.ts`
```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getUserSupabase } from "@/lib/supabase-server";

const DEFAULTS = {
  working_hours_start: "09:00",
  working_hours_end: "17:00",
  buffer_minutes: 15,
  meeting_length: 30,
  platforms: ["calendly", "when2meet"],
  timezone: "America/Chicago",
};

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const supa = await getUserSupabase();
  const { data, error } = await supa.from("user_settings").select("*").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? { user_id: userId, ...DEFAULTS });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const body = await req.json();
  const supa = await getUserSupabase();
  const { error } = await supa
    .from("user_settings")
    .upsert({ user_id: userId, ...body, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Create hook**

File: `apps/web/src/hooks/use-settings.ts`
```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import type { Settings, UserSettingsRow } from "@/lib/types";

const DEFAULTS: Settings = {
  workingHoursStart: "09:00",
  workingHoursEnd: "17:00",
  bufferMinutes: 15,
  meetingLength: 30,
  platforms: ["calendly", "when2meet"],
};

function rowToSettings(row: Partial<UserSettingsRow>): Settings {
  return {
    workingHoursStart: row.working_hours_start ?? DEFAULTS.workingHoursStart,
    workingHoursEnd: row.working_hours_end ?? DEFAULTS.workingHoursEnd,
    bufferMinutes: row.buffer_minutes ?? DEFAULTS.bufferMinutes,
    meetingLength: row.meeting_length ?? DEFAULTS.meetingLength,
    platforms: (row.platforms as Settings["platforms"]) ?? DEFAULTS.platforms,
  };
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => setSettings(rowToSettings(data)))
      .finally(() => setLoading(false));
  }, []);

  const update = useCallback(async (partial: Partial<Settings>) => {
    const next = { ...settings, ...partial };
    setSettings(next); // optimistic
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        working_hours_start: next.workingHoursStart,
        working_hours_end: next.workingHoursEnd,
        buffer_minutes: next.bufferMinutes,
        meeting_length: next.meetingLength,
        platforms: next.platforms,
      }),
    });
  }, [settings]);

  return { settings, loading, update };
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Add useSettings hook and /api/settings route"
```

### Task 17: `useFreeSlots` hook

**Files:**
- Create: `apps/web/src/hooks/use-free-slots.ts`

- [ ] **Step 1: Create hook**

```tsx
"use client";

import { useMemo } from "react";
import type { CalEvent, Settings, FreeSlot } from "@/lib/types";
import { generateFreeSlots, getWeekDates } from "@/lib/availability";

export function useFreeSlots(events: CalEvent[], settings: Settings, weekOffset: number): FreeSlot[] {
  return useMemo(() => {
    const ref = new Date();
    ref.setDate(ref.getDate() + weekOffset * 7);
    const dates = getWeekDates(ref);
    return generateFreeSlots(events, settings, dates);
  }, [events, settings, weekOffset]);
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/hooks/use-free-slots.ts
git commit -m "Add useFreeSlots derivation hook"
```

### Task 18: Rewire dashboard, /day, /review to use hooks

**Files:**
- Modify: `apps/web/src/app/DashboardClient.tsx`
- Modify: `apps/web/src/app/day/[date]/page.tsx`
- Modify: `apps/web/src/app/review/page.tsx`
- Modify: `apps/web/src/app/settings/page.tsx`
- Modify: `apps/web/src/context/AppContext.tsx` (slim down) OR delete after migration

- [ ] **Step 1: Read current `DashboardClient.tsx` (formerly page.tsx)**

Look at every `useApp()` call. Replace with:
- `events` → `useEvents().events`
- `settings` → `useSettings().settings`
- `freeSlots` → `useFreeSlots(events, settings, weekOffset)`
- `exports` → compute inline from `freeSlots` + `settings.platforms` (this state was synthetic anyway)
- `weekOffset` / `setWeekOffset` → local `useState<number>(0)`

Delete calls to `toggleSlot`, `updateSettings` (moved to settings page), `confirmExport` (replaced by local state in `/review`), `addCalendar`, `removeCalendar`, `addEvents`, `clearEvents`, `regenerateSlots`.

- [ ] **Step 2: Repeat for `/day/[date]/page.tsx`**

Uses `events`, `freeSlots`, `toggleSlot`. Replace events/freeSlots with hooks. For `toggleSlot`, keep as local state within the page — availability toggling is a UI-only operation now, not DB-persisted. (If persistent slot edits are desired later, add a `slot_overrides` table — out of scope here.)

- [ ] **Step 3: Repeat for `/review/page.tsx`**

Same pattern. `exports` can be derived from current `freeSlots`.

- [ ] **Step 4: Rewrite `/settings/page.tsx` to use `useSettings`**

Replace the context `updateSettings` with `useSettings().update`. No other logic changes.

- [ ] **Step 5: Delete `AppContext.tsx` and `AppProvider` mounting**

```bash
rm apps/web/src/context/AppContext.tsx
```

Search for `AppProvider` import and remove from wherever it's mounted (likely `layout.tsx` — may already have been removed in Task 5 rewrite; verify).

```bash
grep -r "AppProvider\|useApp" apps/web/src
```

Expected: no matches. Fix any stragglers.

- [ ] **Step 6: Delete obsolete imports and `/import` page + parser**

```bash
rm -rf apps/web/src/app/import
rm apps/web/src/lib/ics-parser.ts
```

Search for imports:
```bash
grep -r "ics-parser\|/import" apps/web/src
```

Remove any leftover references (likely a nav link to `/import` — already removed from Task 6's Nav rewrite).

- [ ] **Step 7: Full build + manual test**

```bash
bun --cwd apps/web run build
bun --cwd apps/web dev
```

Start worker in another terminal:
```bash
bun --cwd apps/worker dev
```

In browser:
1. Sign in.
2. Complete onboard.
3. Dashboard shows events (first-sync from Task 14 populated them).
4. Create a new event in Google Calendar in the next 30 days.
5. Wait for worker tick (up to 5 min) OR temporarily set `POLL_INTERVAL_MS=15000` in `apps/worker/.env.local` and restart worker.
6. Dashboard should update WITHOUT refresh — the event appears and busy/free block rerenders.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Rewire frontend to use Supabase hooks; delete AppContext and import flow"
```

---

## Phase 7: Deployment

### Task 19: Vercel deployment

**Files:**
- Create: `vercel.json` (root) — optional, only if defaults don't work
- Modify: `README.md` — deployment notes

- [ ] **Step 1: Push to GitHub**

Already doing this per existing workflow.

- [ ] **Step 2: Import project in Vercel**

Vercel dashboard → New Project → import the repo → **Root Directory: `apps/web`** → framework preset Next.js → install command `bun install` (at workspace root — Vercel auto-detects when root dir is a sub-package) → build command default.

- [ ] **Step 3: Add env vars**

In Vercel project settings → Environment Variables, add for Production + Preview + Development:
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`
- `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-in`
- `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/`
- `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/onboard`

- [ ] **Step 4: Add Vercel domain to Clerk**

In Clerk dashboard → Domains → add production Vercel URL. Clerk will issue a new redirect callback for the prod domain — update Google Cloud OAuth client's Authorized redirect URIs to include it.

- [ ] **Step 5: Trigger deploy**

Push commit. Verify Vercel deploys green. Open production URL, sign in, complete onboard, confirm dashboard works.

- [ ] **Step 6: Commit deploy notes**

Add a short Deployment section to `README.md` documenting the env vars required and the root-dir Vercel setting.

```bash
git add README.md
git commit -m "Document Vercel deployment"
```

### Task 20: Railway deployment

**Files:**
- Create: `apps/worker/railway.json` (optional, only for explicit root dir)
- Modify: `README.md`

- [ ] **Step 1: Create Railway project**

Railway dashboard → New Project → Deploy from GitHub → select the repo → **Root Directory: `apps/worker`** → start command `bun run start` → service type: web service is fine (Railway runs long-lived processes by default).

- [ ] **Step 2: Add env vars**

In Railway service → Variables:
- `SUPABASE_URL` (same value as frontend `NEXT_PUBLIC_SUPABASE_URL`)
- `SUPABASE_SERVICE_ROLE_KEY`
- `CLERK_SECRET_KEY`
- `POLL_INTERVAL_MS=300000`

- [ ] **Step 3: Verify build + run**

Railway build logs should show `bun install` + start. Deploy logs should show `[worker] starting, interval=300000ms` and periodic `[worker] tick done ...` lines. If a real user is connected, `users=` should be ≥ 1.

- [ ] **Step 4: Commit deploy notes**

Add a Railway section to `README.md`. Commit.

```bash
git add README.md
git commit -m "Document Railway deployment"
```

### Task 21: Update `CLAUDE.md` + add `AGENTS.md`

**Files:**
- Modify: `CLAUDE.md` (root)
- Create: `AGENTS.md` (root)

- [ ] **Step 1: Rewrite `CLAUDE.md`**

```markdown
# CalSync — Calendar Availability Tool

## What it does
CalSync connects to your Google Calendar, keeps your events in sync via a background worker, and auto-generates availability for scheduling tools like Calendly and When2Meet.

## Architecture (bun-workspaces monorepo)
- `apps/web/` — Next.js 16 frontend on Vercel
- `apps/worker/` — Node polling loop on Railway
- `packages/shared/` — types + Google fetch + syncUser
- `supabase/migrations/` — SQL schema

## Data flow
1. User signs in with Google via Clerk (Calendar scope granted at sign-in).
2. Picks which calendars to sync at `/onboard`.
3. `/api/sync-now` triggers an immediate first sync for that user.
4. Worker polls each connected user every 5 minutes thereafter, upserts events into Supabase.
5. Frontend subscribes to Supabase Realtime on the `events` table filtered by user_id. Dashboard recomputes free slots client-side whenever events change.

## Tables (all RLS'd on Clerk `sub`)
- `connected_calendars` — user's opted-in Google calendars
- `events` — normalized event rows (Realtime-enabled)
- `user_settings` — per-user working hours, buffer, platforms

## Local dev
```
bun install
# In two terminals:
bun --cwd apps/web dev
bun --cwd apps/worker dev
```
Env vars: `apps/web/.env.local` and `apps/worker/.env.local` (see `.env.local.example` files).

## Deploy
- Frontend: Vercel with root `apps/web`
- Worker: Railway with root `apps/worker`
- Supabase + Clerk: shared across both
```

- [ ] **Step 2: Create `AGENTS.md`**

Same content as `CLAUDE.md` (Codex reads this instead). Can literally `cp CLAUDE.md AGENTS.md`.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md AGENTS.md
git commit -m "Update architecture docs for multi-user CalSync"
git push
```

---

## Phase 8: End-to-end classmate test (A4 requirement)

### Task 22: Classmate smoke test

- [ ] **Step 1: Send a classmate the production Vercel URL.**

- [ ] **Step 2: Verify they can sign in with Google, grant Calendar scope, complete onboard, and see their own events.**

- [ ] **Step 3: Verify RLS:** in Supabase Table Editor, peek at `events`. They should see both your user_id's events and your classmate's user_id's events. On the frontend, each of you only sees your own.

- [ ] **Step 4: Verify Realtime:** have the classmate create a Google Calendar event. Within ~5 min their dashboard should update without a refresh.

- [ ] **Step 5: Record Slack video reflection (2-3 min)** walking through the architecture, a bug you hit, and something you're proud of. Post to the section Slack channel.

---

## Self-review checklist (complete this before executing)

Before handing off to execution, reviewer (you) spot-checks:

- [ ] **Spec coverage:** Every spec section has at least one task. Auth ✓ (Phase 2). Schema ✓ (Phase 1). Worker ✓ (Phase 4). Onboarding ✓ (Phase 5). Realtime ✓ (Task 15). Deployment ✓ (Phase 7).
- [ ] **Placeholders:** No TODO/TBD/"similar to Task N" in steps above. `sync.test.ts` was planned but dropped — TDD coverage is lighter than skill's ideal, acknowledged: the sync logic is heavily integration-bound (Google API + Clerk + Supabase), so unit coverage is low-value here. Manual smoke tests replace it.
- [ ] **Type consistency:** `EventRow`, `ConnectedCalendarRow`, `UserSettingsRow`, `CalEvent`, `Settings` all defined in Task 2 and used consistently downstream.
- [ ] **No rename drift:** `syncUser`, `listCalendars`, `fetchEvents`, `getClerkClient`, `getUserSupabase`, `getServiceSupabase`, `useEvents`, `useSettings`, `useFreeSlots`, `rowToCalEvent` used with consistent names everywhere they appear.
