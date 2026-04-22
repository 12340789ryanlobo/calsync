-- connected_calendars: which Google calendars each user has opted in to
CREATE TABLE connected_calendars (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  google_calendar_id text NOT NULL,
  name text NOT NULL,
  color text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, google_calendar_id)
);

ALTER TABLE connected_calendars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own rows select" ON connected_calendars
  FOR SELECT USING (auth.jwt() ->> 'sub' = user_id);
CREATE POLICY "own rows insert" ON connected_calendars
  FOR INSERT WITH CHECK (auth.jwt() ->> 'sub' = user_id);
CREATE POLICY "own rows update" ON connected_calendars
  FOR UPDATE USING (auth.jwt() ->> 'sub' = user_id);
CREATE POLICY "own rows delete" ON connected_calendars
  FOR DELETE USING (auth.jwt() ->> 'sub' = user_id);

-- events: normalized Google Calendar events. Worker upserts here via service role.
CREATE TABLE events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  google_calendar_id text NOT NULL,
  google_event_id text NOT NULL,
  title text NOT NULL DEFAULT '',
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, google_event_id)
);

CREATE INDEX events_user_start_idx ON events(user_id, start_at);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own events select" ON events
  FOR SELECT USING (auth.jwt() ->> 'sub' = user_id);

-- user_settings
CREATE TABLE user_settings (
  user_id text PRIMARY KEY,
  working_hours_start text NOT NULL DEFAULT '09:00',
  working_hours_end text NOT NULL DEFAULT '17:00',
  buffer_minutes integer NOT NULL DEFAULT 15,
  meeting_length integer NOT NULL DEFAULT 30,
  platforms text[] NOT NULL DEFAULT ARRAY['calendly','when2meet'],
  timezone text NOT NULL DEFAULT 'America/Chicago',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own settings select" ON user_settings
  FOR SELECT USING (auth.jwt() ->> 'sub' = user_id);
CREATE POLICY "own settings insert" ON user_settings
  FOR INSERT WITH CHECK (auth.jwt() ->> 'sub' = user_id);
CREATE POLICY "own settings update" ON user_settings
  FOR UPDATE USING (auth.jwt() ->> 'sub' = user_id);

-- Enable Realtime on events so the frontend can subscribe
ALTER PUBLICATION supabase_realtime ADD TABLE events;
