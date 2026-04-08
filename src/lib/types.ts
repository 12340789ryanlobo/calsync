export interface CalendarSource {
  id: string;
  name: string;
  url?: string; // Google Calendar URL (if connected)
  color: string;
  type: "google" | "paste";
  eventCount: number;
}

export interface CalEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  source: "google" | "manual";
  calendarId: string; // links to CalendarSource.id
}

export interface FreeSlot {
  date: string;
  startTime: string;
  endTime: string;
  available: boolean;
}

export interface PlatformExport {
  platform: "calendly" | "when2meet" | "other";
  dateRange: { start: string; end: string };
  slots: FreeSlot[];
  status: "pending" | "confirmed" | "sent";
}

export interface Settings {
  workingHoursStart: string;
  workingHoursEnd: string;
  bufferMinutes: number;
  meetingLength: number;
  platforms: ("calendly" | "when2meet" | "other")[];
}
