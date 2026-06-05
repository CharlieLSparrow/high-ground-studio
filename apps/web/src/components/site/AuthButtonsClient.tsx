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
        className="group relative inline-flex items-center justify-center gap-3 overflow-hidden rounded-full bg-[#FF424D] px-8 py-3.5 text-sm font-bold text-white shadow-[0_0_40px_-10px_#FF424D] transition-all hover:scale-105 hover:bg-[#FF424D]/90 hover:shadow-[0_0_60px_-15px_#FF424D] active:scale-95"
      >
        <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:animate-[shimmer_1.5s_infinite]" />
        <svg
          viewBox="0 0 569 546"
          className="h-4 w-4 fill-current"
          xmlns="http://www.w3.org/2000/svg"
        >
          <g>
            <circle cx="362.589996" cy="204.589996" r="204.589996" />
            <rect height="545.799988" width="100" x="0" y="0" />
          </g>
        </svg>
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
