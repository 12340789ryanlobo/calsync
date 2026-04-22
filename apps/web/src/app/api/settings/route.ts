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
