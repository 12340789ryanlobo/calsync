"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import type { CalEvent, EventRow } from "@/lib/types";
import { useSupabase } from "@/lib/supabase";

// Normalize DB row (timestamptz) into existing CalEvent shape (YYYY-MM-DD + HH:MM local).
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
