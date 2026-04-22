import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase-server";
import { syncUser, getClerkClient } from "@calsync/shared";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  const supa = getServiceSupabase();
  const clerk = getClerkClient();

  const { data: rows, error } = await supa
    .from("connected_calendars")
    .select("user_id")
    .eq("enabled", true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const uniqueUsers = Array.from(new Set((rows ?? []).map((r) => r.user_id)));
  let upserts = 0;
  let deletes = 0;
  const errors: string[] = [];

  for (const userId of uniqueUsers) {
    try {
      const result = await syncUser({ userId, supabaseServiceClient: supa, clerk });
      upserts += result.eventsUpserted;
      deletes += result.eventsDeleted;
      errors.push(...result.errors.map((e) => `${userId}: ${e}`));
    } catch (e) {
      errors.push(`${userId}: ${(e as Error).message}`);
    }
  }

  return NextResponse.json({
    users: uniqueUsers.length,
    upserts,
    deletes,
    errors,
    ms: Date.now() - started,
  });
}
