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
