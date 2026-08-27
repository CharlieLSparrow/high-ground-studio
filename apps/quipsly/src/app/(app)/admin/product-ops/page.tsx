import Link from "next/link";
import {
  Activity,
  CalendarCheck,
  ChartNoAxesCombined,
  CircleAlert,
  FileAudio,
  MailCheck,
  Mic2,
  NotebookPen,
  ShieldCheck,
  UserRoundCheck,
  Users,
} from "lucide-react";

import { getPrismaClient } from "@/lib/prisma";
import { requireQuipslyAdminActor } from "@/lib/server/user-management";

export const dynamic = "force-dynamic";

const WINDOWS = [7, 30, 90] as const;

function selectedWindow(raw?: string | string[]) {
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  return WINDOWS.includes(value as (typeof WINDOWS)[number]) ? value : 30;
}

function productEventLabel(eventName: string) {
  return eventName.replace(/^Product:\s*/, "").replaceAll("_", " ");
}

export default async function ProductOperationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ days?: string | string[] }>;
}) {
  await requireQuipslyAdminActor();
  const params = searchParams ? await searchParams : {};
  const days = selectedWindow(params.days);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const prisma = getPrismaClient();

  const [
    newAccounts,
    activeAccounts,
    suspendedAccounts,
    newCoachProfiles,
    bookings,
    coachingRooms,
    invitations,
    acceptedInvitations,
    preflights,
    joinedParticipants,
    recordingStarts,
    uploadedRecordings,
    completedTranscripts,
    coachingNotes,
    actionItems,
    goals,
    deliveryGroups,
    recentDeliveryFailures,
    openDeletionRequests,
    productEventGroups,
    uniqueProductActors,
  ] = await Promise.all([
    prisma.user.count({ where: { createdAt: { gte: since } } }),
    prisma.user.count({ where: { isActive: true } }),
    prisma.user.count({ where: { isActive: false } }),
    prisma.coachProfile.count({ where: { createdAt: { gte: since }, isActive: true } }),
    prisma.coachingBooking.count({ where: { createdAt: { gte: since } } }),
    prisma.callRoom.count({ where: { purpose: "COACHING", createdAt: { gte: since } } }),
    prisma.callRoomInvitation.count({ where: { createdAt: { gte: since }, room: { purpose: "COACHING" } } }),
    prisma.callRoomInvitation.count({ where: { acceptedAt: { gte: since }, room: { purpose: "COACHING" } } }),
    prisma.callParticipantPreflightReceipt.count({ where: { createdAt: { gte: since }, room: { purpose: "COACHING" } } }),
    prisma.callParticipant.count({ where: { joinedAt: { gte: since }, room: { purpose: "COACHING" } } }),
    prisma.callRoom.count({ where: { purpose: "COACHING", recordingStartedAt: { gte: since } } }),
    prisma.recordingAsset.count({ where: { uploadedAt: { gte: since }, room: { purpose: "COACHING" } } }),
    prisma.transcriptJob.count({ where: { status: "COMPLETED", completedAt: { gte: since }, room: { purpose: "COACHING" } } }),
    prisma.coachingNote.count({ where: { createdAt: { gte: since }, room: { purpose: "COACHING" } } }),
    prisma.actionItem.count({ where: { createdAt: { gte: since }, OR: [{ room: { purpose: "COACHING" } }, { engagementId: { not: null } }] } }),
    prisma.goal.count({ where: { createdAt: { gte: since }, OR: [{ room: { purpose: "COACHING" } }, { engagementId: { not: null } }] } }),
    prisma.callRoomInvitationDeliveryReceipt.groupBy({
      by: ["status"],
      where: { requestedAt: { gte: since } },
      _count: { id: true },
    }),
    prisma.callRoomInvitationDeliveryReceipt.findMany({
      where: { status: "FAILED", requestedAt: { gte: since } },
      orderBy: { requestedAt: "desc" },
      take: 12,
      select: {
        id: true,
        recipientEmail: true,
        errorCode: true,
        errorMessage: true,
        requestedAt: true,
        invitation: { select: { room: { select: { id: true, title: true } } } },
      },
    }),
    prisma.userAccountDeletionRequest.count({ where: { status: { in: ["REQUESTED", "REVIEWING", "EXPORT_PREPARING", "READY_FOR_DELETION", "EXECUTING", "FAILED"] } } }),
    prisma.userEvent.groupBy({
      by: ["eventName"],
      where: { createdAt: { gte: since }, eventName: { startsWith: "Product: " } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    }),
    prisma.userEvent.findMany({
      where: { createdAt: { gte: since }, eventName: { startsWith: "Product: " } },
      distinct: ["userId"],
      select: { userId: true },
    }),
  ]);

  const funnel = [
    { label: "New accounts", count: newAccounts, Icon: Users },
    { label: "Coach profiles", count: newCoachProfiles, Icon: UserRoundCheck },
    { label: "Bookings", count: bookings, Icon: CalendarCheck },
    { label: "Coaching rooms", count: coachingRooms, Icon: Mic2 },
    { label: "Invites accepted", count: acceptedInvitations, detail: `${invitations} sent`, Icon: MailCheck },
    { label: "Device preflights", count: preflights, Icon: ShieldCheck },
    { label: "Participants joined", count: joinedParticipants, Icon: Activity },
    { label: "Recordings started", count: recordingStarts, Icon: FileAudio },
    { label: "Sources uploaded", count: uploadedRecordings, Icon: FileAudio },
    { label: "Transcripts ready", count: completedTranscripts, Icon: NotebookPen },
  ];
  const followThrough = coachingNotes + actionItems + goals;
  const deliveryCount = new Map(deliveryGroups.map((entry) => [entry.status, entry._count.id]));
  const sent = deliveryCount.get("SENT") ?? 0;
  const failed = deliveryCount.get("FAILED") ?? 0;
  const pending = deliveryCount.get("PENDING") ?? 0;

  return (
    <main className="min-h-full bg-[#f5efe5] px-4 py-6 text-[#2e251d] md:px-8">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <header className="rounded-3xl border border-[#ddcfba] bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#8f5e2c]">Quipsly product operations</p>
              <h1 className="mt-2 font-serif text-4xl font-black">See what people can actually finish.</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#66594a]">
                Canonical workflow activity from Quipsly&apos;s own database, plus privacy-safe product events. Counts are operational activity—not invented cohort conversion percentages.
              </p>
            </div>
            <nav className="flex flex-wrap gap-2 text-sm font-black">
              <Link href="/admin/support" className="rounded-full border border-[#d5c3aa] px-4 py-2">Customer support</Link>
              <a href="https://analytics.google.com/analytics/web/#/p503353241/reports/intelligenthome" target="_blank" rel="noreferrer" className="rounded-full bg-[#3d2f24] px-4 py-2 text-white">Open GA4</a>
            </nav>
          </div>
          <div className="mt-5 flex flex-wrap gap-2" aria-label="Reporting window">
            {WINDOWS.map((window) => <Link key={window} href={`/admin/product-ops?days=${window}`} className={`rounded-full px-4 py-2 text-xs font-black ${window === days ? "bg-[#8f5e2c] text-white" : "border border-[#d5c3aa]"}`}>{window} days</Link>)}
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Summary label="Active accounts" value={activeAccounts} detail={`${newAccounts} new in ${days} days`} tone="good" />
          <Summary label="Suspended accounts" value={suspendedAccounts} detail="Immediate access stops" tone={suspendedAccounts ? "warn" : "neutral"} />
          <Summary label="Email delivery" value={sent} detail={`${failed} failed · ${pending} pending`} tone={failed ? "bad" : "good"} />
          <Summary label="Deletion attention" value={openDeletionRequests} detail="Open or failed requests" tone={openDeletionRequests ? "warn" : "neutral"} />
        </section>

        <section className="rounded-3xl border border-[#ddcfba] bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div><h2 className="font-serif text-2xl font-black">Coaching operating loop</h2><p className="mt-1 text-sm text-[#766757]">Activity created during the selected window.</p></div>
            <ChartNoAxesCombined className="text-[#8f5e2c]" />
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {funnel.map(({ label, count, detail, Icon }) => <article key={label} className="rounded-2xl border border-[#eadfce] bg-[#faf7f1] p-4"><Icon size={18} className="text-[#8f5e2c]" /><div className="mt-3 text-3xl font-black">{count}</div><div className="mt-1 text-xs font-black uppercase tracking-wide text-[#746554]">{label}</div>{detail ? <div className="mt-1 text-xs text-[#887967]">{detail}</div> : null}</article>)}
          </div>
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"><strong>{followThrough} follow-through items:</strong> {coachingNotes} notes · {actionItems} tasks · {goals} goals.</div>
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          <Panel title="Privacy-safe product events" icon={Activity}>
            <p className="text-sm text-[#766757]">{uniqueProductActors.length} distinct signed-in actor(s) emitted app-owned product events. Google Analytics receives only the same fixed vocabulary and redacted route categories after consent.</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {productEventGroups.map((entry) => <div key={entry.eventName} className="flex items-center justify-between rounded-xl border border-[#eadfce] px-3 py-2 text-sm"><span className="capitalize">{productEventLabel(entry.eventName)}</span><strong>{entry._count.id}</strong></div>)}
              {!productEventGroups.length ? <Empty>No product events in this window yet.</Empty> : null}
            </div>
          </Panel>

          <Panel title="Email failures requiring attention" icon={CircleAlert}>
            <div className="grid gap-2">
              {recentDeliveryFailures.map((failure) => <Link key={failure.id} href={`/sessions/${failure.invitation.room.id}`} className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-950"><div className="font-black">{failure.invitation.room.title || "Session invitation"}</div><div className="mt-1 break-all">{failure.recipientEmail}</div><div className="mt-1 text-xs">{failure.errorCode || "delivery-failed"}{failure.errorMessage ? ` · ${failure.errorMessage}` : ""}</div></Link>)}
              {!recentDeliveryFailures.length ? <Empty>No invitation email failures in this window.</Empty> : null}
            </div>
          </Panel>
        </section>
      </div>
    </main>
  );
}

function Summary({ label, value, detail, tone = "neutral" }: { label: string; value: number; detail: string; tone?: "neutral" | "good" | "warn" | "bad" }) {
  const tones = { neutral: "border-[#ddcfba] bg-white", good: "border-emerald-200 bg-emerald-50", warn: "border-amber-200 bg-amber-50", bad: "border-rose-200 bg-rose-50" };
  return <article className={`rounded-2xl border p-5 shadow-sm ${tones[tone]}`}><div className="text-xs font-black uppercase tracking-wide text-[#746554]">{label}</div><div className="mt-2 text-4xl font-black">{value}</div><div className="mt-1 text-xs text-[#766757]">{detail}</div></article>;
}

function Panel({ title, icon: Icon, children }: { title: string; icon: typeof Activity; children: React.ReactNode }) {
  return <section className="rounded-3xl border border-[#ddcfba] bg-white p-6 shadow-sm"><h2 className="flex items-center gap-2 font-serif text-2xl font-black"><Icon size={20} className="text-[#8f5e2c]" />{title}</h2><div className="mt-4">{children}</div></section>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-[#d5c3aa] p-5 text-center text-sm text-[#766757]">{children}</div>;
}
