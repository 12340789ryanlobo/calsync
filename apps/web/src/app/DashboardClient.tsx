"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ConnectedCalendarRow } from "@/lib/types";
import { useEvents } from "@/hooks/use-events";
import { useSettings } from "@/hooks/use-settings";
import { useFreeSlots } from "@/hooks/use-free-slots";
import { getWeekDates, formatDateShort, formatTime, timeToMinutes, todayStr } from "@/lib/availability";

export default function DashboardClient() {
  const [weekOffset, setWeekOffset] = useState(0);
  const { events } = useEvents();
  const { settings } = useSettings();
  const freeSlots = useFreeSlots(events, settings, weekOffset);
  const [calendars, setCalendars] = useState<ConnectedCalendarRow[]>([]);

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

  const ref = new Date();
  ref.setDate(ref.getDate() + weekOffset * 7);
  const weekDates = getWeekDates(ref);

  const totalFreeMinutes = freeSlots
    .filter((s) => s.available)
    .reduce((acc, s) => acc + (timeToMinutes(s.endTime) - timeToMinutes(s.startTime)), 0);
  const totalFreeHours = Math.round(totalFreeMinutes / 60 * 10) / 10;

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Dashboard</h1>
        <p className="mt-1 text-slate-500">
          Your week at a glance &middot; Free between{" "}
          <span className="font-medium text-indigo-600">
            {formatTime(settings.workingHoursStart)}–{formatTime(settings.workingHoursEnd)}
          </span>
        </p>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-medium text-slate-500">Events</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {events.filter((e) => weekDates.includes(e.date)).length}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-medium text-slate-500">Free Hours</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">{totalFreeHours}h</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-medium text-slate-500">Calendars</p>
          <p className="mt-1 text-2xl font-bold text-indigo-600">{calendars.length}</p>
        </div>
      </div>

      {/* Week Navigation */}
      <div className="mb-6 flex items-center justify-between">
        <button
          onClick={() => setWeekOffset(weekOffset - 1)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          &larr; Prev Week
        </button>
        <button
          onClick={() => setWeekOffset(0)}
          className="rounded-lg px-3 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50"
        >
          This Week
        </button>
        <button
          onClick={() => setWeekOffset(weekOffset + 1)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Next Week &rarr;
        </button>
      </div>

      {/* Week Grid */}
      {events.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-slate-200 p-12 text-center">
          <p className="text-lg font-medium text-slate-400">No calendar data yet</p>
          <p className="mt-1 text-sm text-slate-400">
            Connect your Google Calendar to get started
          </p>
          <Link
            href="/onboard"
            className="mt-4 inline-block rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Connect Calendar
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-2">
          {weekDates.map((date) => {
            const dayEvents = events.filter((e) => e.date === date);
            const daySlots = freeSlots.filter((s) => s.date === date && s.available);
            const isToday = date === todayStr();

            return (
              <Link
                key={date}
                href={`/day/${date}`}
                className={`rounded-xl border p-3 transition-colors hover:border-indigo-300 hover:bg-indigo-50/50 ${
                  isToday ? "border-indigo-300 bg-indigo-50/30" : "border-slate-200 bg-white"
                }`}
              >
                <p
                  className={`text-xs font-semibold ${
                    isToday ? "text-indigo-600" : "text-slate-500"
                  }`}
                >
                  {formatDateShort(date)}
                </p>
                <div className="mt-2 space-y-1">
                  {dayEvents.slice(0, 3).map((e) => {
                    const color = calendarColorMap.get(e.calendarId);
                    return (
                      <div
                        key={e.id}
                        className="rounded px-1.5 py-0.5 text-xs truncate"
                        style={{
                          backgroundColor: color ? `${color}18` : "#fef2f2",
                          color: color || "#b91c1c",
                          borderLeft: color ? `3px solid ${color}` : undefined,
                        }}
                      >
                        {formatTime(e.startTime)} {e.title}
                      </div>
                    );
                  })}
                  {dayEvents.length > 3 && (
                    <p className="text-xs text-slate-400">+{dayEvents.length - 3} more</p>
                  )}
                  {daySlots.map((s, i) => (
                    <div
                      key={`free-${i}`}
                      className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-700 truncate"
                    >
                      {formatTime(s.startTime)}–{formatTime(s.endTime)}
                    </div>
                  ))}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Quick Actions */}
      {events.length > 0 && (
        <div className="mt-8 flex gap-3">
          <Link
            href="/review"
            className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Review & Send Availability
          </Link>
          <Link
            href="/onboard"
            className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Manage Calendars
          </Link>
        </div>
      )}
    </div>
  );
}
