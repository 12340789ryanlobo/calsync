"use client";

import { use, useEffect, useState, useMemo } from "react";
import Link from "next/link";
import type { CalEvent, ConnectedCalendarRow } from "@/lib/types";
import { useEvents } from "@/hooks/use-events";
import { useSettings } from "@/hooks/use-settings";
import { generateFreeSlots, formatTime, timeToMinutes, formatDateShort, localDateStr } from "@/lib/availability";

// Lay out events into side-by-side columns when they overlap in time.
// Returns each event with (col, cols) so the caller can compute left/width.
function layoutEvents(events: CalEvent[]): { event: CalEvent; col: number; cols: number }[] {
  const sorted = [...events].sort((a, b) => {
    if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
    return b.endTime.localeCompare(a.endTime);
  });
  const placed: { event: CalEvent; col: number; cols: number }[] = [];
  for (const event of sorted) {
    const used = new Set<number>();
    for (const p of placed) {
      if (p.event.startTime < event.endTime && p.event.endTime > event.startTime) {
        used.add(p.col);
      }
    }
    let col = 0;
    while (used.has(col)) col++;
    placed.push({ event, col, cols: 0 });
  }
  // For each event, cols = (max col among overlapping events) + 1.
  for (const p of placed) {
    let maxCol = p.col;
    for (const q of placed) {
      if (q.event.startTime < p.event.endTime && q.event.endTime > p.event.startTime) {
        if (q.col > maxCol) maxCol = q.col;
      }
    }
    p.cols = maxCol + 1;
  }
  return placed;
}

