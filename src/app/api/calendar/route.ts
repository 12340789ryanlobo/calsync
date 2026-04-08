import { NextRequest, NextResponse } from "next/server";

function resolveGoogleCalendarUrl(input: string): string | null {
  try {
    const parsed = new URL(input);
    if (parsed.hostname !== "calendar.google.com") return null;

    // Already an .ics URL: calendar.google.com/calendar/ical/.../basic.ics
    if (parsed.pathname.includes("/ical/") && input.endsWith(".ics")) {
      return input;
    }

    // Sharing link: calendar.google.com/calendar/u/0?cid=BASE64_EMAIL
    const cid = parsed.searchParams.get("cid");
    if (cid) {
      // cid is base64-encoded email
      const email = atob(cid);
      return `https://calendar.google.com/calendar/ical/${encodeURIComponent(email)}/public/basic.ics`;
    }

    // Embed or other format with src param: calendar.google.com/calendar/embed?src=EMAIL
    const src = parsed.searchParams.get("src");
    if (src) {
      return `https://calendar.google.com/calendar/ical/${encodeURIComponent(src)}/public/basic.ics`;
    }

    return null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  const icsUrl = resolveGoogleCalendarUrl(url);

  if (!icsUrl) {
    return NextResponse.json(
      {
        error:
          "Couldn't parse that URL. Paste either the sharing link (calendar.google.com/calendar/u/0?cid=...) or the secret .ics address.",
      },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(icsUrl, { next: { revalidate: 0 } });
    if (!res.ok) {
      if (res.status === 404) {
        return NextResponse.json(
          {
            error:
              "Calendar not found. Make sure the calendar is set to public, or use the \"Secret address in iCal format\" from Google Calendar settings.",
          },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: `Google Calendar returned ${res.status}` },
        { status: 502 }
      );
    }
    const icsText = await res.text();
    return NextResponse.json({ ics: icsText });
  } catch {
    return NextResponse.json(
      {
        error:
          "Failed to fetch calendar. Check that the URL is correct and the calendar is shared.",
      },
      { status: 502 }
    );
  }
}
