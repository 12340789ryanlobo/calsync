import { auth } from "@clerk/nextjs/server";
import { getServiceSupabase } from "./supabase-server";

export async function userHasConnectedCalendars(): Promise<boolean> {
  const { userId } = await auth();
  if (!userId) return false;
  const supa = getServiceSupabase();
  const { data, error } = await supa
    .from("connected_calendars")
    .select("id")
    .eq("user_id", userId)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}
