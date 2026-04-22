import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="max-w-md text-center">
        <h1 className="text-4xl font-semibold">CalSync</h1>
        <p className="mt-2 text-slate-300">
          Auto-refreshing availability from your Google Calendar. Sign in to connect
          your calendars and start sharing free slots in seconds.
        </p>
      </div>
      <SignIn
        path="/sign-in"
        routing="path"
        forceRedirectUrl="/"
        signUpForceRedirectUrl="/onboard"
      />
    </main>
  );
}
