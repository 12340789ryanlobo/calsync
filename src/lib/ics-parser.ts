import { CalEvent } from "./types";
import { localDateStr } from "./availability";

export function parseICS(icsText: string): CalEvent[] {
  const events: CalEvent[] = [];
  const lines = unfoldLines(icsText.split(/\r?\n/));

  let inEvent = false;
  let summary = "";
  let dtStartLine = "";
  let dtEndLine = "";

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      inEvent = true;
      summary = "";
      dtStartLine = "";
      dtEndLine = "";
    } else if (line === "END:VEVENT" && inEvent) {
      inEvent = false;
      if (dtStartLine) {
        const start = parseDTLine(dtStartLine);
        const end = dtEndLine ? parseDTLine(dtEndLine) : null;

        events.push({
          id: crypto.randomUUID(),
          title: summary || "Untitled Event",
          date: start.date,
          startTime: start.time,
          endTime: end ? end.time : addHour(start.time),
          calendarId: "",
          source: "google",
        });
      }
    } else if (inEvent) {
      if (line.startsWith("SUMMARY:")) {
        summary = line.slice(8);
      } else if (line.startsWith("DTSTART")) {
        dtStartLine = line;
      } else if (line.startsWith("DTEND")) {
        dtEndLine = line;
      }
    }
  }

  return events;
}

// ICS lines can be "folded" — continuation lines start with a space/tab
function unfoldLines(lines: string[]): string[] {
  const result: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && result.length > 0) {
      result[result.length - 1] += line.slice(1);
    } else {
      result.push(line);
    }
  }
  return result;
}

// Parse DTSTART/DTEND line. Handles:
// - DTSTART:20240101T090000Z          → UTC, convert to local
// - DTSTART:20240101T090000           → floating/local, keep as-is
// - DTSTART;TZID=America/Chicago:20240101T090000 → treat as local (Google exports in user's TZ)
// - DTSTART;VALUE=DATE:20240101       → all-day
function parseDTLine(line: string): { date: string; time: string } {
  const colonIdx = line.indexOf(":");
  const value = line.substring(colonIdx + 1).trim();

  const isUTC = value.endsWith("Z");
  const clean = value.replace("Z", "");

  if (!clean.includes("T")) {
    // All-day event
    const date = `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
    return { date, time: "00:00" };
  }

  const [datePart, timePart] = clean.split("T");
  const year = parseInt(datePart.slice(0, 4));
  const month = parseInt(datePart.slice(4, 6)) - 1;
  const day = parseInt(datePart.slice(6, 8));
  const hour = parseInt(timePart.slice(0, 2));
  const minute = parseInt(timePart.slice(2, 4));

  if (isUTC) {
    // UTC timestamp — convert to local time via Date object
    const d = new Date(Date.UTC(year, month, day, hour, minute));
    return {
      date: localDateStr(d),
      time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
    };
  }

  // No Z suffix (with or without TZID) — treat as local time
  // Google Calendar exports TZID matching the user's timezone, so this is correct
  return {
    date: `${datePart.slice(0, 4)}-${datePart.slice(4, 6)}-${datePart.slice(6, 8)}`,
    time: `${timePart.slice(0, 2)}:${timePart.slice(2, 4)}`,
  };
}

function addHour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const newH = Math.min(h + 1, 23);
  return `${String(newH).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
