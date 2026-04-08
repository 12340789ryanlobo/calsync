import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === "get-slots") {
      const { eventId } = body;
      const res = await fetch(`https://www.when2meet.com/?${eventId}`, {
        headers: { "User-Agent": "Mozilla/5.0 CalSync/1.0" },
      });
      if (!res.ok)
        return NextResponse.json(
          { error: `Failed to fetch event: ${res.status}` },
          { status: 502 }
        );

      const html = await res.text();

      // Extract ordered TimeOfSlot array
      const slots: number[] = [];
      const slotRegex = /TimeOfSlot\[(\d+)\]\s*=\s*(\d+)/g;
      let m;
      while ((m = slotRegex.exec(html)) !== null) {
        slots[parseInt(m[1])] = parseInt(m[2]);
      }

      if (slots.length === 0)
        return NextResponse.json(
          { error: "Could not parse time slots from event page" },
          { status: 500 }
        );

      // Return full ordered array (including any undefined gaps as 0)
      const cleanSlots = slots.map((s) => s || 0);
      return NextResponse.json({ slots: cleanSlots, totalSlots: cleanSlots.length });
    }

    if (action === "login") {
      const { eventId, name, password } = body;
      const numericId = eventId.split("-")[0];

      const params = new URLSearchParams({
        id: numericId,
        name,
        password: password || "",
      });

      const res = await fetch("https://www.when2meet.com/ProcessLogin.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });

      if (!res.ok)
        return NextResponse.json({ error: `Login failed: ${res.status}` }, { status: 502 });

      const text = await res.text();
      const match = text.match(/\d+/);
      if (!match)
        return NextResponse.json({ error: `Login response: ${text}` }, { status: 400 });

      return NextResponse.json({ userId: match[0] });
    }

    if (action === "submit") {
      // W2M needs TWO requests:
      // 1. ChangeToAvailable=true  → mark available slots
      // 2. ChangeToAvailable=false → CLEAR unavailable slots (removes old stale data)
      const { eventId, userId, password, availableSlots, unavailableSlots, fullAvailability } = body;
      const numericId = eventId.split("-")[0];

      // First: clear unavailable slots
      if (unavailableSlots && unavailableSlots.length > 0) {
        const clearParams = new URLSearchParams({
          person: userId,
          event: numericId,
          slots: unavailableSlots.join(","),
          availability: fullAvailability,
          password: password || "",
          ChangeToAvailable: "false",
        });

        await fetch("https://www.when2meet.com/SaveTimes.php", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: clearParams.toString(),
        });
      }

      // Then: set available slots
      if (availableSlots && availableSlots.length > 0) {
        const setParams = new URLSearchParams({
          person: userId,
          event: numericId,
          slots: availableSlots.join(","),
          availability: fullAvailability,
          password: password || "",
          ChangeToAvailable: "true",
        });

        const res = await fetch("https://www.when2meet.com/SaveTimes.php", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: setParams.toString(),
        });

        if (!res.ok) {
          const text = await res.text();
          return NextResponse.json(
            { error: `Save failed (${res.status}): ${text}` },
            { status: 502 }
          );
        }
      }

      return NextResponse.json({
        success: true,
        available: availableSlots?.length || 0,
        unavailable: unavailableSlots?.length || 0,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
