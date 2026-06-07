"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn, signOut } from "next-auth/react";
import { CheckCircle2, LogOut, RefreshCcw, ShieldCheck } from "lucide-react";

type AccountSwitchClientProps = {
  callbackUrl: string;
  currentUser: {
    email: string;
    name: string | null;
    image: string | null;
    isStaff: boolean;
  } | null;
};

export function AccountSwitchClient({
  callbackUrl,
  currentUser,
}: AccountSwitchClientProps) {
  const [status, setStatus] = useState<"idle" | "switching" | "signing-out">("idle");

  async function switchGoogleAccount() {
    setStatus("switching");
    await signOut({ redirect: false });
    await signIn("google", { callbackUrl });
  }

  async function signOutOnly() {
    setStatus("signing-out");
    await signOut({ callbackUrl: "/projects" });
  }

  return (
    <section className="mx-auto grid min-h-[74vh] max-w-3xl place-items-center px-4 py-10 text-[#3d3122]">
      <div className="w-full rounded-[32px] border border-[#ead8ba] bg-white/95 p-7 shadow-2xl shadow-amber-950/10 md:p-10">
        <p className="text-xs font-black uppercase tracking-[0.28em] text-[#a96735]">
          Quipsly account switcher
        </p>
        <h1 className="mt-4 font-serif text-4xl font-black leading-tight md:text-5xl">
          Choose which person is opening this Nest.
        </h1>
        <p className="mt-4 text-base leading-7 text-[#6f5a43]">
          Nests belong to the signed-in Quipsly user. Switching accounts changes
          the authenticated identity first, then returns you to the requested
          workspace or Mac handoff.
        </p>

        <div className="mt-7 rounded-3xl border border-[#ead8ba] bg-[#fffaf3] p-5">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 overflow-hidden rounded-2xl border border-white bg-[#ebdcc8] shadow-sm">
              {currentUser?.image ? (
                <img
                  src={currentUser.image}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <img
                  src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(currentUser?.email || "quipsly")}`}
                  alt=""
                  className="h-full w-full object-cover"
                />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-serif text-2xl font-black">
                  {currentUser?.name || "Current Quipsly user"}
                </h2>
                {currentUser?.isStaff ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-800">
                    <ShieldCheck className="h-3 w-3" />
                    Staff
                  </span>
                ) : null}
              </div>
              <p className="mt-1 break-all text-sm font-bold text-[#7a654f]">
                {currentUser?.email || "No current session"}
              </p>
              <p className="mt-2 text-sm leading-6 text-[#8b765f]">
                If this is the wrong person, switch Google accounts before
                opening Nests. If this is correct, continue.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={switchGoogleAccount}
            disabled={status !== "idle"}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#3d2a1e] px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-white shadow-lg shadow-amber-950/15 transition hover:bg-[#24180f] disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCcw className="h-4 w-4" />
            {status === "switching" ? "Opening Google..." : "Switch Google account"}
          </button>
          <Link
            href={callbackUrl}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-emerald-900 transition hover:bg-emerald-100"
          >
            <CheckCircle2 className="h-4 w-4" />
            Continue as current user
          </Link>
        </div>

        <button
          type="button"
          onClick={signOutOnly}
          disabled={status !== "idle"}
          className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#ead8ba] bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-[#7b512d] transition hover:bg-[#fff8ec] disabled:cursor-wait disabled:opacity-60"
        >
          <LogOut className="h-4 w-4" />
          {status === "signing-out" ? "Signing out..." : "Sign out only"}
        </button>

        <p className="mt-6 rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm leading-6 text-cyan-950">
          This is not impersonation. It changes the real signed-in account, so
          permissions, Home Nest uploads, private fiction access, and shared
          research Nests all stay honest.
        </p>
      </div>
    </section>
  );
}
