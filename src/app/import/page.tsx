"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { parseICS } from "@/lib/ics-parser";
import { CalendarSource } from "@/lib/types";

type ImportMode = "google" | "paste";

const SAMPLE_ICS = `BEGIN:VCALENDAR
BEGIN:VEVENT
SUMMARY:Team Standup
DTSTART:${fmt(0)}T093000
DTEND:${fmt(0)}T100000
END:VEVENT
BEGIN:VEVENT
SUMMARY:Lunch with Alex
DTSTART:${fmt(0)}T120000
DTEND:${fmt(0)}T130000
END:VEVENT
BEGIN:VEVENT
SUMMARY:CS 51238 Lecture
DTSTART:${fmt(1)}T140000
DTEND:${fmt(1)}T153000
END:VEVENT
BEGIN:VEVENT
SUMMARY:Office Hours
DTSTART:${fmt(1)}T160000
DTEND:${fmt(1)}T170000
END:VEVENT
END:VCALENDAR`;

function fmt(offset: number) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

interface SyncState {
  calendarId: string;
  url: string;
  interval: number;
  active: boolean;
}

export default function ImportPage() {
  const [mode, setMode] = useState<ImportMode>("google");
  const [calUrl, setCalUrl] = useState("");
  const [calName, setCalName] = useState("");
  const [icsText, setIcsText] = useState("");
  const [pasteName, setPasteName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [syncs, setSyncs] = useState<SyncState[]>([]);
  const intervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const { calendars, addCalendar, removeCalendar } = useApp();
  const router = useRouter();

  const fetchAndImport = useCallback(
    async (url: string, name: string, silent = false) => {
      if (!silent) setLoading(true);
      setError("");

      try {
        const res = await fetch(`/api/calendar?url=${encodeURIComponent(url)}`);
        const data = await res.json();

        if (!res.ok) {
          if (!silent) setError(data.error || "Failed to fetch calendar");
          if (!silent) setLoading(false);
          return;
        }

        const calId = crypto.randomUUID();
        const events = parseICS(data.ics).map((e) => ({
          ...e,
          calendarId: calId,
        }));

        const cal: CalendarSource = {
          id: calId,
          name: name || extractNameFromUrl(url),
          url,
          color: "",
          type: "google",
          eventCount: events.length,
        };

        addCalendar(cal, events);
        if (!silent) {
          setSuccessMsg(`Imported "${cal.name}" with ${events.length} events`);
          setCalUrl("");
          setCalName("");
        }
      } catch {
        if (!silent) setError("Network error — check your connection");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [addCalendar]
  );

  // Manage sync intervals
  useEffect(() => {
    for (const sync of syncs) {
      const existing = intervalsRef.current.get(sync.calendarId);
      if (sync.active && !existing) {
        const id = setInterval(() => {
          fetchAndImport(sync.url, "", true);
        }, sync.interval * 1000);
        intervalsRef.current.set(sync.calendarId, id);
      } else if (!sync.active && existing) {
        clearInterval(existing);
        intervalsRef.current.delete(sync.calendarId);
      }
    }
    // Clean up removed syncs
    for (const [calId, id] of intervalsRef.current) {
      if (!syncs.find((s) => s.calendarId === calId && s.active)) {
        clearInterval(id);
        intervalsRef.current.delete(calId);
      }
    }
  }, [syncs, fetchAndImport]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const id of intervalsRef.current.values()) clearInterval(id);
    };
  }, []);

  const handleGoogleImport = () => {
    if (!calUrl.trim()) return;
    setSuccessMsg("");
    fetchAndImport(calUrl, calName);
  };

  const handlePaste = () => {
    setError("");
    setSuccessMsg("");
    const calId = crypto.randomUUID();
    const events = parseICS(icsText).map((e) => ({ ...e, calendarId: calId }));
    if (events.length === 0) {
      setError("No events found in the pasted data");
      return;
    }
    const cal: CalendarSource = {
      id: calId,
      name: pasteName || "Pasted Calendar",
      color: "",
      type: "paste",
      eventCount: events.length,
    };
    addCalendar(cal, events);
    setSuccessMsg(`Imported "${cal.name}" with ${events.length} events`);
    setIcsText("");
    setPasteName("");
  };

  const toggleSync = (cal: CalendarSource) => {
    setSyncs((prev) => {
      const existing = prev.find((s) => s.calendarId === cal.id);
      if (existing) {
        return prev.map((s) =>
          s.calendarId === cal.id ? { ...s, active: !s.active } : s
        );
      }
      return [...prev, { calendarId: cal.id, url: cal.url!, interval: 60, active: true }];
    });
  };

  const updateSyncInterval = (calId: string, interval: number) => {
    // Clear existing interval so it restarts with new timing
    const existing = intervalsRef.current.get(calId);
    if (existing) {
      clearInterval(existing);
      intervalsRef.current.delete(calId);
    }
    setSyncs((prev) => prev.map((s) => (s.calendarId === calId ? { ...s, interval } : s)));
  };

  const handleRemove = (calId: string) => {
    // Stop sync if active
    const existing = intervalsRef.current.get(calId);
    if (existing) {
      clearInterval(existing);
      intervalsRef.current.delete(calId);
    }
    setSyncs((prev) => prev.filter((s) => s.calendarId !== calId));
    removeCalendar(calId);
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Import Calendars</h1>
        <p className="mt-1 text-slate-500">
          Connect multiple Google Calendars — they all merge into one view
        </p>
      </div>

      {/* Connected Calendars */}
      {calendars.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">
            Connected Calendars ({calendars.length})
          </h2>
          <div className="space-y-2">
            {calendars.map((cal) => {
              const sync = syncs.find((s) => s.calendarId === cal.id);
              return (
                <div
                  key={cal.id}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: cal.color }}
                    />
                    <div>
                      <p className="text-sm font-medium text-slate-900">{cal.name}</p>
                      <p className="text-xs text-slate-500">
                        {cal.eventCount} event{cal.eventCount !== 1 && "s"} &middot;{" "}
                        {cal.type === "google" ? "Google Calendar" : "Pasted .ics"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Live sync toggle (only for Google calendars) */}
                    {cal.type === "google" && cal.url && (
                      <div className="flex items-center gap-2">
                        {sync?.active && (
                          <select
                            value={sync.interval}
                            onChange={(e) =>
                              updateSyncInterval(cal.id, Number(e.target.value))
                            }
                            className="rounded border border-slate-200 px-1.5 py-1 text-xs text-slate-600"
                          >
                            <option value={30}>30s</option>
                            <option value={60}>1m</option>
                            <option value={300}>5m</option>
                          </select>
                        )}
                        <button
                          onClick={() => toggleSync(cal)}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                            sync?.active ? "bg-emerald-500" : "bg-slate-300"
                          }`}
                          title={sync?.active ? "Syncing" : "Enable live sync"}
                        >
                          <span
                            className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                              sync?.active ? "translate-x-4" : "translate-x-0.5"
                            }`}
                          />
                        </button>
                        {sync?.active && (
                          <span className="flex h-2 w-2 relative">
                            <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                          </span>
                        )}
                      </div>
                    )}
                    <button
                      onClick={() => handleRemove(cal.id)}
                      className="rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => router.push("/")}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Dashboard
            </button>
            <button
              onClick={() => router.push("/review")}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Review Availability
            </button>
          </div>
        </div>
      )}

      {/* Add Another Calendar */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">
          {calendars.length > 0 ? "Add Another Calendar" : "Add a Calendar"}
        </h2>

        {/* Mode Toggle */}
        <div className="mb-4 flex rounded-lg border border-slate-200 bg-slate-50 p-1">
          <button
            onClick={() => { setMode("google"); setError(""); setSuccessMsg(""); }}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              mode === "google"
                ? "bg-indigo-600 text-white"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Google Calendar URL
          </button>
          <button
            onClick={() => { setMode("paste"); setError(""); setSuccessMsg(""); }}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              mode === "paste"
                ? "bg-indigo-600 text-white"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Paste .ics Data
          </button>
        </div>

        {mode === "google" && (
          <div className="space-y-3">
            <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-4">
              <p className="text-xs text-indigo-800">
                <strong>How to get the URL:</strong> Google Calendar &rarr; Settings &rarr; click
                your calendar &rarr; copy the sharing link or &ldquo;Secret address in iCal
                format&rdquo;
              </p>
            </div>
            <div>
              <label htmlFor="cal-name" className="mb-1 block text-xs font-medium text-slate-500">
                Calendar Name (optional)
              </label>
              <input
                id="cal-name"
                type="text"
                value={calName}
                onChange={(e) => setCalName(e.target.value)}
                placeholder="e.g. Work, Personal, UChicago"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
            <div>
              <label htmlFor="cal-url" className="mb-1 block text-xs font-medium text-slate-500">
                Calendar URL
              </label>
              <input
                id="cal-url"
                type="url"
                value={calUrl}
                onChange={(e) => setCalUrl(e.target.value)}
                placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
            <button
              onClick={handleGoogleImport}
              disabled={!calUrl.trim() || loading}
              className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? "Fetching..." : "Add Calendar"}
            </button>
          </div>
        )}

        {mode === "paste" && (
          <div className="space-y-3">
            <div>
              <label htmlFor="paste-name" className="mb-1 block text-xs font-medium text-slate-500">
                Calendar Name (optional)
              </label>
              <input
                id="paste-name"
                type="text"
                value={pasteName}
                onChange={(e) => setPasteName(e.target.value)}
                placeholder="e.g. Work Calendar"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label htmlFor="ics" className="text-xs font-medium text-slate-500">
                  .ics File Contents
                </label>
                <button
                  onClick={() => { setIcsText(SAMPLE_ICS); }}
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
                >
                  Load sample data
                </button>
              </div>
              <textarea
                id="ics"
                value={icsText}
                onChange={(e) => setIcsText(e.target.value)}
                placeholder={"BEGIN:VCALENDAR\nBEGIN:VEVENT\n..."}
                rows={8}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 font-mono text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
            <button
              onClick={handlePaste}
              disabled={!icsText.trim()}
              className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Add Calendar
            </button>
          </div>
        )}

        {error && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
        {successMsg && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-sm text-emerald-700">{successMsg}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function extractNameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const cid = parsed.searchParams.get("cid");
    if (cid) {
      const email = atob(cid);
      return email.split("@")[0];
    }
    // Try to extract from ical path
    const match = url.match(/ical\/([^/]+)\//);
    if (match) return decodeURIComponent(match[1]).split("@")[0];
  } catch { /* ignore */ }
  return "Google Calendar";
}
