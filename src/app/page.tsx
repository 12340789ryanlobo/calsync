"use client";

import Link from "next/link";
import { useApp } from "@/context/AppContext";
import { getWeekDates, formatDateShort, formatTime, timeToMinutes } from "@/lib/availability";

export default function Dashboard() {
  const { events, freeSlots, exports, weekOffset, setWeekOffset, calendars } = useApp();

  const calendarColorMap = new Map(calendars.map((c) => [c.id, c.color]));

  const ref = new Date();
  ref.setDate(ref.getDate() + weekOffset * 7);
  const weekDates = getWeekDates(ref);

  const totalFreeMinutes = freeSlots
    .filter((s) => s.available)
    .reduce((acc, s) => acc + (timeToMinutes(s.endTime) - timeToMinutes(s.startTime)), 0);
  const totalFreeHours = Math.round(totalFreeMinutes / 60 * 10) / 10;

  const pendingExports = exports.filter((e) => e.status === "pending").length;
  const confirmedExports = exports.filter((e) => e.status === "confirmed").length;

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Dashboard</h1>
        <p className="mt-1 text-slate-500">Your week at a glance</p>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-4">
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
          <p className="text-sm font-medium text-slate-500">Pending</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{pendingExports}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-medium text-slate-500">Confirmed</p>
          <p className="mt-1 text-2xl font-bold text-indigo-600">{confirmedExports}</p>
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
            Import your Google Calendar to get started
          </p>
          <Link
            href="/import"
            className="mt-4 inline-block rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Import Calendar
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-2">
          {weekDates.map((date) => {
            const dayEvents = events.filter((e) => e.date === date);
            const daySlots = freeSlots.filter((s) => s.date === date && s.available);
            const isToday = date === new Date().toISOString().split("T")[0];

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
                  {daySlots.length > 0 && (
                    <div className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-700">
                      {daySlots.length} free slot{daySlots.length !== 1 && "s"}
                    </div>
                  )}
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
            href="/import"
            className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Add / Manage Calendars
          </Link>
        </div>
      )}
    </div>
  );
}
