import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { listCalendars } from "@calsync/shared";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const clerk = await clerkClient();
  const tokens = await clerk.users.getUserOauthAccessToken(userId, "google");
  const first = Array.isArray(tokens) ? tokens[0] : tokens?.data?.[0];
  if (!first?.token) {
    return NextResponse.json(
      { error: "No Google token. Sign out and sign in with Google again to grant Calendar access." },
      { status: 400 },
    );
  }

  try {
    const calendars = await listCalendars(first.token);
    return NextResponse.json({ calendars });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
