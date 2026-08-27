"use client";

import { usePathname, useSearchParams } from "next/navigation";

export function nestCallbackPath(pathname: string | null, search: string) {
  const safePath = pathname && pathname.startsWith("/") && !pathname.startsWith("//")
    ? pathname
    : "/projects";
  const safeSearch = search.startsWith("?") ? search : search ? `?${search}` : "";
  return `${safePath}${safeSearch}`;
}

function gateCopy(pathname: string) {
  if (pathname.startsWith("/coaching")) {
    return {
      eyebrow: "Quipsly Coaching",
      title: "Your coaching work continues here.",
      body: "Sign in to schedule sessions, invite clients, meet and record, then work with the transcript, notes, goals, tasks, and client-safe follow-up in one private place.",
      action: "Sign in to coaching",
    };
  }
  if (pathname.startsWith("/sessions")) {
    return {
      eyebrow: "Private Quipsly Session",
      title: "Open the Session you were invited to.",
      body: "Sign in with the invited email. Quipsly will return you to this Session so you can join, record if you choose, and keep shared notes and tasks together.",
      action: "Sign in to this Session",
    };
  }
  return {
    eyebrow: "Quipsly Nest",
    title: "Your private creative workspace lives here.",
    body: "Sign in once to return to the exact Quipsly workspace you opened—projects, notes, research, writing, media, Sessions, and publishing stay connected.",
    action: "Sign in to Quipsly",
  };
}

export function NestSignInGate() {
  const pathname = usePathname() || "/projects";
  const searchParams = useSearchParams();
  const callbackPath = nestCallbackPath(pathname, searchParams.toString());
  const copy = gateCopy(pathname);
  const loginHref = `/login?callbackUrl=${encodeURIComponent(callbackPath)}`;

  return (
    <main className="min-h-screen bg-[#fdf6ea] px-5 py-10 text-[#3d2a1e]">
      <section className="mx-auto flex min-h-[76vh] max-w-4xl flex-col justify-center rounded-[36px] border border-[#ead8ba] bg-white/90 p-8 shadow-2xl shadow-amber-950/10 md:p-12">
        <p className="text-xs font-black uppercase tracking-[0.32em] text-[#a96735]">
          {copy.eyebrow}
        </p>
        <h1 className="mt-5 font-serif text-5xl font-black leading-tight tracking-tight md:text-6xl">
          {copy.title}
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-[#6f5a43]">
          {copy.body}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href={loginHref}
            className="rounded-full bg-[#3d2a1e] px-6 py-3 text-sm font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-amber-950/20"
          >
            {copy.action}
          </a>
          <a
            href="https://quipsly.com/support"
            className="rounded-full border border-[#ffc0c5] bg-[#fff1f2] px-6 py-3 text-sm font-black uppercase tracking-[0.18em] text-[#a32631]"
          >
            Get help
          </a>
        </div>
        <p className="mt-8 max-w-2xl text-sm leading-6 text-[#8b765f]">
          Signing in does not join a call or start a recording. Quipsly asks for consent and recording choices inside the Session.
        </p>
      </section>
    </main>
  );
}