export default function DayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = use(params);
  const { events } = useEvents();
  const { settings } = useSettings();
  const [calendars, setCalendars] = useState<ConnectedCalendarRow[]>([]);
  const [overriddenSlots, setOverriddenSlots] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    fetch("/api/calendars/connected")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data.calendars)) setCalendars(data.calendars);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const calendarColorMap = new Map(calendars.map((c) => [c.google_calendar_id, c.color]));
  const calendarNameMap = new Map(calendars.map((c) => [c.google_calendar_id, c.name]));

  const dayEvents = events
    .filter((e) => e.date === date)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const daySlots = useMemo(() => {
    const base = generateFreeSlots(events, settings, [date]);
    return base.map((s) => {
      const key = `${s.date}|${s.startTime}`;
      const override = overriddenSlots[key];
      return override !== undefined ? { ...s, available: override } : s;
    });
  }, [events, settings, date, overriddenSlots]);

  const toggleSlot = (slotDate: string, startTime: string) => {
    const key = `${slotDate}|${startTime}`;
    setOverriddenSlots((prev) => {
      const current = daySlots.find((s) => s.date === slotDate && s.startTime === startTime);
      const nextVal = current ? !current.available : true;
      return { ...prev, [key]: nextVal };
    });
  };

  // Build timeline from 7am to 10pm
  const hours = Array.from({ length: 16 }, (_, i) => i + 7);

  // Map events and slots to pixel positions
  const timelineStart = 7 * 60;
  const timelineEnd = 23 * 60;
  const totalMinutes = timelineEnd - timelineStart;

  const toPercent = (time: string) => {
    const mins = timeToMinutes(time);
    return ((mins - timelineStart) / totalMinutes) * 100;
  };

  const heightPercent = (start: string, end: string) => {
    const s = timeToMinutes(start);
    const e = timeToMinutes(end);
    return ((e - s) / totalMinutes) * 100;
  };

  const displayDate = new Date(date + "T12:00:00"); // noon avoids day-boundary issues
  const fullDate = displayDate.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Navigate to prev/next day
  const prevDay = new Date(date + "T12:00:00");
  prevDay.setDate(prevDay.getDate() - 1);
  const nextDay = new Date(date + "T12:00:00");
  nextDay.setDate(nextDay.getDate() + 1);
  const prevDate = localDateStr(prevDay);
  const nextDate = localDateStr(nextDay);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <Link
          href={`/day/${prevDate}`}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          &larr; {formatDateShort(prevDate)}
        </Link>
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{fullDate}</h1>
          <p className="text-sm text-slate-500">
            {dayEvents.length} event{dayEvents.length !== 1 && "s"} &middot;{" "}
            {daySlots.filter((s) => s.available).length} free slot
            {daySlots.filter((s) => s.available).length !== 1 && "s"}
          </p>
        </div>
        <Link
          href={`/day/${nextDate}`}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          {formatDateShort(nextDate)} &rarr;
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Timeline */}
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-4 text-sm font-semibold text-slate-700">Timeline</h2>
            <div className="relative" style={{ height: "640px" }}>
              {/* Hour lines */}
              {hours.map((h) => {
                const top = ((h * 60 - timelineStart) / totalMinutes) * 100;
                return (
                  <div
                    key={h}
                    className="absolute left-0 right-0 flex items-start"
                    style={{ top: `${top}%` }}
                  >
                    <span className="w-12 shrink-0 text-xs text-slate-400 -translate-y-1/2">
                      {formatTime(`${String(h).padStart(2, "0")}:00`)}
                    </span>
                    <div className="flex-1 border-t border-slate-100" />
                  </div>
                );
              })}

              {/* Busy blocks — positioned in side-by-side columns when overlapping */}
              <div className="absolute left-14 right-2 top-0 bottom-0 pointer-events-none">
                {layoutEvents(dayEvents).map(({ event, col, cols }) => {
                  const color = calendarColorMap.get(event.calendarId) || "#ef4444";
                  const widthPct = 100 / cols;
                  return (
                    <div
                      key={event.id}
                      className="absolute rounded-lg border px-2 py-1 overflow-hidden pointer-events-auto"
                      style={{
                        top: `${toPercent(event.startTime)}%`,
                        height: `${heightPercent(event.startTime, event.endTime)}%`,
                        left: `calc(${col * widthPct}% + 2px)`,
                        width: `calc(${widthPct}% - 4px)`,
                        minHeight: "24px",
                        backgroundColor: `${color}18`,
                        borderColor: `${color}40`,
                      }}
                    >
                      <p className="text-xs font-semibold truncate" style={{ color }}>{event.title}</p>
                      <p className="text-xs truncate" style={{ color: `${color}bb` }}>
                        {formatTime(event.startTime)} &ndash; {formatTime(event.endTime)}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Free slots */}
              {daySlots.map((slot, i) => (
                <button
                  key={i}
                  onClick={() => toggleSlot(slot.date, slot.startTime)}
                  className={`absolute left-14 right-2 rounded-lg border px-3 py-1.5 text-left transition-colors ${
                    slot.available
                      ? "bg-emerald-50 border-emerald-200 hover:bg-emerald-100"
                      : "bg-slate-50 border-slate-200 opacity-50 hover:opacity-70"
                  }`}
                  style={{
                    top: `${toPercent(slot.startTime)}%`,
                    height: `${heightPercent(slot.startTime, slot.endTime)}%`,
                    minHeight: "24px",
                  }}
                >
                  <p
                    className={`text-xs font-semibold ${
                      slot.available ? "text-emerald-800" : "text-slate-500 line-through"
                    }`}
                  >
                    {slot.available ? "Available" : "Blocked"}
                  </p>
                  <p
                    className={`text-xs ${slot.available ? "text-emerald-600" : "text-slate-400"}`}
                  >
                    {formatTime(slot.startTime)} &ndash; {formatTime(slot.endTime)}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Events</h2>
            {dayEvents.length === 0 ? (
              <p className="text-sm text-slate-400">No events this day</p>
            ) : (
              <div className="space-y-2">
                {dayEvents.map((e) => {
                  const color = calendarColorMap.get(e.calendarId) || "#ef4444";
                  const calName = calendarNameMap.get(e.calendarId);
                  return (
                    <div
                      key={e.id}
                      className="rounded-lg p-3"
                      style={{ backgroundColor: `${color}12`, borderLeft: `3px solid ${color}` }}
                    >
                      <p className="text-sm font-medium" style={{ color }}>{e.title}</p>
                      <p className="text-xs text-slate-500">
                        {formatTime(e.startTime)} &ndash; {formatTime(e.endTime)}
                      </p>
                      {calName && <p className="text-xs text-slate-400 mt-0.5">{calName}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Free Slots</h2>
            <p className="mb-2 text-xs text-slate-400">Click a slot on the timeline to toggle it</p>
            {daySlots.length === 0 ? (
              <p className="text-sm text-slate-400">No free slots</p>
            ) : (
              <div className="space-y-2">
                {daySlots.map((s, i) => (
                  <div
                    key={i}
                    className={`rounded-lg p-3 ${
                      s.available ? "bg-emerald-50" : "bg-slate-50 opacity-60"
                    }`}
                  >
                    <p
                      className={`text-sm font-medium ${
                        s.available ? "text-emerald-900" : "text-slate-500 line-through"
                      }`}
                    >
                      {formatTime(s.startTime)} &ndash; {formatTime(s.endTime)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {Math.round((timeToMinutes(s.endTime) - timeToMinutes(s.startTime)) / 60 * 10) / 10}h
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Link
            href="/"
            className="block rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-center text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
