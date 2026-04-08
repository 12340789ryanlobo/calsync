# CalSync — Calendar Availability Tool

## What it does
CalSync reads your Google Calendar data (via .ics paste) and auto-generates your availability for scheduling tools like Calendly and When2Meet. You import your calendar, review the generated free slots, and confirm before "sending."

## Pages
- `/` — Dashboard: week overview with busy/free blocks and export status
- `/import` — Import Calendar: paste .ics data or text schedule, parses into events
- `/day/[date]` — Day Detail: timeline view of a single day, toggle slots on/off
- `/review` — Review & Confirm: preview what gets sent to each platform, approve/edit
- `/settings` — Preferences: working hours, buffer time, meeting length, platforms

## Data Model (client-side state via React Context)
- **Event**: `{ id, title, date, startTime, endTime, source }`
- **FreeSlot**: `{ date, startTime, endTime, available }`
- **Export**: `{ platform, dateRange, slots, status: 'pending' | 'confirmed' | 'sent' }`
- **Settings**: `{ workingHoursStart, workingHoursEnd, bufferMinutes, meetingLength, platforms }`

## Style
- Clean, modern UI with Tailwind
- Dark navy/indigo accent palette
- Geist font (default from Next.js)
- Emphasis on the timeline/schedule visualization

## Tech
- Next.js App Router + TypeScript + Tailwind CSS
- Client-side state only (data disappears on refresh — database comes in Week 3)
- Deployed to Vercel
