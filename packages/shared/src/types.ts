// UI-facing shapes (unchanged from original app)
export interface CalendarSource {
  id: string;
  name: string;
  url?: string;
  color: string;
  type: "google" | "paste";
  eventCount: number;
}

export interface CalEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD (local)
  startTime: string; // HH:MM (local)
  endTime: string; // HH:MM (local)
  source: "google" | "manual";
  calendarId: string;
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

// DB row shapes (Supabase)
export interface ConnectedCalendarRow {
  id: string;
  user_id: string;
  google_calendar_id: string;
  name: string;
  color: string | null;
  enabled: boolean;
  created_at: string;
}

export interface EventRow {
  id: string;
  user_id: string;
  google_calendar_id: string;
  google_event_id: string;
  title: string;
  start_at: string;
  end_at: string;
  updated_at: string;
}

export interface UserSettingsRow {
  user_id: string;
  working_hours_start: string;
  working_hours_end: string;
  buffer_minutes: number;
  meeting_length: number;
  platforms: string[];
  timezone: string;
  updated_at: string;
}
