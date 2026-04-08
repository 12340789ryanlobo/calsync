"use client";

import { use } from "react";
import Link from "next/link";
import { useApp } from "@/context/AppContext";
import { formatTime, timeToMinutes, formatDateShort } from "@/lib/availability";

export default function DayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = use(params);
  const { events, freeSlots, toggleSlot, calendars } = useApp();
  const calendarColorMap = new Map(calendars.map((c) => [c.id, c.color]));
  const calendarNameMap = new Map(calendars.map((c) => [c.id, c.name]));

  const dayEvents = events
    .filter((e) => e.date === date)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const daySlots = freeSlots.filter((s) => s.date === date);

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

  const displayDate = new Date(date + "T00:00:00");
  const fullDate = displayDate.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Navigate to prev/next day
  const prevDay = new Date(displayDate);
  prevDay.setDate(prevDay.getDate() - 1);
  const nextDay = new Date(displayDate);
  nextDay.setDate(nextDay.getDate() + 1);
  const prevDate = prevDay.toISOString().split("T")[0];
  const nextDate = nextDay.toISOString().split("T")[0];

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

              {/* Busy blocks */}
              {dayEvents.map((event) => {
                const color = calendarColorMap.get(event.calendarId) || "#ef4444";
                return (
                  <div
                    key={event.id}
                    className="absolute left-14 right-2 rounded-lg border px-3 py-1.5 overflow-hidden"
                    style={{
                      top: `${toPercent(event.startTime)}%`,
                      height: `${heightPercent(event.startTime, event.endTime)}%`,
                      minHeight: "24px",
                      backgroundColor: `${color}18`,
                      borderColor: `${color}40`,
                    }}
                  >
                    <p className="text-xs font-semibold truncate" style={{ color }}>{event.title}</p>
                    <p className="text-xs" style={{ color: `${color}bb` }}>
                      {formatTime(event.startTime)} &ndash; {formatTime(event.endTime)}
                    </p>
                  </div>
                );
              })}

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
