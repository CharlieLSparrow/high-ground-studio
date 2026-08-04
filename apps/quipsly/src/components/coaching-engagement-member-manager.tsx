"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Clipboard, History, Link2, RotateCcw, ShieldCheck, UserMinus, UserPlus, X } from "lucide-react";

type Member = {
  id: string;
  userId: string;
  role: string;
  status: "ACTIVE" | "REMOVED";
  accessRevision: number;
  user: { name: string | null; email: string | null };
};
type Invitation = {
  id: string;
  invitedEmail: string;
  role: string;
  status: string;
  expiresAt: string;
};
type Receipt = {
  id: string;
  action: string;
  subjectLabel: string;
  actorLabel: string;
  reason: string | null;
  accessRevision: number | null;
  createdAt: string;
};
type Boundary = {
  members: Member[];
  invitations: Invitation[];
  receipts: Receipt[];
};

function label(member: Member) {
  return member.user.name || member.user.email || "Quipsly member";
}

export function CoachingEngagementMemberManager({ engagementId }: { engagementId: string }) {
  const [boundary, setBoundary] = useState<Boundary | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("CLIENT");
  const [reason, setReason] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/coaching/engagements/${encodeURIComponent(engagementId)}/members`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Membership could not be loaded.");
    setBoundary(payload.boundary);
  }, [engagementId]);

  useEffect(() => {
    refresh().catch((failure) => setError(failure instanceof Error ? failure.message : "Membership could not be loaded."));
  }, [refresh]);

  async function mutate(payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/coaching/engagements/${encodeURIComponent(engagementId)}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, requestId: crypto.randomUUID() }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Membership could not be updated.");
      await refresh();
      return body.result;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Membership could not be updated.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function invite() {
    const result = await mutate({ action: "INVITE", email, name, role, reason });
    if (!result?.invitationUrl) return;
    setInviteUrl(result.invitationPath
      ? `${window.location.origin}${result.invitationPath}`
      : result.invitationUrl);
    setEmail("");
    setName("");
    setReason("");
    setCopied(false);
  }

  async function change(member: Member) {
    const action = member.status === "ACTIVE" ? "REMOVE" : "RESTORE";
    await mutate({ action, memberId: member.id, expectedRevision: member.accessRevision, reason });
    setReason("");
  }

  async function copyInvite() {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
  }

  return <section className="rounded-[1.75rem] border border-violet-200 bg-[#fffdf8] p-6 shadow-sm" aria-labelledby="engagement-access-heading">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-800">Reviewed access</p><h2 id="engagement-access-heading" className="mt-2 flex items-center gap-2 font-serif text-3xl font-black text-[#3d3122]"><ShieldCheck size={22} /> People & access</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#765f40]">Invite links grant only this coaching relationship after the named person signs in and accepts. They do not grant access to the surrounding Nest.</p></div>
      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-emerald-900">Every change receipted</span>
    </div>

    {error ? <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">{error}</p> : null}
    <div className="mt-5 grid gap-3 md:grid-cols-2">
      <label className="text-xs font-black uppercase tracking-wide text-[#765f40]">Account email<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" placeholder="client@example.com" className="mt-2 w-full rounded-xl border border-[#dfcfb4] bg-white px-4 py-3 text-sm font-semibold normal-case tracking-normal text-[#3d3122]" /></label>
      <label className="text-xs font-black uppercase tracking-wide text-[#765f40]">Name (optional)<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" className="mt-2 w-full rounded-xl border border-[#dfcfb4] bg-white px-4 py-3 text-sm font-semibold normal-case tracking-normal text-[#3d3122]" /></label>
      <label className="text-xs font-black uppercase tracking-wide text-[#765f40]">Engagement role<select value={role} onChange={(event) => setRole(event.target.value)} className="mt-2 w-full rounded-xl border border-[#dfcfb4] bg-white px-4 py-3 text-sm font-semibold normal-case tracking-normal text-[#3d3122]"><option value="CLIENT">Client</option><option value="COACH">Coach</option><option value="SUPPORT">Support</option><option value="OBSERVER">Observer (read only)</option></select></label>
      <label className="text-xs font-black uppercase tracking-wide text-[#765f40]">Decision note (optional)<input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why access is changing" className="mt-2 w-full rounded-xl border border-[#dfcfb4] bg-white px-4 py-3 text-sm font-semibold normal-case tracking-normal text-[#3d3122]" /></label>
    </div>
    <button type="button" disabled={busy || !email.trim()} onClick={invite} className="mt-4 inline-flex items-center gap-2 rounded-full bg-violet-800 px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"><UserPlus size={17} /> Create private invite link</button>
    <p className="mt-2 text-xs font-semibold text-[#8a7354]">Quipsly creates the link but does not email it. Share it through a channel you trust.</p>

    {inviteUrl ? <div className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-4"><div className="flex items-center gap-2 font-black text-amber-950"><Link2 size={18} /> Invitation ready—copy it now</div><p className="mt-1 text-xs leading-5 text-amber-900">The secret stays after the # in the link so it is not sent to the server until the recipient intentionally opens the acceptance screen.</p><div className="mt-3 flex gap-2"><input readOnly value={inviteUrl} aria-label="Private invitation URL" className="min-w-0 flex-1 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs" /><button type="button" onClick={copyInvite} className="inline-flex items-center gap-2 rounded-xl bg-amber-900 px-4 py-2 text-xs font-black text-white">{copied ? <Check size={15} /> : <Clipboard size={15} />}{copied ? "Copied" : "Copy"}</button><button type="button" aria-label="Dismiss invitation link" onClick={() => setInviteUrl("")} className="rounded-xl border border-amber-300 p-2 text-amber-900"><X size={17} /></button></div></div> : null}

    <div className="mt-7 grid gap-3 sm:grid-cols-2">
      {boundary?.members.map((member) => <article key={member.id} className={`rounded-2xl border p-4 ${member.status === "ACTIVE" ? "border-[#eadfc9] bg-white" : "border-slate-200 bg-slate-50"}`}><div className="flex items-start justify-between gap-3"><div><p className="font-black text-[#3d3122]">{label(member)}</p><p className="mt-1 text-[10px] font-black uppercase tracking-wide text-[#8a7354]">{member.role.toLowerCase()} · {member.status.toLowerCase()} · revision {member.accessRevision}</p></div><button disabled={busy} onClick={() => change(member)} type="button" className={`inline-flex items-center gap-1 rounded-full px-3 py-2 text-[10px] font-black uppercase ${member.status === "ACTIVE" ? "border border-red-200 text-red-800" : "border border-emerald-300 text-emerald-900"}`}>{member.status === "ACTIVE" ? <UserMinus size={14} /> : <RotateCcw size={14} />}{member.status === "ACTIVE" ? "Remove" : "Restore"}</button></div></article>)}
    </div>

    {boundary?.invitations.length ? <div className="mt-7"><h3 className="font-serif text-xl font-black text-[#3d3122]">Invitations</h3><div className="mt-3 space-y-2">{boundary.invitations.map((invitation) => <div key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#eadfc9] bg-white p-3 text-sm"><div><span className="font-black text-[#3d3122]">{invitation.invitedEmail}</span><span className="ml-2 text-xs font-bold uppercase text-[#8a7354]">{invitation.role.toLowerCase()} · {invitation.status.toLowerCase()}</span></div>{invitation.status === "PENDING" ? <button disabled={busy} onClick={() => mutate({ action: "REVOKE_INVITE", invitationId: invitation.id, reason })} className="text-xs font-black text-red-800">Revoke link</button> : null}</div>)}</div></div> : null}

    {boundary?.receipts.length ? <details className="mt-7 rounded-2xl border border-[#eadfc9] bg-white p-4"><summary className="flex cursor-pointer list-none items-center gap-2 font-black text-[#3d3122]"><History size={17} /> Access history ({boundary.receipts.length})</summary><ol className="mt-4 space-y-3">{boundary.receipts.map((receipt) => <li key={receipt.id} className="border-l-2 border-violet-200 pl-3 text-xs leading-5 text-[#765f40]"><span className="font-black text-[#3d3122]">{receipt.action.toLowerCase().replace("_", " ")}</span> · {receipt.subjectLabel} · by {receipt.actorLabel}<br />{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(receipt.createdAt))}{receipt.reason ? ` · ${receipt.reason}` : ""}</li>)}</ol></details> : null}
  </section>;
}
