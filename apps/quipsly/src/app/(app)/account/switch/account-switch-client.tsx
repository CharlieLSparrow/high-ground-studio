"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase/firebase";
import { signOut as firebaseSignOut } from "firebase/auth";
import { CheckCircle2, FlaskConical, KeyRound, LogOut, RefreshCcw, ShieldCheck, UserCheck } from "lucide-react";

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
  const router = useRouter();
  const safeLanes = [
    {
      label: "Charlie / admin",
      description: "Manage users, verify Nests, repair starter state, and inspect auth health.",
      tone: "border-amber-200 bg-amber-50 text-amber-950",
    },
    {
      label: "Invited collaborator",
      description: "Prove an email grant lands on /projects with the assigned Nest visible.",
      tone: "border-sky-200 bg-sky-50 text-sky-950",
    },
    {
      label: "Generated smoke user",
      description: "Codex-safe temporary accounts created by scripts and auto-cleaned after proof.",
      tone: "border-emerald-200 bg-emerald-50 text-emerald-950",
    },
  ];

  async function switchGoogleAccount() {
    setStatus("switching");
    await fetch("/api/auth/session", { method: "DELETE" });
    await firebaseSignOut(auth);
    router.push(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  async function signOutOnly() {
    setStatus("signing-out");
    await fetch("/api/auth/session", { method: "DELETE" });
    await firebaseSignOut(auth);
    router.push("/projects");
    router.refresh();
  }

  return (
    <section className="mx-auto grid min-h-[74vh] max-w-5xl place-items-center px-4 py-10 text-[#3d3122]">
      <div className="w-full rounded-[32px] border border-[#ead8ba] bg-white/95 p-7 shadow-2xl shadow-amber-950/10 md:p-10">
        <p className="text-xs font-black uppercase tracking-[0.28em] text-[#a96735]">
          Quipsly profile vault
        </p>
        <h1 className="mt-4 font-serif text-4xl font-black leading-tight md:text-5xl">
          Choose which real account is opening this Nest.
        </h1>
        <p className="mt-4 text-base leading-7 text-[#6f5a43]">
          Nests belong to the signed-in Quipsly user. This vault does not store passwords and does not impersonate anyone.
          It clears the current Firebase session, sends you through the normal login path, then returns you to the requested
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

        <div className="mt-7 grid gap-3 lg:grid-cols-3">
          {safeLanes.map((lane) => (
            <div
              key={lane.label}
              className={`rounded-2xl border px-4 py-3 ${lane.tone}`}
            >
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em]">
                <UserCheck className="h-4 w-4" />
                {lane.label}
              </div>
              <p className="mt-2 text-sm leading-6 opacity-80">{lane.description}</p>
            </div>
          ))}
        </div>

        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={switchGoogleAccount}
            disabled={status !== "idle"}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#3d2a1e] px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-white shadow-lg shadow-amber-950/15 transition hover:bg-[#24180f] disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCcw className="h-4 w-4" />
            {status === "switching" ? "Opening sign-in..." : "Switch account"}
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

        <div className="mt-6 grid gap-3 lg:grid-cols-2">
          <p className="rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm leading-6 text-cyan-950">
            This is not impersonation. It changes the real signed-in account, so permissions, Home Nest uploads,
            private fiction access, shared research Nests, and beta entitlements all stay honest.
          </p>
          <div className="rounded-2xl border border-[#ead8ba] bg-[#fffaf3] px-4 py-3 text-sm leading-6 text-[#6f5a43]">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[#8c6b4a]">
              <KeyRound className="h-4 w-4" />
              Operator shortcuts
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href="/admin/users"
                className="inline-flex items-center gap-2 rounded-full border border-[#ead8ba] bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-[#7b512d]"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Admin users
              </Link>
              <Link
                href="/admin/auth-diagnostics"
                className="inline-flex items-center gap-2 rounded-full border border-[#ead8ba] bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-[#7b512d]"
              >
                <FlaskConical className="h-3.5 w-3.5" />
                Diagnostics
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
