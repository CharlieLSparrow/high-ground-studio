"use client";

import { signIn, signOut } from "next-auth/react";

export default function AuthButtonsClient({
  session,
}: {
  session: any;
}) {
  if (!session) {
    return (
      <button
        onClick={() => signIn("patreon")}
        className="rounded-full border border-white/15 bg-white/10 px-6 py-2.5 text-sm font-semibold text-[var(--text-light)] transition hover:border-[#FF424D] hover:text-[#FF424D]"
      >
        Sign in with Patreon
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="hidden text-sm text-[var(--text-light)]/80 sm:inline">
        {session.user?.name ?? session.user?.email}
      </span>

      <button
        onClick={() => signOut()}
        className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-[var(--text-light)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
      >
        Sign out
      </button>
    </div>
  );
}
