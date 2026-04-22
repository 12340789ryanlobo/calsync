import { createClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Server route handler, acts AS the signed-in user. RLS-enforced.
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

// Server-only, BYPASSES RLS. Use sparingly (worker writes, sync-now write path).
export function getServiceSupabase() {
  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
