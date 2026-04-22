import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getServiceSupabase } from "@/lib/supabase-server";

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

  const supa = getServiceSupabase();
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
