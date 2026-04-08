import { CalEvent, FreeSlot, Settings } from "./types";

// Helper: format a local Date as YYYY-MM-DD without going through UTC
export function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Helper: get today's date string in local time
export function todayStr(): string {
  return localDateStr(new Date());
}

export function generateFreeSlots(
  events: CalEvent[],
  settings: Settings,
  dates: string[]
): FreeSlot[] {
  const slots: FreeSlot[] = [];

  for (const date of dates) {
    const dayEvents = events
      .filter((e) => e.date === date)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    const busyBlocks = dayEvents.map((e) => ({
      start: timeToMinutes(e.startTime),
      end: timeToMinutes(e.endTime),
    }));

    // Merge overlapping busy blocks
    const merged = mergeBlocks(busyBlocks);

    const workStart = timeToMinutes(settings.workingHoursStart);
    const workEnd = timeToMinutes(settings.workingHoursEnd);
    const buffer = settings.bufferMinutes;

    // Find gaps in working hours
    let cursor = workStart;
    for (const block of merged) {
      const blockStart = Math.max(block.start - buffer, workStart);
      if (cursor < blockStart) {
        slots.push({
          date,
          startTime: minutesToTime(cursor),
          endTime: minutesToTime(blockStart),
          available: true,
        });
      }
      cursor = Math.max(cursor, block.end + buffer);
    }

    if (cursor < workEnd) {
      slots.push({
        date,
        startTime: minutesToTime(cursor),
        endTime: minutesToTime(workEnd),
        available: true,
      });
    }
  }

  return slots;
}

function mergeBlocks(
  blocks: { start: number; end: number }[]
): { start: number; end: number }[] {
  if (blocks.length === 0) return [];
  const sorted = [...blocks].sort((a, b) => a.start - b.start);
  const merged = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    if (sorted[i].start <= last.end) {
      last.end = Math.max(last.end, sorted[i].end);
    } else {
      merged.push(sorted[i]);
    }
  }
  return merged;
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function getWeekDates(referenceDate: Date): string[] {
  const dates: string[] = [];
  const day = referenceDate.getDay();
  const monday = new Date(referenceDate);
  monday.setDate(referenceDate.getDate() - ((day + 6) % 7));

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(localDateStr(d));
  }
  return dates;
}

export function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00"); // noon avoids any day-boundary issues
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
