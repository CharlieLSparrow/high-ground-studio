"use client";

import {
  CalendarClock,
  Check,
  Copy,
  History,
  KeyRound,
  Laptop,
  Link2,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  Smartphone,
  UserPlus,
  UserRoundX,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { normalizeSessionPurpose } from "@/lib/session-experience";

type Invitation = {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  status: string;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
  canRevokeLink: boolean;
  canRemoveParticipant?: boolean;
  canRestoreParticipant?: boolean;
  canReconcileProvider?: boolean;
  participant?: {
    id: string;
    accessStatus: string;
    accessRevision: number;
    providerAccessStatus: string;
    providerAccessErrorCode: string | null;
  } | null;
};

type InvitationPacket = {
  ok?: boolean;
  code?: string;
  error?: string;
  invitations?: Invitation[];
  invitation?: Invitation;
  invitePath?: string;
  participant?: NonNullable<Invitation["participant"]>;
  provider?: { status?: string; nextAction?: string };
  collaboration?: {
    activity?: CollaborationActivity[];
    joinKeyLeases?: JoinKeyLease[];
    boundaries?: {
      appendOnlyAccessHistory?: boolean;
      joinKeyLeaseIsPresenceProof?: boolean;
      providerIdentitiesExposed?: boolean;
      credentialsExposed?: boolean;
    };
  };
};

type CollaborationActivity = {
  id: string;
  kind: string;
  tone: "neutral" | "positive" | "warning";
  title: string;
  detail: string;
  participantLabel: string;
  actorLabel: string | null;
  occurredAt: string;
  providerStatus: string | null;
};

type JoinKeyLease = {
  id: string;
  participantId: string;
  participantLabel: string;
  clientKind: string;
  deviceLabel: string;
  issuedAt: string;
  expiresAt: string;
};

function activityTone(tone: CollaborationActivity["tone"]) {
  if (tone === "positive")
    return "border-emerald-200 bg-emerald-50 text-emerald-950";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-950";
  return "border-sky-200 bg-sky-50 text-sky-950";
}

function rolesForPurpose(purpose: string) {
  const normalized = normalizeSessionPurpose(purpose);
  if (normalized === "COACHING")
    return [
      { value: "CLIENT", label: "Coaching client" },
      { value: "OBSERVER", label: "Observer" },
    ];
  if (normalized === "PODCAST")
    return [
      { value: "GUEST", label: "Guest / co-host" },
      { value: "PRODUCER", label: "Producer" },
      { value: "OBSERVER", label: "Observer" },
    ];
  return [
    {
      value: "GUEST",
      label:
        normalized === "RESEARCH_INTERVIEW"
          ? "Interview participant"
          : "Participant",
    },
    { value: "PRODUCER", label: "Facilitator / producer" },
    { value: "OBSERVER", label: "Observer" },
  ];
}

function invitationStatus(invitation: Invitation) {
  if (invitation.status === "PENDING")
    return `Link expires ${new Date(invitation.expiresAt).toLocaleString()}`;
  if (
    invitation.status === "ACCEPTED" &&
    invitation.participant?.accessStatus === "REMOVED"
  ) {
    return invitation.participant.providerAccessStatus === "CONVERGED" ||
      invitation.participant.providerAccessStatus === "NOT_REQUIRED"
      ? "Session access removed · provider reconciled"
      : `Session access removed · provider ${invitation.participant.providerAccessStatus.toLowerCase()}`;
  }
  if (invitation.status === "ACCEPTED")
    return `Accepted ${invitation.acceptedAt ? new Date(invitation.acceptedAt).toLocaleString() : ""}`.trim();
  if (invitation.status === "EXPIRED") return "Link expired";
  return "Link revoked";
}

export function SessionInvitations({
  roomId,
  purpose,
}: {
  roomId: string;
  purpose: string;
}) {
  const roles = useMemo(() => rolesForPurpose(purpose), [purpose]);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [activity, setActivity] = useState<CollaborationActivity[]>([]);
  const [joinKeyLeases, setJoinKeyLeases] = useState<JoinKeyLease[]>([]);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState(roles[0]?.value || "GUEST");
  const [expiresInHours, setExpiresInHours] = useState("168");
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteUrlInvitationId, setInviteUrlInvitationId] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "creating" | "revoking" | "access"
  >("loading");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [supportsShare, setSupportsShare] = useState(false);
  const [confirmingRemovalId, setConfirmingRemovalId] = useState("");

  useEffect(() => {
    setRole(roles[0]?.value || "GUEST");
  }, [roles]);

  const load = useCallback(async () => {
    setStatus("loading");
    const response = await fetch(
      `/api/sessions/${encodeURIComponent(roomId)}/invitations`,
      { cache: "no-store" },
    );
    const packet = (await response
      .json()
      .catch(() => ({}))) as InvitationPacket;
    if (response.status === 404 || response.status === 403) {
      setAuthorized(false);
      setStatus("idle");
      return;
    }
    if (!response.ok || !packet.ok) {
      setAuthorized(true);
      setMessage(packet.error || "Session invitations could not load.");
      setStatus("idle");
      return;
    }
    setAuthorized(true);
    setInvitations(packet.invitations || []);
    setActivity(packet.collaboration?.activity || []);
    setJoinKeyLeases(packet.collaboration?.joinKeyLeases || []);
    setStatus("idle");
  }, [roomId]);

  useEffect(() => {
    setSupportsShare(typeof navigator.share === "function");
    void load();
  }, [load]);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!email.trim() || status === "creating") return;
    setStatus("creating");
    setMessage("");
    setCopied(false);
    const response = await fetch(
      `/api/sessions/${encodeURIComponent(roomId)}/invitations`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          displayName,
          role,
          expiresInHours: Number(expiresInHours),
        }),
      },
    );
    const packet = (await response
      .json()
      .catch(() => ({}))) as InvitationPacket;
    if (
      !response.ok ||
      !packet.ok ||
      !packet.invitation ||
      !packet.invitePath
    ) {
      setMessage(packet.error || "The invitation link could not be created.");
      setStatus("idle");
      return;
    }
    setInvitations((current) => [
      packet.invitation as Invitation,
      ...current.filter((item) => item.id !== packet.invitation?.id),
    ]);
    setInviteUrl(new URL(packet.invitePath, window.location.origin).toString());
    setInviteUrlInvitationId(packet.invitation.id);
    await load();
    setMessage(
      "Session link created. Quipsly has not emailed or messaged anyone; copy or share it when you are ready.",
    );
  }

  async function copy() {
    if (!inviteUrl || !navigator.clipboard?.writeText) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
  }

  async function share() {
    if (!inviteUrl || !navigator.share) return;
    await navigator.share({
      title: "Join my Quipsly Session",
      text: "Use this private link to join the Quipsly Session.",
      url: inviteUrl,
    });
  }

  async function revoke(invitationId: string) {
    setStatus("revoking");
    setMessage("");
    const response = await fetch(
      `/api/sessions/${encodeURIComponent(roomId)}/invitations`,
      {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invitationId }),
      },
    );
    const packet = (await response
      .json()
      .catch(() => ({}))) as InvitationPacket;
    if (!response.ok || !packet.ok) {
      setMessage(packet.error || "The pending link could not be revoked.");
      setStatus("idle");
      return;
    }
    setInvitations((current) =>
      current.map((item) =>
        item.id === invitationId
          ? { ...item, status: "REVOKED", canRevokeLink: false }
          : item,
      ),
    );
    if (inviteUrlInvitationId === invitationId) {
      setInviteUrl("");
      setInviteUrlInvitationId("");
    }
    await load();
    setMessage("The pending link was revoked. It can no longer be accepted.");
  }

  async function changeParticipantAccess(
    invitation: Invitation,
    action: "REMOVE" | "RESTORE" | "RECONCILE",
  ) {
    const participant = invitation.participant;
    if (!participant || status === "access") return;
    setStatus("access");
    setMessage("");
    const response = await fetch(
      `/api/sessions/${encodeURIComponent(roomId)}/participants/${encodeURIComponent(participant.id)}/access`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          requestId: crypto.randomUUID(),
          expectedRevision: participant.accessRevision,
          reason:
            action === "REMOVE"
              ? "Removed from the Session participant manager"
              : action === "RESTORE"
                ? "Restored from the Session participant manager"
                : "Provider reconciliation retried from the Session participant manager",
        }),
      },
    );
    const packet = (await response
      .json()
      .catch(() => ({}))) as InvitationPacket;
    if (!response.ok || !packet.ok || !packet.participant) {
      setMessage(
        packet.error || "Participant access could not be changed safely.",
      );
      setStatus("idle");
      return;
    }
    setInvitations((current) =>
      current.map((item) =>
        item.id !== invitation.id
          ? item
          : {
              ...item,
              participant: packet.participant,
              canRemoveParticipant:
                packet.participant?.accessStatus === "ACTIVE",
              canRestoreParticipant:
                packet.participant?.accessStatus === "REMOVED" &&
                ["CONVERGED", "NOT_REQUIRED"].includes(
                  packet.participant?.providerAccessStatus || "",
                ),
              canReconcileProvider:
                packet.participant?.accessStatus === "REMOVED" &&
                ["BLOCKED", "FAILED"].includes(
                  packet.participant?.providerAccessStatus || "",
                ),
            },
      ),
    );
    setConfirmingRemovalId("");
    await load();
    if (action === "REMOVE") {
      setMessage(
        packet.provider?.nextAction ||
          "Session access was removed. Recordings, transcript, consent history, and authored work were preserved.",
      );
    } else if (action === "RESTORE") {
      setMessage(
        "Session access was restored. The participant still chooses when to join media; no recording or message was started.",
      );
    } else {
      setMessage(
        packet.provider?.nextAction ||
          "Provider reconciliation finished and canonical Session access remains removed.",
      );
    }
  }

  if (authorized === false) return null;

  return (
    <details
      className="group rounded-[1.75rem] border border-[#d8c7a7] bg-[#fffdf8] p-4 shadow-sm"
      open={inviteUrl ? true : undefined}
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-2 text-sm font-black text-[#3d3122]">
        <span className="flex items-center gap-2">
          <UserPlus size={18} className="text-violet-700" aria-hidden="true" />
          Invite someone to this Session
        </span>
        <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[10px] uppercase tracking-wide text-violet-900">
          Session only
        </span>
      </summary>
      <div className="mt-3 border-t border-[#eadfc9] px-2 pt-5">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.72fr)]">
          <form
            onSubmit={create}
            className="rounded-2xl border border-violet-200 bg-violet-50/60 p-4"
          >
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-800">
              Expiring, email-bound invitation
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-black text-[#5b472f]">
                Email
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="guest@example.com"
                  className="mt-1 min-h-11 w-full rounded-xl border border-[#d8c7a7] bg-white px-3 text-sm font-semibold outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
                />
              </label>
              <label className="text-xs font-black text-[#5b472f]">
                Name, optional
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="How they should appear"
                  className="mt-1 min-h-11 w-full rounded-xl border border-[#d8c7a7] bg-white px-3 text-sm font-semibold outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
                />
              </label>
              <label className="text-xs font-black text-[#5b472f]">
                Role
                <select
                  value={role}
                  onChange={(event) => setRole(event.target.value)}
                  className="mt-1 min-h-11 w-full rounded-xl border border-[#d8c7a7] bg-white px-3 text-sm font-semibold"
                >
                  {roles.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-black text-[#5b472f]">
                Link lifetime
                <select
                  value={expiresInHours}
                  onChange={(event) => setExpiresInHours(event.target.value)}
                  className="mt-1 min-h-11 w-full rounded-xl border border-[#d8c7a7] bg-white px-3 text-sm font-semibold"
                >
                  <option value="24">24 hours</option>
                  <option value="168">7 days</option>
                  <option value="720">30 days</option>
                </select>
              </label>
            </div>
            <button
              type="submit"
              disabled={status === "creating" || !email.trim()}
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-violet-800 px-5 text-xs font-black uppercase tracking-wide text-white disabled:opacity-50"
            >
              {status === "creating" ? (
                <LoaderCircle size={15} className="animate-spin" />
              ) : (
                <Link2 size={15} />
              )}
              Create private link
            </button>
            <p className="mt-3 text-[11px] font-bold leading-5 text-violet-950">
              The recipient must sign in with this exact verified email. The
              link grants this Session—not the Nest—and never starts recording.
            </p>
          </form>

          <section
            className="rounded-2xl border border-[#e5d5b7] bg-white p-4"
            aria-live="polite"
          >
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#987443]">
              Delivery and status
            </p>
            {inviteUrl ? (
              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="break-all text-xs font-bold leading-5 text-emerald-950">
                  {inviteUrl}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void copy()}
                    className="inline-flex min-h-10 items-center gap-2 rounded-full bg-emerald-800 px-4 text-xs font-black text-white"
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? "Copied" : "Copy link"}
                  </button>
                  {supportsShare ? (
                    <button
                      type="button"
                      onClick={() => void share()}
                      className="inline-flex min-h-10 items-center gap-2 rounded-full border border-emerald-300 bg-white px-4 text-xs font-black text-emerald-950"
                    >
                      <Send size={14} />
                      Share…
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
            {message ? (
              <p
                role="status"
                className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs font-bold leading-5 text-sky-950"
              >
                {message}
              </p>
            ) : null}
            {status === "loading" ? (
              <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-[#765f40]">
                <LoaderCircle size={15} className="animate-spin" />
                Reading invitation ledger…
              </p>
            ) : null}
            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
              {invitations.map((invitation) => (
                <article
                  key={invitation.id}
                  className="rounded-xl border border-[#eadfc9] bg-[#fffdf8] p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-[#3d3122]">
                        {invitation.displayName || invitation.email}
                      </p>
                      <p className="truncate text-xs font-semibold text-[#765f40]">
                        {invitation.email} · {invitation.role.toLowerCase()}
                      </p>
                    </div>
                    <span className="rounded-full border border-[#d8c7a7] bg-white px-2 py-1 text-[9px] font-black uppercase tracking-wide text-[#5b472f]">
                      {invitation.status}
                    </span>
                  </div>
                  <p className="mt-2 flex items-center gap-1 text-[10px] font-bold text-[#8a7354]">
                    <CalendarClock size={12} />
                    {invitationStatus(invitation)}
                  </p>
                  {invitation.canRevokeLink ? (
                    <button
                      type="button"
                      onClick={() => void revoke(invitation.id)}
                      disabled={status === "revoking"}
                      className="mt-2 inline-flex min-h-9 items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 text-[10px] font-black text-rose-900 disabled:opacity-50"
                    >
                      <UserRoundX size={13} />
                      Revoke pending link
                    </button>
                  ) : null}
                  {invitation.canRemoveParticipant &&
                  confirmingRemovalId !== invitation.id ? (
                    <button
                      type="button"
                      onClick={() => setConfirmingRemovalId(invitation.id)}
                      disabled={status === "access"}
                      className="mt-2 inline-flex min-h-9 items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 text-[10px] font-black text-rose-900 disabled:opacity-50"
                    >
                      <UserRoundX size={13} />
                      Remove Session access
                    </button>
                  ) : null}
                  {invitation.canRemoveParticipant &&
                  confirmingRemovalId === invitation.id ? (
                    <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3">
                      <p className="text-[11px] font-bold leading-5 text-rose-950">
                        Remove this invitation-owned access and attempt to
                        disconnect every known LiveKit device? Quipsly preserves
                        consent history, recordings, transcript evidence, and
                        authored work. No message is sent.
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            void changeParticipantAccess(invitation, "REMOVE")
                          }
                          disabled={status === "access"}
                          className="inline-flex min-h-9 items-center gap-2 rounded-full bg-rose-800 px-3 text-[10px] font-black text-white disabled:opacity-50"
                        >
                          {status === "access" ? (
                            <LoaderCircle size={13} className="animate-spin" />
                          ) : (
                            <UserRoundX size={13} />
                          )}
                          Confirm removal
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingRemovalId("")}
                          disabled={status === "access"}
                          className="min-h-9 rounded-full border border-rose-300 bg-white px-3 text-[10px] font-black text-rose-950"
                        >
                          Keep access
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {invitation.canRestoreParticipant ? (
                    <button
                      type="button"
                      onClick={() =>
                        void changeParticipantAccess(invitation, "RESTORE")
                      }
                      disabled={status === "access"}
                      className="mt-2 inline-flex min-h-9 items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 text-[10px] font-black text-emerald-950 disabled:opacity-50"
                    >
                      <RotateCcw size={13} />
                      Restore Session access
                    </button>
                  ) : null}
                  {invitation.canReconcileProvider ? (
                    <button
                      type="button"
                      onClick={() =>
                        void changeParticipantAccess(invitation, "RECONCILE")
                      }
                      disabled={status === "access"}
                      className="ml-2 mt-2 inline-flex min-h-9 items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 text-[10px] font-black text-amber-950 disabled:opacity-50"
                    >
                      <RefreshCw size={13} />
                      Retry provider reconciliation
                    </button>
                  ) : null}
                </article>
              ))}
            </div>
            <p className="mt-3 flex gap-2 text-[10px] font-bold leading-4 text-[#8a7354]">
              <ShieldCheck size={13} className="mt-0.5 shrink-0" />
              Accepted participant access is managed separately from revoking an
              unused link, so Quipsly never pretends a connected person was
              removed.
            </p>
          </section>
        </div>
        <section
          className="mt-5 rounded-2xl border border-[#d8c7a7] bg-[#f8f3e8] p-4"
          aria-labelledby="session-access-activity-title"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p
                id="session-access-activity-title"
                className="flex items-center gap-2 text-sm font-black text-[#3d3122]"
              >
                <History size={17} className="text-violet-700" />
                Access activity
              </p>
              <p className="mt-1 max-w-3xl text-[11px] font-semibold leading-5 text-[#765f40]">
                A readable history of invitations and participant access. This
                is separate from the episode or coaching transcript, chat, and
                media timeline so administrative changes cannot rewrite the
                creative record.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              disabled={status === "loading"}
              className="inline-flex min-h-9 items-center gap-2 rounded-full border border-[#d8c7a7] bg-white px-3 text-[10px] font-black text-[#5b472f] disabled:opacity-50"
            >
              <RefreshCw
                size={13}
                className={status === "loading" ? "animate-spin" : ""}
              />
              Refresh history
            </button>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.56fr)]">
            <div>
              {activity.length ? (
                <ol className="space-y-2">
                  {activity.map((item) => (
                    <li
                      key={item.id}
                      className={`rounded-xl border p-3 ${activityTone(item.tone)}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-black">{item.title}</p>
                          <p className="mt-0.5 text-[10px] font-bold opacity-80">
                            {item.participantLabel}
                            {item.actorLabel ? ` · by ${item.actorLabel}` : ""}
                            {` · ${new Date(item.occurredAt).toLocaleString()}`}
                          </p>
                        </div>
                        {item.providerStatus ? (
                          <span className="rounded-full border border-current/20 bg-white/70 px-2 py-1 text-[9px] font-black uppercase tracking-wide">
                            Provider {item.providerStatus.toLowerCase()}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-[11px] font-semibold leading-5">
                        {item.detail}
                      </p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="rounded-xl border border-dashed border-[#d8c7a7] bg-white/70 p-4 text-xs font-semibold leading-5 text-[#765f40]">
                  Invitation and access changes will appear here. Quipsly does
                  not infer activity that it has not recorded.
                </p>
              )}
            </div>

            <aside className="rounded-xl border border-violet-200 bg-white p-3">
              <p className="flex items-center gap-2 text-xs font-black text-violet-950">
                <KeyRound size={15} />
                Unexpired join keys
              </p>
              <p className="mt-1 text-[10px] font-semibold leading-4 text-violet-900">
                A join key means Quipsly recently prepared short-lived call
                authority for a device. It is not proof that the device is
                currently connected. Credentials and provider identities are
                never displayed here.
              </p>
              {joinKeyLeases.length ? (
                <ul className="mt-3 space-y-2">
                  {joinKeyLeases.map((lease) => (
                    <li
                      key={lease.id}
                      className="rounded-lg border border-violet-100 bg-violet-50 p-2"
                    >
                      <p className="flex items-center gap-2 text-[11px] font-black text-violet-950">
                        {lease.clientKind.toLowerCase() === "ios" ? (
                          <Smartphone size={13} />
                        ) : (
                          <Laptop size={13} />
                        )}
                        {lease.deviceLabel}
                      </p>
                      <p className="mt-1 text-[10px] font-semibold text-violet-800">
                        {lease.participantLabel} · expires{" "}
                        {new Date(lease.expiresAt).toLocaleString()}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 rounded-lg border border-dashed border-violet-200 bg-violet-50/50 p-3 text-[10px] font-semibold leading-4 text-violet-900">
                  No unexpired join keys. This does not determine whether a
                  previously connected device is still visible to the media
                  provider.
                </p>
              )}
            </aside>
          </div>
        </section>
      </div>
    </details>
  );
}
