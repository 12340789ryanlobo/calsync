import { redirect } from "next/navigation";
import { userHasConnectedCalendars } from "@/lib/onboarding";
import DashboardClient from "./DashboardClient";

export default async function HomePage() {
  const hasCalendars = await userHasConnectedCalendars();
  if (!hasCalendars) redirect("/onboard");
  return <DashboardClient />;
}
