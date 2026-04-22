"use client";

import { useCallback, useEffect, useState } from "react";
import type { Settings, UserSettingsRow } from "@/lib/types";

const DEFAULTS: Settings = {
  workingHoursStart: "09:00",
  workingHoursEnd: "17:00",
  bufferMinutes: 15,
  meetingLength: 30,
  platforms: ["calendly", "when2meet"],
};

function rowToSettings(row: Partial<UserSettingsRow>): Settings {
  return {
    workingHoursStart: row.working_hours_start ?? DEFAULTS.workingHoursStart,
    workingHoursEnd: row.working_hours_end ?? DEFAULTS.workingHoursEnd,
    bufferMinutes: row.buffer_minutes ?? DEFAULTS.bufferMinutes,
    meetingLength: row.meeting_length ?? DEFAULTS.meetingLength,
    platforms: (row.platforms as Settings["platforms"]) ?? DEFAULTS.platforms,
  };
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => setSettings(rowToSettings(data)))
      .finally(() => setLoading(false));
  }, []);

  const update = useCallback(async (partial: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          working_hours_start: next.workingHoursStart,
          working_hours_end: next.workingHoursEnd,
          buffer_minutes: next.bufferMinutes,
          meeting_length: next.meetingLength,
          platforms: next.platforms,
        }),
      }).catch(() => {});
      return next;
    });
  }, []);

  return { settings, loading, update };
}
