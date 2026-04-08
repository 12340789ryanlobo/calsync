"use client";

import { useApp } from "@/context/AppContext";

const allPlatforms: { value: "calendly" | "when2meet" | "other"; label: string }[] = [
  { value: "calendly", label: "Calendly" },
  { value: "when2meet", label: "When2Meet" },
  { value: "other", label: "Other" },
];

export default function SettingsPage() {
  const { settings, updateSettings, regenerateSlots, events } = useApp();

  const togglePlatform = (platform: "calendly" | "when2meet" | "other") => {
    const current = settings.platforms;
    const updated = current.includes(platform)
      ? current.filter((p) => p !== platform)
      : [...current, platform];
    updateSettings({ platforms: updated });
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Settings</h1>
        <p className="mt-1 text-slate-500">Configure your availability preferences</p>
      </div>

      <div className="space-y-6">
        {/* Working Hours */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Working Hours</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="start" className="mb-1 block text-xs font-medium text-slate-500">
                Start Time
              </label>
              <input
                id="start"
                type="time"
                value={settings.workingHoursStart}
                onChange={(e) => updateSettings({ workingHoursStart: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
            <div>
              <label htmlFor="end" className="mb-1 block text-xs font-medium text-slate-500">
                End Time
              </label>
              <input
                id="end"
                type="time"
                value={settings.workingHoursEnd}
                onChange={(e) => updateSettings({ workingHoursEnd: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </div>
        </div>

        {/* Buffer & Meeting Length */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Meeting Preferences</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="buffer" className="mb-1 block text-xs font-medium text-slate-500">
                Buffer Between Meetings (min)
              </label>
              <input
                id="buffer"
                type="number"
                min={0}
                max={60}
                step={5}
                value={settings.bufferMinutes}
                onChange={(e) => updateSettings({ bufferMinutes: Number(e.target.value) })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
            <div>
              <label htmlFor="length" className="mb-1 block text-xs font-medium text-slate-500">
                Default Meeting Length (min)
              </label>
              <input
                id="length"
                type="number"
                min={15}
                max={120}
                step={15}
                value={settings.meetingLength}
                onChange={(e) => updateSettings({ meetingLength: Number(e.target.value) })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </div>
        </div>

        {/* Platforms */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Export Platforms</h2>
          <div className="space-y-3">
            {allPlatforms.map((p) => (
              <label key={p.value} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.platforms.includes(p.value)}
                  onChange={() => togglePlatform(p.value)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm font-medium text-slate-700">{p.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Regenerate */}
        {events.length > 0 && (
          <button
            onClick={regenerateSlots}
            className="w-full rounded-lg bg-indigo-600 px-5 py-3 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Recalculate Availability with New Settings
          </button>
        )}
      </div>
    </div>
  );
}
