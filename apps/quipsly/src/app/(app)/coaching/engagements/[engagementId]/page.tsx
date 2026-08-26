import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  LayoutDashboard,
  LockKeyhole,
  UsersRound,
  Video,
} from "lucide-react";
import { notFound } from "next/navigation";

import { CollaborationThread } from "@/components/session-thread";
import { CoachingEngagementMemberManager } from "@/components/coaching-engagement-member-manager";
import {
  CoachingEngagementWorkspace,
  type CoachingEngagementWorkEntry,
} from "@/components/coaching-engagement-workspace";
import {
  CoachingRelationshipOverview,
  type CoachingRelationshipOverviewItem,
} from "@/components/coaching-relationship-overview";
import { getPrismaClient } from "@/lib/prisma";
import { coachingEngagementAccessWhere } from "@/lib/server/coaching-engagement";
import { getQuipslySession } from "@/lib/server/quipsly-session";

export const dynamic = "force-dynamic";

function personLabel(person: { name: string | null; primaryEmail: string }) {
  return person.name || person.primaryEmail;
}

export default async function CoachingEngagementPage({
  params,
}: {
  params: Promise<{ engagementId: string }>;
}) {
  const { engagementId } = await params;
  const session = await getQuipslySession();
  if (!session?.user) {
    return (
      <main className="min-h-full px-6 py-12">
        <section className="mx-auto max-w-3xl rounded-3xl border border-[#ead8b4] bg-[#fffaf0] p-8">
          <LockKeyhole className="text-violet-800" />
          <h1 className="mt-4 font-serif text-4xl font-black text-[#3d3122]">
            Your coaching space is private.
          </h1>
          <Link
            href={`/login?callbackUrl=${encodeURIComponent(`/coaching/engagements/${engagementId}`)}`}
            className="mt-6 inline-flex rounded-full bg-violet-800 px-5 py-3 font-black text-white"
          >
            Sign in
          </Link>
        </section>
      </main>
    );
  }
  const prisma = getPrismaClient();
  const engagement = await prisma.coachingEngagement.findFirst({
    where: coachingEngagementAccessWhere(engagementId, session.user, "read"),
    select: {
      id: true,
      title: true,
      status: true,
      primaryClientUserId: true,
      primaryCoachUserId: true,
      project: { select: { id: true, slug: true, name: true } },
      members: {
        where: { status: "ACTIVE" },
        orderBy: { joinedAt: "asc" },
        select: {
          role: true,
          userId: true,
          user: { select: { name: true, primaryEmail: true } },
        },
      },
      callRooms: {
        orderBy: [{ scheduledStart: "desc" }, { createdAt: "desc" }],
        take: 100,
        select: {
          id: true,
          title: true,
          purpose: true,
          status: true,
          scheduledStart: true,
          scheduledEnd: true,
          endedAt: true,
          createdAt: true,
          transcriptJobs: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { status: true },
          },
          outputs: {
            where: { status: "RELEASED" },
            take: 1,
            select: { id: true },
          },
          _count: { select: { recordingAssets: true } },
        },
      },
      notes: {
        where: {
          OR: [
            { visibility: { in: ["SESSION_SHARED", "CLIENT_SAFE"] } },
            { authorUserId: session.user.id },
          ],
        },
        orderBy: { updatedAt: "desc" },
        take: 100,
        select: {
          id: true,
          title: true,
          body: true,
          visibility: true,
          authorUserId: true,
          createdAt: true,
          updatedAt: true,
          authorUser: { select: { name: true, primaryEmail: true } },
        },
      },
      actionItems: {
        where: {
          sourceJson: { path: ["visibility"], equals: "engagement-shared" },
        },
        orderBy: [{ status: "asc" }, { dueAt: "asc" }],
        take: 100,
        select: {
          id: true,
          title: true,
          detail: true,
          status: true,
          dueAt: true,
          assignedUserId: true,
          createdAt: true,
          updatedAt: true,
          assignedUser: { select: { name: true, primaryEmail: true } },
        },
      },
      goals: {
        where: {
          sourceJson: { path: ["visibility"], equals: "engagement-shared" },
        },
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
        take: 100,
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          targetAt: true,
          ownerUserId: true,
          createdAt: true,
          updatedAt: true,
          owner: { select: { name: true, primaryEmail: true } },
        },
      },
    },
  });
  if (!engagement) notFound();
  const ownMembership = engagement.members.find(
    (member) => member.userId === session.user.id,
  );
  const viewerRole = session.user.isStaff
    ? "COACH"
    : ownMembership?.role || "OBSERVER";
  const canPost = Boolean(
    session.user.isStaff ||
    (ownMembership && ownMembership.role !== "OBSERVER"),
  );
  const canSchedule = session.user.isStaff || ownMembership?.role === "COACH";
  const canManage = Boolean(
    await prisma.coachingEngagement.findFirst({
      where: coachingEngagementAccessWhere(
        engagementId,
        session.user,
        "manage",
      ),
      select: { id: true },
    }),
  );
  const workEntries: CoachingEngagementWorkEntry[] = [
    ...engagement.notes.map((note) => ({
      id: note.id,
      kind: "NOTE" as const,
      title: note.title,
      body: note.body,
      status: null,
      owner: note.authorUser
        ? { id: note.authorUserId!, label: personLabel(note.authorUser) }
        : null,
      visibility:
        note.visibility === "AUTHOR_PRIVATE"
          ? ("PRIVATE" as const)
          : ("SHARED" as const),
      dueAt: null,
      canEdit: note.authorUserId === session.user.id,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
    })),
    ...engagement.actionItems.map((task) => ({
      id: task.id,
      kind: "TASK" as const,
      title: task.title,
      body: task.detail,
      status: String(task.status),
      owner: task.assignedUser
        ? { id: task.assignedUserId!, label: personLabel(task.assignedUser) }
        : null,
      visibility: "SHARED" as const,
      dueAt: task.dueAt?.toISOString() ?? null,
      canEdit: canPost,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    })),
    ...engagement.goals.map((goal) => ({
      id: goal.id,
      kind: "GOAL" as const,
      title: goal.title,
      body: goal.description,
      status: String(goal.status),
      owner: { id: goal.ownerUserId, label: personLabel(goal.owner) },
      visibility: "SHARED" as const,
      dueAt: goal.targetAt?.toISOString() ?? null,
      canEdit: canPost,
      createdAt: goal.createdAt.toISOString(),
      updatedAt: goal.updatedAt.toISOString(),
    })),
  ].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  const now = Date.now();
  const liveRoom = engagement.callRooms.find((room) =>
    ["OPEN", "RECORDING"].includes(room.status),
  );
  const lateRoom = engagement.callRooms
    .filter(
      (room) =>
        room.status === "PLANNED" &&
        room.scheduledStart &&
        room.scheduledStart.getTime() < now,
    )
    .sort(
      (left, right) =>
        (right.scheduledStart?.getTime() || 0) -
        (left.scheduledStart?.getTime() || 0),
    )[0];
  const upcomingRoom = engagement.callRooms
    .filter(
      (room) =>
        room.status === "PLANNED" &&
        room.scheduledStart &&
        room.scheduledStart.getTime() >= now,
    )
    .sort(
      (left, right) =>
        (left.scheduledStart?.getTime() || 0) -
        (right.scheduledStart?.getTime() || 0),
    )[0];
  const nextRoom = liveRoom || lateRoom || upcomingRoom || null;
  const lastRoom = engagement.callRooms
    .filter((room) => room.status === "ENDED")
    .sort(
      (left, right) =>
        (right.endedAt ?? right.scheduledStart ?? right.createdAt).getTime() -
        (left.endedAt ?? left.scheduledStart ?? left.createdAt).getTime(),
    )[0];
  const overview: CoachingRelationshipOverviewItem = {
    nextSession: nextRoom
      ? {
          id: nextRoom.id,
          title: nextRoom.title || "Coaching Session",
          startsAt: nextRoom.scheduledStart?.toISOString() ?? null,
          status:
            nextRoom === lateRoom && nextRoom.status === "PLANNED"
              ? "PLANNED_LATE"
              : nextRoom.status,
        }
      : null,
    lastSession: lastRoom
      ? {
          id: lastRoom.id,
          title: lastRoom.title || "Coaching Session",
          startsAt: (
            lastRoom.scheduledStart ??
            lastRoom.endedAt ??
            lastRoom.createdAt
          ).toISOString(),
          recordingCount: lastRoom._count.recordingAssets,
          transcriptStatus: lastRoom.transcriptJobs[0]?.status ?? null,
          followUpReleased: lastRoom.outputs.length > 0,
        }
      : null,
    tasks: engagement.actionItems
      .filter((task) => task.status === "OPEN")
      .map((task) => ({
        id: task.id,
        title: task.title,
        dueAt: task.dueAt?.toISOString() ?? null,
        ownerLabel: task.assignedUser ? personLabel(task.assignedUser) : null,
        overdue: Boolean(task.dueAt && task.dueAt.getTime() < now),
      })),
    goals: engagement.goals
      .filter((goal) => goal.status === "ACTIVE")
      .map((goal) => ({
        id: goal.id,
        title: goal.title,
        targetAt: goal.targetAt?.toISOString() ?? null,
        ownerLabel: personLabel(goal.owner),
      })),
    recentNotes: engagement.notes.map((note) => ({
      id: note.id,
      title: note.title || "Note",
      body: note.body,
      private: note.visibility === "AUTHOR_PRIVATE",
    })),
    openTaskCount: engagement.actionItems.filter(
      (task) => task.status === "OPEN",
    ).length,
    overdueTaskCount: engagement.actionItems.filter(
      (task) =>
        task.status === "OPEN" && task.dueAt && task.dueAt.getTime() < now,
    ).length,
    activeGoalCount: engagement.goals.filter((goal) => goal.status === "ACTIVE")
      .length,
    sharedNoteCount: engagement.notes.filter(
      (note) => note.visibility !== "AUTHOR_PRIVATE",
    ).length,
    privateNoteCount: engagement.notes.filter(
      (note) => note.visibility === "AUTHOR_PRIVATE",
    ).length,
  };

  return (
    <main className="min-h-full bg-[#f5efe4] px-5 py-8 lg:px-10">
      <div className="mx-auto max-w-[92rem]">
        <Link
          href="/coaching/engagements"
          className="inline-flex items-center gap-2 text-sm font-black text-[#765f40]"
        >
          <ArrowLeft size={16} /> All clients
        </Link>
        <header className="mt-5 rounded-[2rem] border border-[#dfcfb4] bg-[#fffdf8] p-7 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-800">
                Coaching ·{" "}
                {viewerRole === "COACH" ? "Client space" : "My coaching space"}
              </p>
              <h1 className="mt-2 font-serif text-5xl font-black text-[#34291d]">
                {engagement.title}
              </h1>
              <p className="mt-4 flex flex-wrap items-center gap-3 text-sm font-bold text-[#765f40]">
                <UsersRound size={17} />{" "}
                {engagement.members
                  .map(
                    (member) =>
                      `${personLabel(member.user)} · ${member.role.toLowerCase()}`,
                  )
                  .join("  /  ")}
              </p>
            </div>
            <p className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-black text-emerald-900">
              <LockKeyhole size={15} aria-hidden="true" /> Private to the people
              shown here
            </p>
          </div>
        </header>
        <div className="mt-6">
          <CoachingRelationshipOverview
            overview={overview}
            canSchedule={canSchedule}
          />
        </div>
        {canManage ? (
          <div className="mt-6">
            <CoachingEngagementMemberManager engagementId={engagement.id} />
          </div>
        ) : null}
        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(22rem,0.8fr)]">
          <div className="space-y-6">
            <section className="rounded-[1.75rem] border border-[#dfcfb4] bg-[#fffdf8] p-6">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-800">
                Your history
              </p>
              <h2 className="mt-2 flex items-center gap-2 font-serif text-3xl font-black text-[#3d3122]">
                <CalendarDays size={22} /> Session history
              </h2>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#765f40]">
                Every call returns to the same client space, so the recording,
                transcript, follow-up, and work between Sessions stay easy to
                find.
              </p>
              {engagement.callRooms.length ? (
                <div className="mt-5 grid gap-3">
                  {engagement.callRooms.map((room) => {
                    const roomIsLive = ["OPEN", "RECORDING"].includes(
                      room.status,
                    );
                    const roomEnded = room.status === "ENDED";
                    const transcriptReady =
                      room.transcriptJobs[0]?.status === "COMPLETED";
                    const primaryHref = roomEnded
                      ? `/sessions/${encodeURIComponent(room.id)}${transcriptReady ? "?mode=transcript" : ""}`
                      : roomIsLive || room.status === "PLANNED"
                        ? `/sessions/${encodeURIComponent(room.id)}?mode=live`
                        : `/sessions/${encodeURIComponent(room.id)}`;
                    const primaryLabel = roomIsLive
                      ? "Join session"
                      : room.status === "PLANNED"
                        ? "Prepare session"
                        : roomEnded
                          ? transcriptReady
                            ? "Review transcript"
                            : "Review session"
                          : "Session details";
                    return (
                      <article
                        key={room.id}
                        className="rounded-2xl border border-[#eadfc9] bg-white p-4 transition hover:border-violet-300"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <p className="font-black text-[#3d3122]">
                              {room.title || "Coaching Session"}
                            </p>
                            <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-[#8a7354]">
                              {room.scheduledStart
                                ? new Intl.DateTimeFormat("en", {
                                    dateStyle: "medium",
                                    timeStyle: "short",
                                  }).format(room.scheduledStart)
                                : "Time not set"}
                            </p>
                          </div>
                          <span className="rounded-full bg-[#f0e7d8] px-3 py-1 text-[10px] font-black uppercase tracking-wide text-[#765f40]">
                            {room.status.toLowerCase()}
                          </span>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Link
                            href={primaryHref}
                            className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 py-2 text-xs font-black uppercase tracking-wide text-white ${roomIsLive ? "bg-rose-700" : "bg-violet-800"}`}
                          >
                            {roomIsLive || room.status === "PLANNED" ? (
                              <Video size={15} aria-hidden="true" />
                            ) : (
                              <LayoutDashboard size={15} aria-hidden="true" />
                            )}
                            {primaryLabel}
                          </Link>
                          {roomEnded && transcriptReady ? (
                            <Link
                              href={`/sessions/${encodeURIComponent(room.id)}?mode=outputs`}
                              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#d8c7a7] px-4 py-2 text-xs font-black uppercase tracking-wide text-[#5b472f]"
                            >
                              <LayoutDashboard size={15} aria-hidden="true" />
                              Follow-up
                            </Link>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-4 text-[#765f40]">
                  No Session has been attached yet.
                </p>
              )}
            </section>
            <CoachingEngagementWorkspace
              engagementId={engagement.id}
              initialEntries={workEntries}
              members={engagement.members.map((member) => ({
                id: member.userId,
                label: personLabel(member.user),
                role: member.role,
              }))}
              currentUserId={session.user.id}
              canWrite={canPost}
            />
          </div>
          <div id="relationship-conversation">
            <CollaborationThread
              projectSlug={engagement.project.slug}
              threadKey={`engagement:${engagement.id}`}
              collaborationTitle={engagement.title}
              heading="Conversation"
              clientSurface="engagement-room-web"
              canPost={canPost}
              scopeLabel="Across this coaching relationship"
              scopeDescription="Use this conversation between calls. Messages about one specific Session remain with that Session."
            />
          </div>
        </div>
      </div>
    </main>
  );
}
