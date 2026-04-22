"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton, SignInButton, Show } from "@clerk/nextjs";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/review", label: "Review" },
  { href: "/settings", label: "Settings" },
];

export default function Nav() {
  const pathname = usePathname();
  if (pathname?.startsWith("/sign-in")) return null;

  return (
    <nav className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
      <Link href="/" className="text-lg font-semibold">CalSync</Link>
      <div className="flex items-center gap-6">
        <Show when="signed-in">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={pathname === l.href ? "text-white" : "text-slate-400 hover:text-white"}
            >
              {l.label}
            </Link>
          ))}
          <UserButton />
        </Show>
        <Show when="signed-out">
          <SignInButton mode="modal">
            <button className="rounded bg-indigo-500 px-3 py-1 text-sm">Sign in</button>
          </SignInButton>
        </Show>
      </div>
    </nav>
  );
}
