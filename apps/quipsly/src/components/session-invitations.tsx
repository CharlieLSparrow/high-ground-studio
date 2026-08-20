"use client";

import {
  AlertTriangle,
  CalendarClock,
  Check,
  Copy,
  History,
  KeyRound,
  Laptop,
  Link2,
  LoaderCircle,
  Mic,
  MicOff,
  Radio,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  Smartphone,
  UserPlus,
  UserRoundX,
  Users,
  Video,
  VideoOff,
} from "lucide-react";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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
  delivery?: InvitationDelivery | null;
};

type InvitationDelivery = {
  id: string;
  channel: string;
  status: "PENDING" | "SENT" | "FAILED";
  requestedAt: string;
  completedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};

type InvitationPacket = {
  ok?: boolean;
  code?: string;
  error?: string;
  invitations?: Invitation[];
  invitation?: Invitation;
  invitePath?: string;
  delivery?: InvitationDelivery | null;
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

type PresenceDevice = {
  id: string;
  participantId: string | null;
  participantLabel: string;
  role: string | null;
  canonicalAccessStatus: string | null;
  clientKind: string;
  deviceLabel: string;
  joinedAt: string | null;
  audio: { published: boolean; muted: boolean | null };
  video: { published: boolean; muted: boolean | null };
  matchedToCanonicalParticipant: boolean;
};

type ProviderPresence = {
  status: "LIVE" | "EMPTY" | "NOT_REQUIRED" | "UNAVAILABLE" | "FAILED";
  errorCode: string | null;
  observedAt: string;
  provider: string | null;
  connectedDeviceCount: number | null;
  connectedParticipantCount: number | null;
  unknownDeviceCount: number | null;
  attentionCount: number | null;
  devices: PresenceDevice[];
  nextAction: string;
};

type PresencePacket = {
  ok?: boolean;
  code?: string;
  error?: string;
  presence?: ProviderPresence;
};

function activityTone(tone: CollaborationActivity["tone"]) {
  if (tone === "positive")
    return "border-emerald-200 bg-emerald-50 text-emerald-950";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-950";
  return "border-sky-200 bg-sky-50 text-sky-950";
}

function presenceTone(status: ProviderPresence["status"] | undefined) {
  if (status === "LIVE")
    return "border-emerald-200 bg-emerald-50 text-emerald-950";
  if (status === "EMPTY" || status === "NOT_REQUIRED")
    return "border-sky-200 bg-sky-50 text-sky-950";
  return "border-amber-200 bg-amber-50 text-amber-950";
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
  const [managerOpen, setManagerOpen] = useState(false);
  const [presence, setPresence] = useState<ProviderPresence | null>(null);
  const [presenceState, setPresenceState] = useState<
    "idle" | "refreshing" | "ready" | "error"
  >("idle");
  const presenceRequestRef = useRef<AbortController | null>(null);

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

  const loadPresence = useCallback(async () => {
    presenceRequestRef.current?.abort();
    const controller = new AbortController();
    presenceRequestRef.current = controller;
    setPresenceState("refreshing");
    try {
      const response = await fetch(
        `/api/sessions/${encodeURIComponent(roomId)}/presence`,
        { cache: "no-store", signal: controller.signal },
      );
      const packet = (await response
        .json()
        .catch(() => ({}))) as PresencePacket;
      if (!response.ok || !packet.ok || !packet.presence) {
        setPresence(null);
        setPresenceState("error");
        return;
      }
      setPresence(packet.presence);
      setPresenceState("ready");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setPresence(null);
      setPresenceState("error");
    } finally {
      if (presenceRequestRef.current === controller)
        presenceRequestRef.current = null;
    }
  }, [roomId]);

  useEffect(() => {
    setSupportsShare(typeof navigator.share === "function");
    void load();
  }, [load]);

  useEffect(() => {
    if (authorized !== true || !managerOpen) return;
    void loadPresence();
    const timer = window.setInterval(() => void loadPresence(), 10_000);
    return () => {
      window.clearInterval(timer);
      presenceRequestRef.current?.abort();
      presenceRequestRef.current = null;
    };
  }, [authorized, loadPresence, managerOpen]);

  async function createInvitation(
    delivery: "EMAIL" | "LINK",
    target?: Pick<Invitation, "email" | "displayName" | "role">,
  ) {
    const recipientEmail = target?.email || email;
    if (!recipientEmail.trim() || status === "creating") return;
    setStatus("creating");
    setMessage("");
    setCopied(false);
    const response = await fetch(
      `/api/sessions/${encodeURIComponent(roomId)}/invitations`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: recipientEmail,
          displayName: target?.displayName ?? displayName,
          role: target?.role || role,
          expiresInHours: Number(expiresInHours),
          delivery,
          requestId: delivery === "EMAIL" ? crypto.randomUUID() : undefined,
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
      (delivery === "LINK" && !packet.invitePath)
    ) {
      setMessage(packet.error || "The invitation link could not be created.");
      setStatus("idle");
      return;
    }
    setInvitations((current) => [
      packet.invitation as Invitation,
      ...current.filter((item) => item.id !== packet.invitation?.id),
    ]);
    if (packet.invitePath) {
      setInviteUrl(
        new URL(packet.invitePath, window.location.origin).toString(),
      );
    }
    setInviteUrlInvitationId(packet.invitation.id);
    await load();
    if (delivery === "EMAIL" && packet.delivery?.status === "SENT") {
      setMessage(
        `Invitation email sent to ${recipientEmail}. Quipsly recorded the delivery request; acceptance remains separate.`,
      );
    } else if (delivery === "EMAIL") {
      setMessage(
        packet.delivery?.errorMessage ||
          "Invitation email was not sent. Copy or share the private link instead.",
      );
    } else {
      setMessage(
        "Session link created. Quipsly has not emailed or messaged anyone; copy or share it when you are ready.",
      );
    }
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
    await Promise.all([load(), loadPresence()]);
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
      onToggle={(event) => setManagerOpen(event.currentTarget.open)}
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
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void createInvitation("EMAIL");
            }}
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
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={status === "creating" || !email.trim()}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-violet-800 px-5 text-xs font-black uppercase tracking-wide text-white disabled:opacity-50"
              >
                {status === "creating" ? (
                  <LoaderCircle size={15} className="animate-spin" />
                ) : (
                  <Send size={15} />
                )}
                Send email invitation
              </button>
              <button
                type="button"
                onClick={() => void createInvitation("LINK")}
                disabled={status === "creating" || !email.trim()}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-violet-300 bg-white px-5 text-xs font-black uppercase tracking-wide text-violet-900 disabled:opacity-50"
              >
                <Link2 size={15} />
                Create private link
              </button>
            </div>
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
                  {invitation.delivery ? (
                    <p
                      className={`mt-2 rounded-lg border px-2 py-1.5 text-[10px] font-bold leading-4 ${
                        invitation.delivery.status === "SENT"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                          : invitation.delivery.status === "FAILED"
                            ? "border-amber-200 bg-amber-50 text-amber-950"
                            : "border-sky-200 bg-sky-50 text-sky-950"
                      }`}
                    >
                      Email {invitation.delivery.status.toLowerCase()}
                      {invitation.delivery.errorMessage
                        ? ` · ${invitation.delivery.errorMessage}`
                        : ` · ${new Date(invitation.delivery.requestedAt).toLocaleString()}`}
                    </p>
                  ) : null}
                  {invitation.canRevokeLink &&
                  invitation.delivery?.status !== "PENDING" ? (
                    <button
                      type="button"
                      onClick={() => void createInvitation("EMAIL", invitation)}
                      disabled={status === "creating"}
                      className="mt-2 inline-flex min-h-9 items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 text-[10px] font-black text-violet-900 disabled:opacity-50"
                    >
                      <Send size={13} />
                      {invitation.delivery?.status === "SENT"
                        ? "Send fresh invitation"
                        : "Send invitation email"}
                    </button>
                  ) : null}
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
              onClick={() => void Promise.all([load(), loadPresence()])}
              disabled={status === "loading" || presenceState === "refreshing"}
              className="inline-flex min-h-9 items-center gap-2 rounded-full border border-[#d8c7a7] bg-white px-3 text-[10px] font-black text-[#5b472f] disabled:opacity-50"
            >
              <RefreshCw
                size={13}
                className={
                  status === "loading" || presenceState === "refreshing"
                    ? "animate-spin"
                    : ""
                }
              />
              Refresh access and presence
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

            <aside className="space-y-3">
              <section
                className={`rounded-xl border p-3 ${presenceTone(presence?.status)}`}
                aria-live="polite"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="flex items-center gap-2 text-xs font-black">
                      <Radio size={15} />
                      Live provider readback
                    </p>
                    <p className="mt-1 text-[10px] font-semibold leading-4 opacity-90">
                      {presenceState === "refreshing" && !presence
                        ? "Asking the media provider which devices are connected…"
                        : presence?.nextAction ||
                          "Open this manager to request current provider presence. Quipsly never infers it from access or join keys."}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadPresence()}
                    disabled={presenceState === "refreshing"}
                    className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full border border-current/20 bg-white/70 px-3 text-[9px] font-black disabled:opacity-50"
                  >
                    <RefreshCw
                      size={12}
                      className={
                        presenceState === "refreshing" ? "animate-spin" : ""
                      }
                    />
                    Read now
                  </button>
                </div>
                {presence ? (
                  <>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="rounded-lg bg-white/70 p-2">
                        <p className="text-[9px] font-black uppercase tracking-wide opacity-70">
                          Connected devices
                        </p>
                        <p className="mt-1 text-lg font-black">
                          {presence.connectedDeviceCount ?? "Unknown"}
                        </p>
                      </div>
                      <div className="rounded-lg bg-white/70 p-2">
                        <p className="text-[9px] font-black uppercase tracking-wide opacity-70">
                          Canonical people
                        </p>
                        <p className="mt-1 text-lg font-black">
                          {presence.connectedParticipantCount ?? "Unknown"}
                        </p>
                      </div>
                    </div>
                    {presence.attentionCount ? (
                      <p className="mt-2 flex gap-2 rounded-lg border border-amber-300 bg-amber-100 p-2 text-[10px] font-black leading-4 text-amber-950">
                        <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                        {presence.attentionCount} provider device
                        {presence.attentionCount === 1
                          ? " needs"
                          : "s need"}{" "}
                        attention because it is unmatched or its canonical
                        access is removed.
                      </p>
                    ) : null}
                    {presence.devices.length ? (
                      <ul className="mt-3 space-y-2">
                        {presence.devices.map((device) => (
                          <li
                            key={device.id}
                            className="rounded-lg border border-current/10 bg-white/75 p-2"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="flex items-center gap-2 text-[11px] font-black">
                                  {device.clientKind.toLowerCase() === "ios" ? (
                                    <Smartphone size={13} />
                                  ) : (
                                    <Laptop size={13} />
                                  )}
                                  {device.participantLabel}
                                </p>
                                <p className="mt-0.5 text-[10px] font-semibold opacity-80">
                                  {device.deviceLabel}
                                  {device.role
                                    ? ` · ${device.role.toLowerCase()}`
                                    : ""}
                                </p>
                              </div>
                              {device.canonicalAccessStatus ? (
                                <span className="rounded-full border border-current/20 px-2 py-1 text-[8px] font-black uppercase tracking-wide">
                                  {device.canonicalAccessStatus}
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2 text-[9px] font-black">
                              <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1">
                                {device.audio.published &&
                                device.audio.muted !== true ? (
                                  <Mic size={11} />
                                ) : (
                                  <MicOff size={11} />
                                )}
                                Audio{" "}
                                {!device.audio.published
                                  ? "not published"
                                  : device.audio.muted
                                    ? "muted"
                                    : "published"}
                              </span>
                              <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1">
                                {device.video.published &&
                                device.video.muted !== true ? (
                                  <Video size={11} />
                                ) : (
                                  <VideoOff size={11} />
                                )}
                                Video{" "}
                                {!device.video.published
                                  ? "not published"
                                  : device.video.muted
                                    ? "muted"
                                    : "published"}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <p className="mt-3 flex items-start gap-2 text-[9px] font-bold leading-4 opacity-80">
                      <Users size={12} className="mt-0.5 shrink-0" />
                      Observed {new Date(presence.observedAt).toLocaleString()}.
                      Refreshes every 10 seconds only while this manager is
                      open. This is current provider metadata, not retained
                      recording or speaking proof.
                    </p>
                  </>
                ) : presenceState === "error" ? (
                  <p className="mt-3 rounded-lg border border-amber-300 bg-amber-100 p-2 text-[10px] font-black leading-4 text-amber-950">
                    Presence is unknown because the protected readback request
                    failed. Access history and join keys are not being reused as
                    a guess.
                  </p>
                ) : null}
              </section>

              <section className="rounded-xl border border-violet-200 bg-white p-3">
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
              </section>
            </aside>
          </div>
        </section>
      </div>
    </details>
  );
}
