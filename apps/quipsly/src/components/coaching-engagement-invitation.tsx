"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";

const STORAGE_KEY = "quipsly.coaching.invitation.v1";

type Preview = {
  invitation: { invitedEmail: string; role: string; status: string; expiresAt: string };
  engagement: { id: string; title: string };
  signedIn: boolean;
  isRightAccount: boolean;
  canAccept: boolean;
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
      setPreview(body.result);
    }).catch((failure) => setError(failure instanceof Error ? failure.message : "Invitation could not be reviewed."))
      .finally(() => setBusy(false));
  }, []);

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

  return <main className="min-h-full bg-[#f5efe4] px-5 py-12"><section className="mx-auto max-w-2xl rounded-[2rem] border border-[#dfcfb4] bg-[#fffdf8] p-8 shadow-sm"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-800"><KeyRound /></div><p className="mt-6 text-[10px] font-black uppercase tracking-[0.22em] text-violet-800">Private Coaching Engagement</p><h1 className="mt-2 font-serif text-4xl font-black text-[#3d3122]">Review your invitation</h1>
    {busy && !preview ? <p className="mt-6 font-semibold text-[#765f40]">Checking the invitation…</p> : null}
    {error ? <p role="alert" className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 font-bold text-red-800">{error}</p> : null}
    {preview ? <div className="mt-6"><div className="rounded-2xl border border-violet-200 bg-violet-50 p-5"><p className="text-sm font-semibold text-violet-900">You were invited to</p><p className="mt-1 font-serif text-2xl font-black text-violet-950">{preview.engagement.title}</p><p className="mt-3 text-sm font-bold text-violet-900">{preview.invitation.invitedEmail} · {preview.invitation.role.toLowerCase()}</p><p className="mt-1 text-xs text-violet-800">Link status: {preview.invitation.status.toLowerCase()} · expires {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(preview.invitation.expiresAt))}</p></div>
      <div className="mt-5 flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900"><ShieldCheck className="mt-1 shrink-0" size={19} /><p><strong>Scoped access:</strong> accepting opens this coaching relationship and its shared Sessions, goals, commitments, and thread. It does not open the coach’s surrounding Nest or private notes.</p></div>
      {!preview.signedIn ? <div className="mt-6"><p className="flex items-center gap-2 text-sm font-bold text-[#765f40]"><LockKeyhole size={17} /> Sign in as {preview.invitation.invitedEmail} to continue.</p><Link href={`/login?callbackUrl=${encodeURIComponent("/coaching/engagements/join")}`} className="mt-4 inline-flex rounded-full bg-violet-800 px-5 py-3 font-black text-white">Sign in to accept</Link></div> : !preview.isRightAccount ? <div className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-bold text-amber-950">You are signed in with a different Quipsly account. Sign out, then sign in as {preview.invitation.invitedEmail}. The invitation remains in this browser tab.</div> : preview.canAccept ? <button disabled={busy} onClick={accept} className="mt-6 inline-flex items-center gap-2 rounded-full bg-violet-800 px-5 py-3 font-black text-white disabled:opacity-50"><CheckCircle2 size={18} /> Accept engagement access</button> : null}
    </div> : null}
  </section></main>;
}
