import { google } from "googleapis";

export interface GoogleEvent {
  googleEventId: string;
  googleCalendarId: string;
  title: string;
  startAt: string; // ISO
  endAt: string;
}

export interface GoogleCalendarSummary {
  id: string;
  name: string;
  color: string | null;
  primary: boolean;
}

/** List calendars the user has access to. */
export async function listCalendars(accessToken: string): Promise<GoogleCalendarSummary[]> {
  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: accessToken });
  const cal = google.calendar({ version: "v3", auth: oauth2 });
  const res = await cal.calendarList.list();
  return (res.data.items ?? []).map((c) => ({
    id: c.id!,
    name: c.summary ?? c.id!,
    color: c.backgroundColor ?? null,
    primary: c.primary ?? false,
  }));
}

/** Fetch timed events for one calendar in a time window. */
export async function fetchEvents(params: {
  accessToken: string;
  calendarId: string;
  timeMinIso: string;
  timeMaxIso: string;
}): Promise<GoogleEvent[]> {
  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: params.accessToken });
  const cal = google.calendar({ version: "v3", auth: oauth2 });
  const res = await cal.events.list({
    calendarId: params.calendarId,
    timeMin: params.timeMinIso,
    timeMax: params.timeMaxIso,
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 250,
  });
  const items = res.data.items ?? [];
  return items
    .filter((e) => e.start?.dateTime && e.end?.dateTime) // drop all-day events for MVP
    .map((e) => ({
      googleEventId: e.id!,
      googleCalendarId: params.calendarId,
      title: e.summary ?? "(no title)",
      startAt: e.start!.dateTime!,
      endAt: e.end!.dateTime!,
    }));
}
