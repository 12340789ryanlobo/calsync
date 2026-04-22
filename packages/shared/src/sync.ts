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

  // Get current Google access token via Clerk. Clerk auto-refreshes.
  let accessToken: string;
  try {
    const tokens = await clerk.users.getUserOauthAccessToken(userId, "google");
    // SDK historically returned either Array<{token}> or {data: Array<{token}>} depending on version; handle both.
    const first = Array.isArray(tokens) ? tokens[0] : tokens?.data?.[0];
    if (!first?.token) throw new Error("no token returned");
    accessToken = first.token;
  } catch (err) {
    result.errors.push(`clerk token: ${(err as Error).message}`);
    return result;
  }

  // Load enabled calendars for this user.
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

      // Delete events in this calendar+window that are no longer present in the fresh set.
      const freshIds = events.map((e) => e.googleEventId);
      // PostgREST `not.in.(...)` expects the list comma-separated in parens; quote each value.
      const quoted = freshIds.length > 0
        ? freshIds.map((id) => `"${id.replace(/"/g, '\\"')}"`).join(",")
        : `""`; // empty-set sentinel
      const { data: deleted, error: delErr } = await db
        .from("events")
        .delete({ count: "exact" })
        .eq("user_id", userId)
        .eq("google_calendar_id", google_calendar_id)
        .gte("start_at", timeMinIso)
        .lte("start_at", timeMaxIso)
        .not("google_event_id", "in", `(${quoted})`)
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
