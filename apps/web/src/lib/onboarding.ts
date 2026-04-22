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
