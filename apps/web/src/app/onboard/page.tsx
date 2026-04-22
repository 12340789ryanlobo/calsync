"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Calendar {
  id: string;
  name: string;
  color: string | null;
  primary: boolean;
}

export default function OnboardPage() {
  const router = useRouter();
  const [calendars, setCalendars] = useState<Calendar[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/calendars/list")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setCalendars(data.calendars);
        setSelected(new Set(data.calendars.filter((c: Calendar) => c.primary).map((c: Calendar) => c.id)));
      })
      .catch((e) => setError(e.message));
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    if (!calendars) return;
    setLoading(true);
    setError(null);
    try {
      const chosen = calendars.filter((c) => selected.has(c.id));
      const res = await fetch("/api/calendars/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          calendars: chosen.map((c) => ({ googleCalendarId: c.id, name: c.name, color: c.color })),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "save failed");
      // Fire-and-forget — don't block navigation on sync-now failure.
      fetch("/api/sync-now", { method: "POST" }).catch(() => {});
      router.push("/");
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  }

  if (error) {
    return (
      <main className="p-8">
        <p className="text-red-400">Error: {error}</p>
      </main>
    );
  }
  if (!calendars) return <main className="p-8">Loading your calendars...</main>;

  return (
    <main className="mx-auto max-w-xl space-y-6 p-8">
      <header>
        <h1 className="text-3xl font-semibold">Pick your calendars</h1>
        <p className="mt-2 text-slate-400">
          CalSync will watch these calendars for busy events. You can change this later.
        </p>
      </header>

      <ul className="divide-y divide-slate-800 rounded border border-slate-800">
        {calendars.map((c) => (
          <li key={c.id} className="flex items-center gap-3 p-3">
            <input
              type="checkbox"
              checked={selected.has(c.id)}
              onChange={() => toggle(c.id)}
              id={c.id}
            />
            <label htmlFor={c.id} className="flex-1">
              {c.name}
              {c.primary && <span className="ml-2 text-xs text-slate-500">(primary)</span>}
            </label>
            {c.color && <span className="h-3 w-3 rounded-full" style={{ background: c.color }} />}
          </li>
        ))}
      </ul>

      <button
        onClick={submit}
        disabled={loading || selected.size === 0}
        className="rounded bg-indigo-500 px-4 py-2 disabled:opacity-50"
      >
        {loading ? "Saving..." : `Continue (${selected.size} selected)`}
      </button>
    </main>
  );
}
