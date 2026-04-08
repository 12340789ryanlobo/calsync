"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import { CalEvent, CalendarSource, FreeSlot, PlatformExport, Settings } from "@/lib/types";
import { generateFreeSlots, getWeekDates } from "@/lib/availability";

interface AppState {
  calendars: CalendarSource[];
  events: CalEvent[];
  freeSlots: FreeSlot[];
  exports: PlatformExport[];
  settings: Settings;
  weekOffset: number;
  addCalendar: (cal: CalendarSource, events: CalEvent[]) => void;
  removeCalendar: (calId: string) => void;
  addEvents: (newEvents: CalEvent[]) => void;
  clearEvents: () => void;
  toggleSlot: (date: string, startTime: string) => void;
  updateSettings: (settings: Partial<Settings>) => void;
  regenerateSlots: () => void;
  confirmExport: (platform: string) => void;
  setWeekOffset: (offset: number) => void;
}

const CALENDAR_COLORS = [
  "#6366f1", // indigo
  "#ec4899", // pink
  "#f59e0b", // amber
  "#10b981", // emerald
  "#8b5cf6", // violet
  "#ef4444", // red
  "#06b6d4", // cyan
  "#f97316", // orange
];

const defaultSettings: Settings = {
  workingHoursStart: "09:00",
  workingHoursEnd: "17:00",
  bufferMinutes: 15,
  meetingLength: 30,
  platforms: ["calendly", "when2meet"],
};

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [calendars, setCalendars] = useState<CalendarSource[]>([]);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [freeSlots, setFreeSlots] = useState<FreeSlot[]>([]);
  const [exports, setExports] = useState<PlatformExport[]>([]);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [weekOffset, setWeekOffset] = useState(0);

  const getCurrentWeekDates = (offset: number = weekOffset) => {
    const ref = new Date();
    ref.setDate(ref.getDate() + offset * 7);
    return getWeekDates(ref);
  };

  const recalcSlots = (allEvents: CalEvent[], currentSettings: Settings, offset?: number) => {
    const dates = getCurrentWeekDates(offset ?? weekOffset);
    const slots = generateFreeSlots(allEvents, currentSettings, dates);
    setFreeSlots(slots);
    setExports(
      currentSettings.platforms.map((p) => ({
        platform: p,
        dateRange: { start: dates[0], end: dates[dates.length - 1] },
        slots: slots.filter((s) => s.available),
        status: "pending" as const,
      }))
    );
  };

  const addCalendar = (cal: CalendarSource, newEvents: CalEvent[]) => {
    // If calendar with same URL exists, replace its events
    const existingIdx = cal.url
      ? calendars.findIndex((c) => c.url === cal.url)
      : -1;

    let updatedCalendars: CalendarSource[];
    let updatedEvents: CalEvent[];

    if (existingIdx >= 0) {
      const existingCal = calendars[existingIdx];
      updatedCalendars = calendars.map((c, i) =>
        i === existingIdx ? { ...cal, id: existingCal.id, color: existingCal.color } : c
      );
      // Remove old events from this calendar, add new ones
      updatedEvents = [
        ...events.filter((e) => e.calendarId !== existingCal.id),
        ...newEvents.map((e) => ({ ...e, calendarId: existingCal.id })),
      ];
    } else {
      const color = CALENDAR_COLORS[calendars.length % CALENDAR_COLORS.length];
      const calWithColor = { ...cal, color };
      updatedCalendars = [...calendars, calWithColor];
      updatedEvents = [...events, ...newEvents];
    }

    setCalendars(updatedCalendars);
    setEvents(updatedEvents);
    recalcSlots(updatedEvents, settings);
  };

  const removeCalendar = (calId: string) => {
    const updatedCalendars = calendars.filter((c) => c.id !== calId);
    const updatedEvents = events.filter((e) => e.calendarId !== calId);
    setCalendars(updatedCalendars);
    setEvents(updatedEvents);
    if (updatedEvents.length > 0) {
      recalcSlots(updatedEvents, settings);
    } else {
      setFreeSlots([]);
      setExports([]);
    }
  };

  const addEvents = (newEvents: CalEvent[]) => {
    const updated = [...events, ...newEvents];
    setEvents(updated);
    recalcSlots(updated, settings);
  };

  const clearEvents = () => {
    setCalendars([]);
    setEvents([]);
    setFreeSlots([]);
    setExports([]);
  };

  const toggleSlot = (date: string, startTime: string) => {
    setFreeSlots((prev) =>
      prev.map((s) =>
        s.date === date && s.startTime === startTime
          ? { ...s, available: !s.available }
          : s
      )
    );
  };

  const updateSettings = (partial: Partial<Settings>) => {
    const updated = { ...settings, ...partial };
    setSettings(updated);
    if (events.length > 0) {
      recalcSlots(events, updated);
    }
  };

  const regenerateSlots = () => {
    recalcSlots(events, settings);
  };

  const confirmExport = (platform: string) => {
    setExports((prev) =>
      prev.map((e) =>
        e.platform === platform ? { ...e, status: "confirmed" as const } : e
      )
    );
  };

  const handleSetWeekOffset = (offset: number) => {
    setWeekOffset(offset);
    if (events.length > 0) {
      recalcSlots(events, settings, offset);
    }
  };

  return (
    <AppContext.Provider
      value={{
        calendars,
        events,
        freeSlots,
        exports,
        settings,
        weekOffset,
        addCalendar,
        removeCalendar,
        addEvents,
        clearEvents,
        toggleSlot,
        updateSettings,
        regenerateSlots,
        confirmExport,
        setWeekOffset: handleSetWeekOffset,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
