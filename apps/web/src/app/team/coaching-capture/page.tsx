import {
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  CreditCard,
  FileAudio,
  Mic,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import GlassPanel from "@/components/ui/GlassPanel";
import PageEyebrow from "@/components/ui/PageEyebrow";
import { prisma } from "@/lib/prisma";
import {
  isUnreviewedTranscriptActionItem,
  packetActionCandidatesFromSource,
} from "@/lib/server/coaching/coaching-packets";
import {
  buildCoachingPacketAction,
  createAvailabilityWindowAction,
  createBookingDraftAction,
  createCoachingCheckoutAction,
  createCoachingCustomerPortalAction,
  prepareLiveKitCallRoomAction,
  reconcileProviderRecordingAssetAction,
  runTranscriptJobAction,
  seedCoachingCaptureFoundationAction,
  updateCoachingBookingRunwayAction,
  updateProviderRecordingEgressAction,
  updateAccountDeletionRequestAction,
} from "./actions";

export const dynamic = "force-dynamic";

type Tone = "safe" | "warning" | "danger" | "neutral";

function label(value: string | null | undefined) {
  if (!value) return "Not set";
  return value
    .toLowerCase()
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function dateTime(value: Date | string | null | undefined) {
  if (!value) return "Not scheduled";
  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function dateTimeLocalValue(value: Date | string | null | undefined) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function weekdayLabel(value: number | null | undefined) {
  if (typeof value !== "number") return "Specific date";
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][value] || "Weekday";
}

function minuteLabel(value: number | null | undefined) {
  if (typeof value !== "number") return "--:--";
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function toneForStatus(status: string | null | undefined): Tone {
  const normalized = (status || "").toLowerCase();
  if (["confirmed", "completed", "paid", "verified", "granted", "open", "ended", "ready_for_deletion"].includes(normalized)) return "safe";
  if (["requested", "reviewing", "export_preparing", "planned", "queued", "holding_payment", "active", "local_ready", "uploaded"].includes(normalized)) return "warning";
  if (["failed", "canceled", "cancelled", "rejected", "declined", "revoked", "no_show", "disputed"].includes(normalized)) return "danger";
  return "neutral";
}

function toneClass(tone: Tone) {
  return {
    safe: "border-emerald-300/30 bg-emerald-300/10 text-emerald-100",
    warning: "border-amber-200/30 bg-amber-200/10 text-amber-50",
    danger: "border-rose-300/30 bg-rose-300/10 text-rose-100",
    neutral: "border-white/10 bg-white/6 text-[rgba(245,239,230,0.78)]",
  }[tone];
}

function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${toneClass(tone)}`}>{children}</span>;
}

function Stat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[rgba(245,239,230,0.58)]">
        <Icon className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
        {label}
      </div>
      <div className="text-2xl font-semibold text-[var(--text-light)]">{value}</div>
    </div>
  );
}

function nextActionForBooking(booking: any) {
  if (booking.paymentPolicy === "PAID_ONE_TO_ONE" && booking.paymentRecord?.status !== "PAID") {
    return "Create Stripe test checkout or confirm manual payment path.";
  }
  if (!booking.callRoom) return "Create planned call room before the app can join.";
  if ((booking.callRoom.recordingConsents?.length || 0) === 0) return "Collect recording consent before capture.";
  if ((booking.callRoom.recordingAssets?.length || 0) === 0) return "Ready for iOS capture test once session starts.";
  if ((booking.callRoom.transcriptJobs?.length || 0) === 0) return "Queue transcript job after verified upload.";
  return "Review transcript evidence and packet candidates before committing any follow-up work.";
}

function nextActionForRoom(room: any) {
  if ((room.recordingConsents?.length || 0) === 0) return "Consent missing. Do not record yet.";
  if ((room.recordingAssets?.length || 0) === 0) return "No recording asset yet. Start or attach mobile capture.";
  if ((room.transcriptJobs?.length || 0) === 0) return "Recording exists. Queue transcript job.";
  return "Transcript chain exists. Review packet candidates before creating tasks.";
}

type RunwaySearchParams =
  Promise<Record<string, string | string[] | undefined>>;

function firstParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

async function loadRunway() {
  const db = prisma as any;
  const [coachProfiles, offerings, availabilityWindows, bookings, rooms, transcriptJobs, recordingAssets, packetNotes, actionItems, deletionRequests, clients, stripeCustomerLinks] = await Promise.all([
    db.coachProfile.findMany({
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
      take: 12,
      include: {
        user: {
          select: { name: true, primaryEmail: true },
        },
      },
    }),
    db.serviceOffering.findMany({
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
      take: 12,
      include: {
        coachProfile: {
          include: {
            user: {
              select: { name: true, primaryEmail: true },
            },
          },
        },
      },
    }),
    db.availabilityWindow.findMany({
      orderBy: [{ isActive: "desc" }, { dayOfWeek: "asc" }, { startMinute: "asc" }],
      take: 24,
      include: {
        coachProfile: {
          include: {
            user: {
              select: { name: true, primaryEmail: true },
            },
          },
        },
      },
    }),
    db.coachingBooking.findMany({
      orderBy: { scheduledStart: "desc" },
      take: 12,
      include: {
        clientUser: { select: { name: true, primaryEmail: true } },
        coachUser: { select: { name: true, primaryEmail: true } },
        offering: true,
        paymentRecord: true,
        checkoutSessionLedgers: { orderBy: { createdAt: "desc" }, take: 2 },
        calendarLinks: { orderBy: { createdAt: "desc" }, take: 2 },
        callRoom: {
          include: {
            participants: true,
            recordingConsents: true,
            recordingAssets: true,
            transcriptJobs: true,
          },
        },
      },
    }),
    db.callRoom.findMany({
      orderBy: { updatedAt: "desc" },
      take: 12,
      include: {
        booking: {
          include: {
            clientUser: { select: { name: true, email: true } },
            offering: true,
          },
        },
        participants: true,
        recordingConsents: true,
        recordingAssets: true,
        transcriptJobs: true,
      },
    }),
    db.transcriptJob.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { room: true, asset: true },
    }),
    db.recordingAsset.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { room: true, uploadChunks: true },
    }),
    db.coachingNote.findMany({
      where: {
        kind: { in: ["SUMMARY", "HIGHLIGHT", "ACTION_ITEM", "FOLLOW_UP"] },
      },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { room: true, actionItems: true },
    }),
    db.actionItem.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { room: true, note: true },
    }),
    db.userAccountDeletionRequest.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        user: {
          select: { name: true, primaryEmail: true },
        },
      },
    }),
    db.user.findMany({
      where: {
        roles: {
          some: {
            role: "CLIENT",
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 24,
      select: { id: true, name: true, primaryEmail: true },
    }),
    db.stripeCustomerLink.findMany({
      orderBy: { updatedAt: "desc" },
      take: 24,
      include: {
        user: {
          select: { id: true, name: true, primaryEmail: true },
        },
      },
    }),
  ]);

  return {
    coachProfiles,
    offerings,
    availabilityWindows,
    bookings,
    rooms,
    transcriptJobs,
    recordingAssets,
    packetNotes,
    actionItems: actionItems.filter((item: any) => !isUnreviewedTranscriptActionItem(item)),
    quarantinedLegacyActionCandidates: actionItems.filter(isUnreviewedTranscriptActionItem),
    deletionRequests,
    clients,
    stripeCustomerLinks,
  };
}

export default async function TeamCoachingCapturePage({
  searchParams,
}: {
  searchParams?: RunwaySearchParams;
}) {
  const runway = await loadRunway();
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const setupError = firstParam(resolvedSearchParams, "setupError");
  const bookingError = firstParam(resolvedSearchParams, "bookingError");
  const deletionError = firstParam(resolvedSearchParams, "deletionError");
  const checkoutError = firstParam(resolvedSearchParams, "checkoutError");
  const portalError = firstParam(resolvedSearchParams, "portalError");
  const availabilityError = firstParam(resolvedSearchParams, "availabilityError");
  const transcriptError = firstParam(resolvedSearchParams, "transcriptError");
  const packetError = firstParam(resolvedSearchParams, "packetError");
  const roomError = firstParam(resolvedSearchParams, "roomError");
  const egressError = firstParam(resolvedSearchParams, "egressError");
  const verificationError = firstParam(resolvedSearchParams, "verificationError");
  const setupStatus = firstParam(resolvedSearchParams, "setup");
  const bookingStatus = firstParam(resolvedSearchParams, "booking");
  const deletionStatus = firstParam(resolvedSearchParams, "deletion");
  const checkoutStatus = firstParam(resolvedSearchParams, "checkout");
  const portalStatus = firstParam(resolvedSearchParams, "portal");
  const availabilityStatus = firstParam(resolvedSearchParams, "availability");
  const transcriptStatus = firstParam(resolvedSearchParams, "transcript");
  const packetStatus = firstParam(resolvedSearchParams, "packet");
  const roomStatus = firstParam(resolvedSearchParams, "room");
  const egressStatus = firstParam(resolvedSearchParams, "egress");
  const egressMessage = firstParam(resolvedSearchParams, "egressMessage");
  const verificationStatus = firstParam(resolvedSearchParams, "verification");
  const verificationMessage = firstParam(resolvedSearchParams, "verificationMessage");

  const paidBookings = runway.bookings.filter((booking: any) => booking.paymentPolicy === "PAID_ONE_TO_ONE");
  const stripeCustomerByUserId = new Map(
    runway.stripeCustomerLinks.map((link: any) => [link.userId, link.stripeCustomerId]),
  );
  const portalCandidates = Array.from(
    new Map(
      paidBookings.map((booking: any) => [
        booking.clientUserId,
        {
          userId: booking.clientUserId,
          name: booking.clientUser?.name || "Coaching client",
          email: booking.clientUser?.primaryEmail || "No email",
          stripeCustomerId: booking.paymentRecord?.providerCustomerId || stripeCustomerByUserId.get(booking.clientUserId) || "",
          paymentStatus: booking.paymentRecord?.status || booking.paymentPolicy,
          bookingStatus: booking.status,
        },
      ]),
    ).values(),
  );
  const consentedRooms = runway.rooms.filter((room: any) => room.recordingConsents.some((consent: any) => consent.status === "GRANTED"));
  const verifiedAssets = runway.recordingAssets.filter((asset: any) => asset.status === "VERIFIED");
  const packetReviewCandidates = runway.packetNotes.flatMap((note: any) =>
    packetActionCandidatesFromSource(note.sourceJson).filter((candidate) => (
      candidate.humanApprovalRequired !== false && !candidate.committedActionItemId
    )),
  );
  const reviewCandidateIds = new Set([
    ...packetReviewCandidates.map((candidate: { id: string }) => candidate.id),
    ...runway.quarantinedLegacyActionCandidates.map((item: any) => String(item.id)),
  ]);

  return (
    <div className="space-y-8 text-[var(--text-light)]">
      <GlassPanel className="p-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <PageEyebrow>Coaching Capture</PageEyebrow>
          <PageEyebrow>Runway</PageEyebrow>
        </div>
        <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <h2 className="m-0 text-[clamp(2rem,4vw,3.6rem)] leading-none tracking-[-0.04em]">
              From request to recorded wisdom.
            </h2>
            <p className="mb-0 mt-4 max-w-[780px] text-sm leading-7 text-[rgba(245,239,230,0.78)]">
              This is the operator view for the coaching and podcast capture spine. Stripe, calendar, and recording providers are evidence feeds. Quipsly owns the booking, consent, recording, transcript, notes, and follow-up truth.
            </p>
          </div>
          <div className="rounded-2xl border border-amber-200/20 bg-amber-200/10 p-4 text-sm leading-6 text-amber-50">
            Controlled writes only. Setup, booking drafts, and deletion-request state changes stay reversible and ledgered.
          </div>
        </div>
      </GlassPanel>

      {(setupError || bookingError || deletionError || checkoutError || portalError || availabilityError || transcriptError || packetError || roomError || egressError || verificationError || setupStatus || bookingStatus || deletionStatus || checkoutStatus || portalStatus || availabilityStatus || transcriptStatus || packetStatus || roomStatus || egressStatus || verificationStatus) ? (
        <GlassPanel className="p-5">
          {setupError || bookingError || deletionError || checkoutError || portalError || availabilityError || transcriptError || packetError || roomError || egressError || verificationError ? (
            <div className="rounded-2xl border border-rose-300/25 bg-rose-300/10 p-4 text-sm leading-6 text-rose-50">
              <strong>Action held:</strong> {setupError || bookingError || deletionError || checkoutError || portalError || availabilityError || transcriptError || packetError || roomError || egressError || verificationError}
            </div>
          ) : (
            <div className="rounded-2xl border border-emerald-300/25 bg-emerald-300/10 p-4 text-sm leading-6 text-emerald-50">
              <strong>Action complete:</strong>{" "}
              {setupStatus === "seeded"
                ? "Coaching and capture foundation records were seeded or refreshed."
                : availabilityStatus === "created"
                  ? "Availability window was added to the scheduling runway."
                : bookingStatus === "created"
                  ? "Draft booking, hold, calendar stub, and call room were created."
                  : checkoutStatus === "success"
                    ? "Stripe checkout returned successfully. Webhook evidence should reconcile payment state."
                    : checkoutStatus === "cancel"
                      ? "Stripe checkout was canceled. The booking and hold remain reviewable."
                    : portalStatus === "returned"
                      ? "Returned from Stripe Customer Portal. Quipsly booking and payment evidence remain the source of truth."
                    : portalStatus
                      ? `Stripe Customer Portal action updated: ${label(portalStatus)}.`
                    : transcriptStatus
                      ? `Transcript job updated: ${label(transcriptStatus)}.`
                    : packetStatus === "built"
                      ? "A review packet was built from released transcript evidence. Inferred follow-ups remain candidates; no task was created automatically."
                    : roomStatus === "livekit-prepared"
                      ? "Call room is prepared for LiveKit token minting. Recording still requires explicit consent and visible recording state."
                    : egressStatus
                      ? `Provider recording ${label(egressStatus)}${egressMessage ? `: ${egressMessage}` : "."}`
                    : verificationStatus
                      ? `Provider recording verification ${label(verificationStatus)}${verificationMessage ? `: ${verificationMessage}` : "."}`
                  : "Account deletion request status was updated without destructive deletion."}
            </div>
          )}
        </GlassPanel>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <Stat icon={Users} label="Clients" value={runway.clients.length} />
        <Stat icon={Clock} label="Availability" value={runway.availabilityWindows.length} />
        <Stat icon={Sparkles} label="Offerings" value={runway.offerings.length} />
        <Stat icon={CalendarDays} label="Bookings" value={runway.bookings.length} />
        <Stat icon={CreditCard} label="Paid lane" value={paidBookings.length} />
        <Stat icon={ShieldCheck} label="Rooms with a grant" value={consentedRooms.length} />
      </div>

      <GlassPanel className="p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <PageEyebrow>Stripe evidence</PageEyebrow>
              <PageEyebrow>Customer Portal</PageEyebrow>
            </div>
            <h3 className="m-0 text-2xl font-semibold">Let paid coaching clients manage Stripe details safely.</h3>
            <p className="mb-0 mt-2 max-w-[760px] text-sm leading-7 text-[rgba(245,239,230,0.74)]">
              Customer Portal is available only when a client has Stripe customer evidence from checkout or webhook reconciliation. Portal sessions do not create bookings, consent, recordings, transcripts, or entitlements. Quipsly keeps those truths.
            </p>
          </div>
          <Pill tone={portalCandidates.length > 0 ? "safe" : "warning"}>
            {portalCandidates.length} portal candidate{portalCandidates.length === 1 ? "" : "s"}
          </Pill>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {portalCandidates.length > 0 ? (
            portalCandidates.map((candidate: any) => (
              <form
                key={candidate.userId || candidate.email}
                action={createCoachingCustomerPortalAction}
                className="rounded-2xl border border-white/10 bg-white/6 p-4"
              >
                <input type="hidden" name="userId" value={candidate.userId || ""} />
                <input type="hidden" name="stripeCustomerId" value={candidate.stripeCustomerId || ""} />
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-[var(--text-light)]">{candidate.name}</div>
                    <div className="mt-1 text-xs text-[rgba(245,239,230,0.62)]">{candidate.email}</div>
                    <div className="mt-1 text-xs text-[rgba(245,239,230,0.46)]">
                      {candidate.stripeCustomerId ? `Stripe customer ${candidate.stripeCustomerId}` : "Waiting for reconciled Stripe customer evidence"}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Pill tone={toneForStatus(candidate.paymentStatus)}>{label(candidate.paymentStatus)}</Pill>
                    <Pill tone={toneForStatus(candidate.bookingStatus)}>{label(candidate.bookingStatus)}</Pill>
                  </div>
                </div>
                <button
                  type="submit"
                  className="rounded-full border border-sky-200/20 bg-sky-300/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-sky-50 transition hover:bg-sky-300/20 disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={!candidate.stripeCustomerId}
                >
                  Open Stripe Customer Portal
                </button>
                {!candidate.stripeCustomerId ? (
                  <p className="mb-0 mt-3 text-xs leading-5 text-amber-100/80">
                    Run checkout and webhook reconciliation first. We do not create portal sessions from guesses.
                  </p>
                ) : null}
              </form>
            ))
          ) : (
            <div className="rounded-2xl border border-amber-200/20 bg-amber-200/10 p-4 text-sm leading-6 text-amber-50 lg:col-span-2">
              No paid coaching clients have Stripe customer evidence yet. Create a paid one-to-one booking, run Stripe test checkout, then let webhook evidence reconcile before opening Customer Portal.
            </div>
          )}
        </div>
      </GlassPanel>

      <GlassPanel className="p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <PageEyebrow>Controlled setup</PageEyebrow>
              <PageEyebrow>Internal only</PageEyebrow>
            </div>
            <h3 className="m-0 text-2xl font-semibold">Create the objects the capture app can join.</h3>
            <p className="mb-0 mt-2 max-w-[760px] text-sm leading-7 text-[rgba(245,239,230,0.74)]">
              These controls are intentionally gated by environment variables. They let us seed offerings and draft internal bookings while the public scheduling UX, Prisma migration, and validation work mature.
            </p>
          </div>
          <form action={seedCoachingCaptureFoundationAction}>
            <button
              type="submit"
              className="rounded-full border border-emerald-200/20 bg-emerald-300/15 px-5 py-3 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-300/20"
            >
              Seed coaching + capture foundation
            </button>
          </form>
        </div>

        <form action={createBookingDraftAction} className="grid gap-4 lg:grid-cols-2 xl:grid-cols-5">
          <label className="grid gap-2 text-sm font-semibold text-[rgba(245,239,230,0.8)]">
            Client
            <select
              name="clientUserId"
              required
              className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-[var(--text-light)]"
              defaultValue=""
            >
              <option value="" disabled>
                Pick a client
              </option>
              {runway.clients.map((client: any) => (
                <option key={client.id} value={client.id}>
                  {client.name || client.primaryEmail}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-semibold text-[rgba(245,239,230,0.8)]">
            Offering
            <select
              name="offeringId"
              required
              className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-[var(--text-light)]"
              defaultValue=""
            >
              <option value="" disabled>
                Pick an offering
              </option>
              {runway.offerings.map((offering: any) => (
                <option key={offering.id} value={offering.id}>
                  {offering.title}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-semibold text-[rgba(245,239,230,0.8)]">
            Starts
            <input
              name="scheduledStart"
              type="datetime-local"
              required
              className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-[var(--text-light)]"
            />
          </label>

          <label className="grid gap-2 text-sm font-semibold text-[rgba(245,239,230,0.8)]">
            Ends
            <input
              name="scheduledEnd"
              type="datetime-local"
              required
              className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-[var(--text-light)]"
            />
          </label>

          <label className="grid gap-2 text-sm font-semibold text-[rgba(245,239,230,0.8)]">
            Note
            <input
              name="notes"
              placeholder="Optional internal note"
              className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-[var(--text-light)] placeholder:text-[rgba(245,239,230,0.44)]"
            />
          </label>

          <div className="lg:col-span-2 xl:col-span-5">
            <button
              type="submit"
              className="rounded-full border border-amber-200/20 bg-amber-200/12 px-5 py-3 text-sm font-semibold text-amber-50 transition hover:bg-amber-200/18"
            >
              Create draft booking, hold, calendar stub, and call room
            </button>
          </div>
        </form>
      </GlassPanel>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <GlassPanel className="p-6">
          <div className="mb-5 flex items-center gap-3">
            <Stethoscope className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
            <div>
              <h3 className="m-0 text-2xl font-semibold">Service offerings</h3>
              <p className="m-0 text-sm text-[rgba(245,239,230,0.66)]">What can be booked without hard-coding the business.</p>
            </div>
          </div>

          <div className="space-y-3">
            {runway.offerings.length === 0 ? (
              <p className="rounded-2xl border border-white/10 bg-white/6 p-4 text-sm text-[rgba(245,239,230,0.72)]">
                No service offerings yet. Next step: seed one-to-one coaching and podcast capture offerings.
              </p>
            ) : (
              runway.offerings.map((offering: any) => (
                <div key={offering.id} className="rounded-2xl border border-white/10 bg-white/6 p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <strong>{offering.title}</strong>
                    <Pill tone={offering.isActive ? "safe" : "neutral"}>{offering.isActive ? "Active" : "Paused"}</Pill>
                    <Pill tone={offering.paymentPolicy === "PAID_ONE_TO_ONE" ? "warning" : "neutral"}>{label(offering.paymentPolicy)}</Pill>
                  </div>
                  <p className="m-0 text-sm leading-6 text-[rgba(245,239,230,0.72)]">
                    {label(offering.kind)} · {offering.durationMinutes} min · {offering.coachProfile?.user?.name || offering.coachProfile?.user?.primaryEmail || "No coach assigned"}
                  </p>
                </div>
              ))
            )}
          </div>
        </GlassPanel>

        <GlassPanel className="p-6">
          <div className="mb-5 flex items-center gap-3">
            <Clock className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
            <div>
              <h3 className="m-0 text-2xl font-semibold">Availability windows</h3>
              <p className="m-0 text-sm text-[rgba(245,239,230,0.66)]">Reusable scheduling blocks. These guide booking, but the booking remains the source of truth.</p>
            </div>
          </div>

          <form action={createAvailabilityWindowAction} className="mb-5 grid gap-3 rounded-2xl border border-white/10 bg-black/10 p-4 md:grid-cols-2">
            <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[rgba(245,239,230,0.58)]">
              Coach
              <select
                name="coachProfileId"
                required
                defaultValue=""
                className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm normal-case tracking-normal text-[var(--text-light)]"
              >
                <option value="" disabled>
                  Pick a coach
                </option>
                {runway.coachProfiles.map((profile: any) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.displayName || profile.user?.name || profile.user?.primaryEmail}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[rgba(245,239,230,0.58)]">
              Label
              <input
                name="label"
                placeholder="Tuesday afternoon coaching"
                className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm normal-case tracking-normal text-[var(--text-light)] placeholder:text-[rgba(245,239,230,0.42)]"
              />
            </label>
            <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[rgba(245,239,230,0.58)]">
              Day
              <select
                name="dayOfWeek"
                required
                defaultValue="2"
                className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm normal-case tracking-normal text-[var(--text-light)]"
              >
                {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, index) => (
                  <option key={day} value={index}>
                    {day}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[rgba(245,239,230,0.58)]">
              Timezone
              <input
                name="timezone"
                defaultValue="America/Los_Angeles"
                className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm normal-case tracking-normal text-[var(--text-light)]"
              />
            </label>
            <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[rgba(245,239,230,0.58)]">
              Starts
              <input
                name="startTime"
                type="time"
                required
                defaultValue="13:00"
                className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm normal-case tracking-normal text-[var(--text-light)]"
              />
            </label>
            <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[rgba(245,239,230,0.58)]">
              Ends
              <input
                name="endTime"
                type="time"
                required
                defaultValue="17:00"
                className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm normal-case tracking-normal text-[var(--text-light)]"
              />
            </label>
            <button
              type="submit"
              className="md:col-span-2 rounded-full border border-white/10 bg-white/8 px-4 py-2 text-xs font-bold uppercase tracking-[0.1em] text-[rgba(245,239,230,0.88)] transition hover:bg-white/12"
            >
              Add availability window
            </button>
          </form>

          <div className="space-y-3">
            {runway.availabilityWindows.length === 0 ? (
              <p className="rounded-2xl border border-white/10 bg-white/6 p-4 text-sm text-[rgba(245,239,230,0.72)]">
                No availability windows yet. Add one reusable block before drafting bookings.
              </p>
            ) : (
              runway.availabilityWindows.map((window: any) => (
                <div key={window.id} className="rounded-2xl border border-white/10 bg-white/6 p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <strong>{window.label || "Coaching availability"}</strong>
                    <Pill tone={window.isActive ? "safe" : "neutral"}>{window.isActive ? "Active" : "Paused"}</Pill>
                  </div>
                  <p className="m-0 text-sm leading-6 text-[rgba(245,239,230,0.72)]">
                    {window.coachProfile?.displayName || window.coachProfile?.user?.name || window.coachProfile?.user?.primaryEmail || "Coach"} · {weekdayLabel(window.dayOfWeek)} · {minuteLabel(window.startMinute)} to {minuteLabel(window.endMinute)} · {window.timezone}
                  </p>
                </div>
              ))
            )}
          </div>
        </GlassPanel>

        <GlassPanel className="p-6">
          <div className="mb-5 flex items-center gap-3">
            <CalendarDays className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
            <div>
              <h3 className="m-0 text-2xl font-semibold">Bookings</h3>
              <p className="m-0 text-sm text-[rgba(245,239,230,0.66)]">Quipsly-owned scheduled session truth.</p>
            </div>
          </div>

          <div className="space-y-4">
            {runway.bookings.length === 0 ? (
              <p className="rounded-2xl border border-white/10 bg-white/6 p-4 text-sm text-[rgba(245,239,230,0.72)]">
                No coaching bookings yet. Requests and appointments still exist; this page will become the calmer booking spine.
              </p>
            ) : (
              runway.bookings.map((booking: any) => (
                <article key={booking.id} className="rounded-3xl border border-white/10 bg-white/6 p-5">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <Pill tone={toneForStatus(booking.status)}>{label(booking.status)}</Pill>
                    <Pill tone={toneForStatus(booking.paymentRecord?.status)}>{booking.paymentRecord ? label(booking.paymentRecord.status) : label(booking.paymentPolicy)}</Pill>
                    <Pill tone={booking.callRoom ? "safe" : "warning"}>{booking.callRoom ? "Call room planned" : "No call room"}</Pill>
                  </div>
                  <h4 className="m-0 text-xl font-semibold">{booking.offering?.title || "Coaching session"}</h4>
                  <p className="mb-3 mt-2 text-sm leading-6 text-[rgba(245,239,230,0.72)]">
                    {dateTime(booking.scheduledStart)} to {dateTime(booking.scheduledEnd)} · Client {booking.clientUser?.name || booking.clientUser?.primaryEmail || "Unknown"}
                  </p>
                  <div className="rounded-2xl border border-white/10 bg-black/10 p-3 text-sm leading-6 text-[rgba(245,239,230,0.78)]">
                    <strong>Next safest action:</strong> {nextActionForBooking(booking)}
                  </div>
                  <form action={updateCoachingBookingRunwayAction} className="mt-4 rounded-2xl border border-white/10 bg-black/10 p-3">
                    <input type="hidden" name="bookingId" value={booking.id} />
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[rgba(245,239,230,0.58)]">
                        State
                        <select
                          name="status"
                          defaultValue={booking.status}
                          className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm normal-case tracking-normal text-[var(--text-light)]"
                        >
                          {["REQUESTED", "HOLDING_PAYMENT", "CONFIRMED", "COMPLETED", "CANCELED", "NO_SHOW"].map((status) => (
                            <option key={status} value={status}>
                              {label(status)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[rgba(245,239,230,0.58)]">
                        Starts
                        <input
                          name="scheduledStart"
                          type="datetime-local"
                          defaultValue={dateTimeLocalValue(booking.scheduledStart)}
                          className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm normal-case tracking-normal text-[var(--text-light)]"
                        />
                      </label>
                      <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[rgba(245,239,230,0.58)]">
                        Ends
                        <input
                          name="scheduledEnd"
                          type="datetime-local"
                          defaultValue={dateTimeLocalValue(booking.scheduledEnd)}
                          className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm normal-case tracking-normal text-[var(--text-light)]"
                        />
                      </label>
                      <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[rgba(245,239,230,0.58)]">
                        Timezone
                        <input
                          name="timezone"
                          defaultValue={booking.timezone || "America/Los_Angeles"}
                          className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm normal-case tracking-normal text-[var(--text-light)]"
                        />
                      </label>
                    </div>
                    <label className="mt-3 grid gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[rgba(245,239,230,0.58)]">
                      Operator note
                      <input
                        name="note"
                        placeholder="Rescheduled with client, payment confirmed, no-show note, etc."
                        className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm normal-case tracking-normal text-[var(--text-light)] placeholder:text-[rgba(245,239,230,0.42)]"
                      />
                    </label>
                    <button
                      type="submit"
                      className="mt-3 rounded-full border border-white/10 bg-white/8 px-4 py-2 text-xs font-bold uppercase tracking-[0.1em] text-[rgba(245,239,230,0.88)] transition hover:bg-white/12"
                    >
                      Update booking runway
                    </button>
                    <p className="mb-0 mt-2 text-xs leading-5 text-[rgba(245,239,230,0.58)]">
                      Updates the Quipsly booking first, then syncs linked hold, calendar evidence, and planned call room schedule.
                    </p>
                  </form>
                  {booking.paymentPolicy === "PAID_ONE_TO_ONE" && booking.paymentRecord?.status !== "PAID" ? (
                    <form action={createCoachingCheckoutAction} className="mt-4">
                      <input type="hidden" name="bookingId" value={booking.id} />
                      <button
                        type="submit"
                        className="rounded-full border border-emerald-200/25 bg-emerald-300/14 px-4 py-2 text-xs font-bold uppercase tracking-[0.1em] text-emerald-50 transition hover:bg-emerald-300/20"
                      >
                        Create Stripe test checkout
                      </button>
                      <p className="mb-0 mt-2 text-xs leading-5 text-[rgba(245,239,230,0.58)]">
                        Guarded by Stripe environment and live-key approval. Quipsly keeps the booking truth; Stripe provides payment evidence.
                      </p>
                    </form>
                  ) : null}
                </article>
              ))
            )}
          </div>
        </GlassPanel>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <GlassPanel className="p-6">
          <div className="mb-5 flex items-center gap-3">
            <Mic className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
            <div>
              <h3 className="m-0 text-2xl font-semibold">Call rooms and recording state</h3>
              <p className="m-0 text-sm text-[rgba(245,239,230,0.66)]">No recording without consent. No transcript without a verified asset.</p>
            </div>
          </div>

          <div className="space-y-4">
            {runway.rooms.length === 0 ? (
              <p className="rounded-2xl border border-white/10 bg-white/6 p-4 text-sm text-[rgba(245,239,230,0.72)]">
                No call rooms yet. Booking drafts will create planned rooms, then iOS capture can attach recordings.
              </p>
            ) : (
              runway.rooms.map((room: any) => (
                <article key={room.id} className="rounded-3xl border border-white/10 bg-white/6 p-5">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <Pill tone={toneForStatus(room.status)}>{label(room.status)}</Pill>
                    <Pill>{label(room.purpose)}</Pill>
                    <Pill tone={(room.recordingConsents?.length || 0) > 0 ? "safe" : "warning"}>{room.recordingConsents?.length || 0} consent</Pill>
                    <Pill tone={(room.recordingAssets?.length || 0) > 0 ? "safe" : "warning"}>{room.recordingAssets?.length || 0} recordings</Pill>
                    <Pill tone={(room.transcriptJobs?.length || 0) > 0 ? "safe" : "warning"}>{room.transcriptJobs?.length || 0} transcripts</Pill>
                  </div>
                  <h4 className="m-0 text-xl font-semibold">{room.title || room.booking?.offering?.title || "Call room"}</h4>
                  <p className="mb-3 mt-2 text-sm leading-6 text-[rgba(245,239,230,0.72)]">
                    {dateTime(room.scheduledStart)} · Provider {label(room.provider)} · Client {room.booking?.clientUser?.name || room.booking?.clientUser?.primaryEmail || "Not attached"}
                    {room.providerRoomId ? ` · Room ${room.providerRoomId}` : ""}
                  </p>
                  <div className="rounded-2xl border border-white/10 bg-black/10 p-3 text-sm leading-6 text-[rgba(245,239,230,0.78)]">
                    <strong>Next safest action:</strong> {nextActionForRoom(room)}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <form action={updateProviderRecordingEgressAction}>
                      <input type="hidden" name="callRoomId" value={room.id} />
                      <input type="hidden" name="action" value="START" />
                      <button
                        type="submit"
                        className="rounded-full border border-emerald-200/25 bg-emerald-300/14 px-4 py-2 text-xs font-bold uppercase tracking-[0.1em] text-emerald-50 transition hover:bg-emerald-300/20 disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={room.provider !== "livekit" || ["CANCELED", "ENDED", "FAILED"].includes(room.status)}
                      >
                        Start provider recording
                      </button>
                    </form>
                    <form action={updateProviderRecordingEgressAction}>
                      <input type="hidden" name="callRoomId" value={room.id} />
                      <input type="hidden" name="action" value="STOP" />
                      <button
                        type="submit"
                        className="rounded-full border border-amber-200/25 bg-amber-300/14 px-4 py-2 text-xs font-bold uppercase tracking-[0.1em] text-amber-50 transition hover:bg-amber-300/20 disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={room.provider !== "livekit"}
                      >
                        Stop provider recording
                      </button>
                    </form>
                  </div>
                  <p className="mb-0 mt-2 text-xs leading-5 text-[rgba(245,239,230,0.58)]">
                    Provider recording is consent-gated. Held attempts create reviewable recording-asset evidence instead of pretending success.
                  </p>
                  {room.provider !== "livekit" && !["CANCELED", "ENDED", "FAILED"].includes(room.status) ? (
                    <form action={prepareLiveKitCallRoomAction} className="mt-4">
                      <input type="hidden" name="callRoomId" value={room.id} />
                      <button
                        type="submit"
                        className="rounded-full border border-sky-200/25 bg-sky-300/14 px-4 py-2 text-xs font-bold uppercase tracking-[0.1em] text-sky-50 transition hover:bg-sky-300/20"
                      >
                        Prepare LiveKit room
                      </button>
                      <p className="mb-0 mt-2 text-xs leading-5 text-[rgba(245,239,230,0.58)]">
                        Sets provider routing only. It does not start recording, invite participants, or charge anyone.
                      </p>
                    </form>
                  ) : null}
                </article>
              ))
            )}
          </div>
        </GlassPanel>

        <div className="space-y-6">
          <GlassPanel className="p-6">
            <div className="mb-5 flex items-center gap-3">
              <FileAudio className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
              <div>
                <h3 className="m-0 text-2xl font-semibold">Recent recording assets</h3>
                <p className="m-0 text-sm text-[rgba(245,239,230,0.66)]">Upload evidence from capture devices.</p>
              </div>
            </div>
            <div className="space-y-3">
              {runway.recordingAssets.length === 0 ? (
                <p className="text-sm text-[rgba(245,239,230,0.72)]">No recording assets yet.</p>
              ) : (
                runway.recordingAssets.map((asset: any) => (
                  <div key={asset.id} className="rounded-2xl border border-white/10 bg-white/6 p-4">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Pill tone={toneForStatus(asset.status)}>{label(asset.status)}</Pill>
                      <Pill>{label(asset.kind)}</Pill>
                      <Pill>{asset.uploadChunks?.length || 0} chunks</Pill>
                    </div>
                    <p className="m-0 text-sm leading-6 text-[rgba(245,239,230,0.72)]">{asset.fileName || "Unnamed recording"}</p>
                    {asset.kind === "SERVER_MIX" && asset.status !== "VERIFIED" ? (
                      <form action={reconcileProviderRecordingAssetAction} className="mt-3">
                        <input type="hidden" name="recordingAssetId" value={asset.id} />
                        <button
                          type="submit"
                          className="rounded-full border border-emerald-200/25 bg-emerald-300/14 px-4 py-2 text-xs font-bold uppercase tracking-[0.1em] text-emerald-50 transition hover:bg-emerald-300/20"
                        >
                          Verify provider file
                        </button>
                        <p className="mb-0 mt-2 text-xs leading-5 text-[rgba(245,239,230,0.58)]">
                          Verifies storage bytes, then rechecks the immutable egress-start consent binding. Media and transcription release separately; held never means success.
                        </p>
                      </form>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </GlassPanel>

          <GlassPanel className="p-6">
            <div className="mb-5 flex items-center gap-3">
              <Clock className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
              <div>
                <h3 className="m-0 text-2xl font-semibold">Transcript queue</h3>
                <p className="m-0 text-sm text-[rgba(245,239,230,0.66)]">Verified bytes are necessary, but transcription starts only after the durable release and current all-party transcription gates pass.</p>
              </div>
            </div>
            <div className="space-y-3">
              {runway.transcriptJobs.length === 0 ? (
                <p className="text-sm text-[rgba(245,239,230,0.72)]">No transcript jobs yet.</p>
              ) : (
                runway.transcriptJobs.map((job: any) => (
                  <div key={job.id} className="rounded-2xl border border-white/10 bg-white/6 p-4">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Pill tone={toneForStatus(job.status)}>{label(job.status)}</Pill>
                      <Pill>{label(job.provider)}</Pill>
                    </div>
                    <p className="m-0 text-sm leading-6 text-[rgba(245,239,230,0.72)]">{job.room?.title || job.asset?.fileName || "Transcript job"}</p>
                    {job.errorMessage ? (
                      <p className="mb-0 mt-2 rounded-xl border border-amber-200/20 bg-amber-200/10 p-3 text-xs leading-5 text-amber-50">
                        {job.errorMessage}
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {job.status !== "COMPLETED" ? (
                        <form action={runTranscriptJobAction}>
                          <input type="hidden" name="transcriptJobId" value={job.id} />
                          <button
                            type="submit"
                            className="rounded-full border border-white/10 bg-white/8 px-3 py-2 text-xs font-semibold text-[rgba(245,239,230,0.86)] transition hover:bg-white/12"
                          >
                            Run transcript
                          </button>
                        </form>
                      ) : (
                        <>
                          <form action={buildCoachingPacketAction}>
                            <input type="hidden" name="transcriptJobId" value={job.id} />
                            <button
                              type="submit"
                              className="rounded-full border border-emerald-200/20 bg-emerald-300/14 px-3 py-2 text-xs font-semibold text-emerald-50 transition hover:bg-emerald-300/20"
                            >
                              Build packet
                            </button>
                          </form>
                          <form action={buildCoachingPacketAction}>
                            <input type="hidden" name="transcriptJobId" value={job.id} />
                            <input type="hidden" name="force" value="true" />
                            <button
                              type="submit"
                              className="rounded-full border border-amber-200/20 bg-amber-200/10 px-3 py-2 text-xs font-semibold text-amber-50 transition hover:bg-amber-200/16"
                            >
                              Rebuild packet
                            </button>
                          </form>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </GlassPanel>

          <GlassPanel className="p-6">
            <div className="mb-5 flex items-center gap-3">
              <ClipboardCheck className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
              <div>
                <h3 className="m-0 text-2xl font-semibold">Coaching packets</h3>
                <p className="m-0 text-sm text-[rgba(245,239,230,0.66)]">Candidate notes are not tasks. Only an explicit human accept decision may create committed work.</p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-amber-200/20 bg-amber-200/8 p-4">
                  <p className="m-0 text-xs font-semibold uppercase tracking-[0.12em] text-amber-100">Recent review candidates</p>
                  <p className="mb-0 mt-2 text-2xl font-semibold text-amber-50">{reviewCandidateIds.size}</p>
                </div>
                <div className="rounded-2xl border border-emerald-200/20 bg-emerald-300/8 p-4">
                  <p className="m-0 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-100">Recent committed actions</p>
                  <p className="mb-0 mt-2 text-2xl font-semibold text-emerald-50">{runway.actionItems.length}</p>
                </div>
              </div>
              <p className="rounded-2xl border border-sky-200/20 bg-sky-300/8 p-4 text-xs leading-5 text-sky-50">
                Every transcript-derived follow-up below is a proposed candidate, never a task. It remains proposed until an authenticated reviewer records an explicit accept decision in the Session Review Desk; this runway has no button that can silently create work.
              </p>
              {runway.packetNotes.length === 0 && runway.actionItems.length === 0 && reviewCandidateIds.size === 0 ? (
                <p className="text-sm text-[rgba(245,239,230,0.72)]">No coaching packets yet. Complete a transcript, then build a packet.</p>
              ) : (
                <>
                  {runway.packetNotes.map((note: any) => (
                    <div key={note.id} className="rounded-2xl border border-white/10 bg-white/6 p-4">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Pill tone={note.kind === "SUMMARY" ? "safe" : "warning"}>{label(note.kind)}</Pill>
                        <Pill>{packetActionCandidatesFromSource(note.sourceJson).filter((candidate) => candidate.humanApprovalRequired !== false && !candidate.committedActionItemId).length} proposed</Pill>
                        <Pill>{(note.actionItems || []).filter((item: any) => !isUnreviewedTranscriptActionItem(item)).length} committed</Pill>
                      </div>
                      <p className="m-0 text-sm font-semibold text-[var(--text-light)]">{note.title || "Coaching packet note"}</p>
                      <p className="mb-0 mt-2 line-clamp-3 text-sm leading-6 text-[rgba(245,239,230,0.72)]">{note.body}</p>
                      {packetActionCandidatesFromSource(note.sourceJson)
                        .filter((candidate) => candidate.humanApprovalRequired !== false && !candidate.committedActionItemId)
                        .slice(0, 4)
                        .map((candidate) => (
                          <div key={candidate.id} className="mt-3 rounded-xl border border-amber-200/16 bg-amber-200/7 p-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <Pill tone="warning">Proposed follow-up</Pill>
                              <Pill>explicit review required</Pill>
                            </div>
                            <p className="mb-0 mt-2 text-sm font-semibold text-[var(--text-light)]">{candidate.title}</p>
                            {candidate.detail ? <p className="mb-0 mt-1 text-xs leading-5 text-[rgba(245,239,230,0.68)]">{candidate.detail}</p> : null}
                          </div>
                        ))}
                    </div>
                  ))}
                  {runway.actionItems.map((item: any) => (
                    <div key={item.id} className="rounded-2xl border border-amber-200/20 bg-amber-200/8 p-4">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Pill tone={toneForStatus(item.status)}>{label(item.status)}</Pill>
                        <Pill>human-accepted follow-up</Pill>
                      </div>
                      <p className="m-0 text-sm font-semibold text-[var(--text-light)]">{item.title}</p>
                      {item.detail ? (
                        <p className="mb-0 mt-2 line-clamp-2 text-sm leading-6 text-[rgba(245,239,230,0.72)]">{item.detail}</p>
                      ) : null}
                    </div>
                  ))}
                </>
              )}
            </div>
          </GlassPanel>

          <GlassPanel className="p-6">
            <div className="mb-5 flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
              <div>
                <h3 className="m-0 text-2xl font-semibold">Account deletion requests</h3>
                <p className="m-0 text-sm text-[rgba(245,239,230,0.66)]">Reviewed exit path for users with recordings, payments, consent, and transcript records.</p>
              </div>
            </div>
            <div className="space-y-3">
              {runway.deletionRequests.length === 0 ? (
                <p className="text-sm text-[rgba(245,239,230,0.72)]">No deletion requests yet.</p>
              ) : (
                runway.deletionRequests.map((request: any) => (
                  <div key={request.id} className="rounded-2xl border border-white/10 bg-white/6 p-4">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Pill tone={toneForStatus(request.status)}>{label(request.status)}</Pill>
                      <Pill>{dateTime(request.requestedAt)}</Pill>
                    </div>
                    <p className="m-0 text-sm font-semibold text-[var(--text-light)]">{request.user?.name || request.emailSnapshot || request.user?.primaryEmail || "Quipsly user"}</p>
                    {request.reason ? (
                      <p className="mb-0 mt-2 line-clamp-2 text-sm leading-6 text-[rgba(245,239,230,0.72)]">{request.reason}</p>
                    ) : (
                      <p className="mb-0 mt-2 text-sm leading-6 text-[rgba(245,239,230,0.72)]">No reason supplied. Review retention/export/payment records before destructive action.</p>
                    )}
                    <form action={updateAccountDeletionRequestAction} className="mt-4 rounded-2xl border border-white/10 bg-black/10 p-3">
                      <input type="hidden" name="requestId" value={request.id} />
                      <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[rgba(245,239,230,0.58)]">
                        Operator note for the next state change
                        <input
                          name="note"
                          placeholder="Export prepared, user verified, retention hold, etc."
                          className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm normal-case tracking-normal text-[var(--text-light)] placeholder:text-[rgba(245,239,230,0.42)]"
                        />
                      </label>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {[
                          ["REVIEWING", "Start review"],
                          ["EXPORT_PREPARING", "Prepare export"],
                          ["READY_FOR_DELETION", "Ready after review"],
                          ["COMPLETED", "Mark completed"],
                          ["CANCELED", "Cancel request"],
                          ["REJECTED", "Reject request"],
                        ].map(([status, actionLabel]) => (
                          <button
                            key={status}
                            type="submit"
                            name="status"
                            value={status}
                            className="w-full rounded-full border border-white/10 bg-white/8 px-3 py-2 text-xs font-semibold text-[rgba(245,239,230,0.86)] transition hover:bg-white/12"
                          >
                            {actionLabel}
                          </button>
                        ))}
                      </div>
                      <p className="mb-0 mt-3 text-xs leading-5 text-[rgba(245,239,230,0.58)]">
                        These buttons only move the review state and append operator history. They do not erase accounts, bookings, payments, recordings, transcripts, or notes.
                      </p>
                    </form>
                  </div>
                ))
              )}
            </div>
          </GlassPanel>
        </div>
      </section>

      <GlassPanel className="p-6">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-1 h-5 w-5 text-emerald-200" aria-hidden="true" />
          <div>
            <h3 className="m-0 text-xl font-semibold">Runway truth rules</h3>
            <p className="mb-0 mt-2 text-sm leading-7 text-[rgba(245,239,230,0.74)]">
              Stripe is payment evidence. Calendar is scheduling evidence. The iOS app is capture evidence. Quipsly owns the booking, consent, recording, transcript, notes, and action-item chain. This page should stay boringly honest even when the workflow gets magical.
            </p>
          </div>
        </div>
      </GlassPanel>
    </div>
  );
}
