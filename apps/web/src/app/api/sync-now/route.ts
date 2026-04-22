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
