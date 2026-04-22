"use client";

import { useMemo } from "react";
import type { CalEvent, Settings, FreeSlot } from "@/lib/types";
import { generateFreeSlots, getWeekDates } from "@/lib/availability";

export function useFreeSlots(events: CalEvent[], settings: Settings, weekOffset: number): FreeSlot[] {
  return useMemo(() => {
    const ref = new Date();
    ref.setDate(ref.getDate() + weekOffset * 7);
    const dates = getWeekDates(ref);
    return generateFreeSlots(events, settings, dates);
  }, [events, settings, weekOffset]);
}
