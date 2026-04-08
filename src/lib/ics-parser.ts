import { CalEvent } from "./types";

export function parseICS(icsText: string): CalEvent[] {
  const events: CalEvent[] = [];
  const lines = icsText.split(/\r?\n/);

  let inEvent = false;
  let summary = "";
  let dtStart = "";
  let dtEnd = "";

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      inEvent = true;
      summary = "";
      dtStart = "";
      dtEnd = "";
    } else if (line === "END:VEVENT" && inEvent) {
      inEvent = false;
      if (dtStart) {
        const { date, time: startTime } = parseDateTime(dtStart);
        const { time: endTime } = dtEnd
          ? parseDateTime(dtEnd)
          : { time: addHour(startTime) };

        events.push({
          id: crypto.randomUUID(),
          title: summary || "Untitled Event",
          date,
          startTime,
          endTime,
          calendarId: "",
          source: "google",
        });
      }
    } else if (inEvent) {
      if (line.startsWith("SUMMARY:")) {
        summary = line.slice(8);
      } else if (line.startsWith("DTSTART")) {
        dtStart = extractValue(line);
      } else if (line.startsWith("DTEND")) {
        dtEnd = extractValue(line);
      }
    }
  }

  return events;
}

function extractValue(line: string): string {
  // Handle DTSTART;TZID=...:20240101T090000 or DTSTART:20240101T090000
  const colonIdx = line.indexOf(":", line.indexOf(":") > -1 ? 0 : 0);
  // Find the last colon for value extraction
  const parts = line.split(":");
  return parts[parts.length - 1];
}

function parseDateTime(dt: string): { date: string; time: string } {
  // Format: 20240101T090000 or 20240101T090000Z
  const clean = dt.replace("Z", "");
  if (clean.includes("T")) {
    const [datePart, timePart] = clean.split("T");
    const date = `${datePart.slice(0, 4)}-${datePart.slice(4, 6)}-${datePart.slice(6, 8)}`;
    const time = `${timePart.slice(0, 2)}:${timePart.slice(2, 4)}`;
    return { date, time };
  }
  // Date only
  const date = `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
  return { date, time: "00:00" };
}

function addHour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const newH = Math.min(h + 1, 23);
  return `${String(newH).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
