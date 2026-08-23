"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, ChevronDown, LockKeyhole, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";

const STORAGE_KEY = "quipsly.coaching.invitation.v1";

type Preview = {
  invitation: { invitedEmail: string; role: string; status: string; expiresAt: string };
  engagement: { id: string; title: string };
  signedIn: boolean;
  isRightAccount: boolean;
  canAccept: boolean;
  canOpen: boolean;
};

export function CoachingEngagementInvitation() {
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const fromFragment = params.get("token") || "";
    const capability = fromFragment || window.sessionStorage.getItem(STORAGE_KEY) || "";
    if (fromFragment) {
      window.sessionStorage.setItem(STORAGE_KEY, fromFragment);
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    if (!capability) {
      setError("This invitation link is missing its private capability.");
      setBusy(false);
      return;
    }
    setToken(capability);
    fetch("/api/coaching/engagements/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "PREVIEW", token: capability }),
    }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Invitation could not be reviewed.");
      const nextPreview = body.result as Preview;
      if (nextPreview.canOpen) {
        window.sessionStorage.removeItem(STORAGE_KEY);
        router.replace(`/coaching/engagements/${encodeURIComponent(nextPreview.engagement.id)}`);
        router.refresh();
        return;
      }
      setPreview(nextPreview);
    }).catch((failure) => setError(failure instanceof Error ? failure.message : "Invitation could not be reviewed."))
      .finally(() => setBusy(false));
  }, [router]);

  async function accept() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/coaching/engagements/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ACCEPT", token, requestId: crypto.randomUUID() }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Invitation could not be accepted.");
      window.sessionStorage.removeItem(STORAGE_KEY);
      router.replace(`/coaching/engagements/${encodeURIComponent(body.result.engagementId)}`);
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Invitation could not be accepted.");
      setBusy(false);
    }
  }

  const callbackUrl = "/coaching/engagements/join";
  const switchAccountUrl = `/account/switch?callbackUrl=${encodeURIComponent(callbackUrl)}`;

  return (
    <main className="grid min-h-full place-items-center bg-[#f5efe4] px-5 py-10">
      <section className="w-full max-w-xl overflow-hidden rounded-[2rem] border border-[#dfcfb4] bg-[#fffdf8] shadow-xl shadow-amber-950/10">
        <header className="bg-[#211a14] px-6 py-7 text-[#fff7e8] md:px-8">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#e7b15f]">Quipsly Coaching</p>
          <h1 className="mt-2 font-serif text-3xl font-black md:text-4xl">
            {preview ? `Join ${preview.engagement.title}` : "Open your coaching space"}
          </h1>
        </header>

        <div className="p-6 md:p-8">
          {busy && !preview ? (
            <p className="font-semibold text-[#765f40]">Opening your invitation…</p>
          ) : null}
          {error ? (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 font-bold text-red-800">
              {error}
            </p>
          ) : null}
          {preview ? (
            <>
              <p className="text-sm font-semibold leading-6 text-[#765f40]">
                Continue as <strong className="text-[#3d3122]">{preview.invitation.invitedEmail}</strong> to join the shared Sessions, notes, goals, and tasks for this coaching relationship.
              </p>

              {!preview.signedIn ? (
                <Link
                  href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}
                  className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-violet-800 px-5 text-sm font-black text-white"
                >
                  <LockKeyhole size={17} aria-hidden="true" /> Continue
                </Link>
              ) : !preview.isRightAccount ? (
                <>
                  <p role="alert" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-950">
                    This invitation belongs to {preview.invitation.invitedEmail}. Switch to that account to continue.
                  </p>
                  <Link
                    href={switchAccountUrl}
                    className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-violet-800 px-5 text-sm font-black text-white"
                  >
                    Switch account
                  </Link>
                </>
              ) : preview.canAccept ? (
                <button
                  disabled={busy}
                  onClick={accept}
                  className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-violet-800 px-5 text-sm font-black text-white disabled:opacity-50"
                >
                  <CheckCircle2 size={18} aria-hidden="true" /> Join coaching space
                </button>
              ) : (
                <p role="alert" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-950">
                  This invitation is no longer available. Ask the coach for a new link.
                </p>
              )}

              <details className="mt-5 border-t border-[#eadfc9] pt-4 text-[#765f40]">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-black text-[#5b472f]">
                  <span className="flex items-center gap-2"><ShieldCheck size={17} aria-hidden="true" /> What this opens</span>
                  <ChevronDown size={17} aria-hidden="true" />
                </summary>
                <p className="pb-1 text-xs font-semibold leading-5">
                  This link opens only this coaching relationship and its shared work. It does not open the coach’s surrounding Nest or private notes. The link expires {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(preview.invitation.expiresAt))}.
                </p>
              </details>
            </>
          ) : null}
        </div>
      </section>
    </main>
  );
}
