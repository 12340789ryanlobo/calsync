"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useEvents } from "@/hooks/use-events";
import { useSettings } from "@/hooks/use-settings";
import { useFreeSlots } from "@/hooks/use-free-slots";
import { formatTime, formatDateShort, generateFreeSlots, localDateStr, todayStr } from "@/lib/availability";

export default function ReviewPage() {
  const { events } = useEvents();
  const { settings } = useSettings();
  const freeSlots = useFreeSlots(events, settings, 0);
  const [copiedPlatform, setCopiedPlatform] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});

  // When2Meet auto-fill state
  const [w2mUrl, setW2mUrl] = useState("");
  const [w2mName, setW2mName] = useState("");
  const [w2mPassword, setW2mPassword] = useState("");
  const [w2mLoading, setW2mLoading] = useState(false);
  const [w2mResult, setW2mResult] = useState<{ success: boolean; message: string } | null>(null);

  const availableSlots = freeSlots.filter((s) => s.available);

  // Group slots by date
  const slotsByDate: Record<string, typeof availableSlots> = {};
  for (const slot of availableSlots) {
    if (!slotsByDate[slot.date]) slotsByDate[slot.date] = [];
    slotsByDate[slot.date].push(slot);
  }

  const today = todayStr();
  const dates = Object.keys(slotsByDate).filter((d) => d >= today).sort();

  const exports = useMemo(
    () =>
      settings.platforms.map((p) => ({
        platform: p,
        slots: availableSlots,
        status: confirmed[p] ? ("confirmed" as const) : ("pending" as const),
      })),
    [settings.platforms, availableSlots, confirmed]
  );

  const confirmExport = (platform: string) => {
    setConfirmed((prev) => ({ ...prev, [platform]: true }));
  };

  const generateText = () => {
    let text = `My availability (via CalSync):\n\n`;
    for (const date of dates) {
      const slots = slotsByDate[date];
      text += `${formatDateShort(date)}:\n`;
      for (const slot of slots) {
        text += `  ${formatTime(slot.startTime)} - ${formatTime(slot.endTime)}\n`;
      }
      text += "\n";
    }
    return text.trim();
  };

  const copyToClipboard = async (platform: string) => {
    const text = generateText();
    await navigator.clipboard.writeText(text);
    setCopiedPlatform(platform);
    setTimeout(() => setCopiedPlatform(null), 2000);
  };

  const handleW2mSubmit = async () => {
    if (!w2mUrl || !w2mName) return;
    setW2mLoading(true);
    setW2mResult(null);

    try {
      // Parse event ID from URL
      const eventMatch = w2mUrl.match(/when2meet\.com\/\?(\d+-\w+)/);
      if (!eventMatch) {
        setW2mResult({ success: false, message: "Invalid When2Meet URL" });
        setW2mLoading(false);
        return;
      }
      const eventId = eventMatch[1];

      // Step 1: Get time slots from When2Meet
      setW2mResult({ success: true, message: "Fetching When2Meet slots..." });
      const slotsRes = await fetch("/api/when2meet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get-slots", eventId }),
      });
      const slotsData = await slotsRes.json();
      if (!slotsRes.ok) {
        setW2mResult({ success: false, message: slotsData.error });
        setW2mLoading(false);
        return;
      }

      // Step 2: Match slots CLIENT-SIDE (correct timezone)
      // Extract ALL unique dates from the W2M event
      const allSlots = slotsData.slots as number[];
      const now = todayStr();
      const w2mDates = [...new Set(
        allSlots.filter(Boolean).map((ts) => localDateStr(new Date(ts * 1000)))
      )].filter((d) => d >= now).sort();

      // Generate fresh free slots for ALL W2M dates (not just current week)
      const myAvailableSlots = generateFreeSlots(events, settings, w2mDates).filter((s) => s.available);
      const availableSlotsNumeric: number[] = [];
      const unavailableSlots: number[] = [];
      let fullAvailability = "";

      for (const ts of allSlots) {
        if (!ts) {
          fullAvailability += "0";
          continue;
        }
        const d = new Date(ts * 1000); // browser interprets in local timezone
        const dateStr = localDateStr(d);
        const timeMinutes = d.getHours() * 60 + d.getMinutes();

        let isAvailable = false;
        for (const slot of myAvailableSlots) {
          if (slot.date !== dateStr) continue;
          const [sh, sm] = slot.startTime.split(":").map(Number);
          const [eh, em] = slot.endTime.split(":").map(Number);
          if (timeMinutes >= sh * 60 + sm && timeMinutes < eh * 60 + em) {
            isAvailable = true;
            break;
          }
        }

        if (isAvailable) {
          availableSlotsNumeric.push(ts);
          fullAvailability += "1";
        } else {
          unavailableSlots.push(ts);
          fullAvailability += "0";
        }
      }

      if (availableSlotsNumeric.length === 0) {
        const freeDates = [...new Set(myAvailableSlots.map((s) => s.date))].join(", ");
        const w2mStart = formatDateShort(localDateStr(new Date(allSlots.find(Boolean)! * 1000)));
        const w2mEnd = formatDateShort(localDateStr(new Date(allSlots[allSlots.length - 1] * 1000)));
        setW2mResult({
          success: false,
          message: `No matching slots. Your free slots: ${freeDates || "none"}. When2Meet: ${w2mStart} – ${w2mEnd}.`,
        });
        setW2mLoading(false);
        return;
      }

      // Step 3: Login
      setW2mResult({ success: true, message: "Logging in..." });
      const loginRes = await fetch("/api/when2meet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", eventId, name: w2mName, password: w2mPassword }),
      });
      const loginData = await loginRes.json();
      if (!loginRes.ok) {
        setW2mResult({ success: false, message: loginData.error });
        setW2mLoading(false);
        return;
      }

      // Step 4: Submit — first clears old availability, then sets new
      setW2mResult({ success: true, message: `Setting ${availableSlotsNumeric.length} available, clearing ${unavailableSlots.length} unavailable...` });
      const submitRes = await fetch("/api/when2meet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit",
          eventId,
          userId: loginData.userId,
          password: w2mPassword,
          availableSlots: availableSlotsNumeric,
          unavailableSlots,
          fullAvailability,
        }),
      });
      const submitData = await submitRes.json();

      if (submitRes.ok) {
        setW2mResult({
          success: true,
          message: `Done! ${submitData.available} slots available, ${submitData.unavailable} cleared. Refresh When2Meet to see "${w2mName}".`,
        });
        confirmExport("when2meet");
      } else {
        setW2mResult({ success: false, message: submitData.error });
      }
    } catch (err) {
      setW2mResult({ success: false, message: `Error: ${err instanceof Error ? err.message : "Unknown"}` });
    } finally {
      setW2mLoading(false);
    }
  };

  if (events.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Review & Confirm</h1>
        <div className="mt-8 rounded-xl border-2 border-dashed border-slate-200 p-12 text-center">
          <p className="text-lg font-medium text-slate-400">No calendar data yet</p>
          <Link
            href="/onboard"
            className="mt-4 inline-block rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Connect Calendar
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Review & Confirm</h1>
        <p className="mt-1 text-slate-500">
          Double-check your availability, then auto-fill your scheduling tools
        </p>
      </div>

      {/* Availability Preview */}
      <div className="mb-8 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">
          Your Available Slots ({availableSlots.length})
        </h2>
        {dates.length === 0 ? (
          <p className="text-sm text-slate-400">
            No available slots. Adjust settings or import more events.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {dates.map((date) => (
              <div key={date} className="rounded-lg border border-slate-100 p-3">
                <p className="text-xs font-semibold text-slate-500">{formatDateShort(date)}</p>
                <div className="mt-1.5 space-y-1">
                  {slotsByDate[date].map((slot, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-emerald-400" />
                      <span className="text-sm text-slate-700">
                        {formatTime(slot.startTime)} &ndash; {formatTime(slot.endTime)}
                      </span>
                    </div>
                  ))}
                </div>
                <Link
                  href={`/day/${date}`}
                  className="mt-2 block text-xs font-medium text-indigo-600 hover:text-indigo-700"
                >
                  Edit slots &rarr;
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* When2Meet Auto-Fill */}
      <div className="mb-6 rounded-xl border border-purple-200 bg-purple-50 p-5">
        <div className="mb-4 flex items-center gap-3">
          <h2 className="text-lg font-semibold text-purple-900">When2Meet</h2>
          <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-700">
            Auto-fill
          </span>
        </div>
        <p className="mb-4 text-sm text-purple-800">
          Paste your When2Meet link and we&apos;ll fill in your availability automatically.
        </p>

        <div className="space-y-3">
          <div>
            <label htmlFor="w2m-url" className="mb-1 block text-xs font-medium text-purple-700">
              When2Meet URL
            </label>
            <input
              id="w2m-url"
              type="url"
              value={w2mUrl}
              onChange={(e) => setW2mUrl(e.target.value)}
              placeholder="https://www.when2meet.com/?36034137-XT354"
              className="w-full rounded-lg border border-purple-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="w2m-name" className="mb-1 block text-xs font-medium text-purple-700">
                Your Name (as shown on When2Meet)
              </label>
              <input
                id="w2m-name"
                type="text"
                value={w2mName}
                onChange={(e) => setW2mName(e.target.value)}
                placeholder="Ryan"
                className="w-full rounded-lg border border-purple-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
              />
            </div>
            <div>
              <label
                htmlFor="w2m-pass"
                className="mb-1 block text-xs font-medium text-purple-700"
              >
                Password (optional)
              </label>
              <input
                id="w2m-pass"
                type="password"
                value={w2mPassword}
                onChange={(e) => setW2mPassword(e.target.value)}
                placeholder="Leave blank if none"
                className="w-full rounded-lg border border-purple-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
              />
            </div>
          </div>
          <button
            onClick={handleW2mSubmit}
            disabled={!w2mUrl || !w2mName || w2mLoading}
            className="rounded-lg bg-purple-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {w2mLoading ? "Filling in..." : "Auto-fill When2Meet"}
          </button>

          {w2mResult && (
            <div
              className={`rounded-lg p-3 text-sm ${
                w2mResult.success
                  ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border border-red-200 bg-red-50 text-red-800"
              }`}
            >
              {w2mResult.message}
            </div>
          )}
        </div>
      </div>

      {/* Other Platform Exports */}
      <div className="space-y-4">
        {exports
          .filter((exp) => exp.platform !== "when2meet")
          .map((exp) => (
            <div
              key={exp.platform}
              className="rounded-xl border border-blue-200 bg-blue-50 p-5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold text-blue-900">
                    {exp.platform === "calendly" ? "Calendly" : "Other"}
                  </h3>
                  <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                    {exp.status === "pending"
                      ? "Copy & Paste"
                      : exp.status === "confirmed"
                      ? "Confirmed"
                      : "Sent"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => copyToClipboard(exp.platform)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    {copiedPlatform === exp.platform ? "Copied!" : "Copy Availability Text"}
                  </button>
                  {exp.status === "pending" && (
                    <button
                      onClick={() => confirmExport(exp.platform)}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700"
                    >
                      Mark as Done
                    </button>
                  )}
                </div>
              </div>
              <p className="mt-2 text-sm text-blue-800 opacity-70">
                {availableSlots.length} slot{availableSlots.length !== 1 && "s"} across{" "}
                {dates.length} day{dates.length !== 1 && "s"} — copy the text and paste it
                manually
              </p>
            </div>
          ))}
      </div>

      {exports.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-slate-500">No platforms configured.</p>
          <Link
            href="/settings"
            className="mt-2 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-700"
          >
            Configure platforms &rarr;
          </Link>
        </div>
      )}
    </div>
  );
}
