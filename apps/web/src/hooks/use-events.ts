"use client";

import { useEffect, useState } from "react";
import type { CalEvent, EventRow } from "@/lib/types";

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

const POLL_MS = 30_000;

export function useEvents(): { events: CalEvent[]; loading: boolean; error: string | null } {
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchEvents() {
      try {
        const res = await fetch("/api/events", { cache: "no-store" });
        if (!res.ok) throw new Error(`events fetch failed: ${res.status}`);
        const { events: rows } = (await res.json()) as { events: EventRow[] };
        if (cancelled) return;
        setEvents(rows.map(rowToCalEvent));
        setError(null);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchEvents();
    const handle = setInterval(fetchEvents, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, []);

  return { events, loading, error };
}
