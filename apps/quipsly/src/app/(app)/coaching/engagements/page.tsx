import Link from "next/link";
import { LockKeyhole, Plus, UsersRound } from "lucide-react";
import { chooseQuipslyCoachingClientPriority } from "@high-ground/quipsly-domain/coaching-client-priority";

import {
  CoachingClientPortfolio,
  type CoachingClientPortfolioItem,
} from "@/components/coaching-client-portfolio";
import { getPrismaClient } from "@/lib/prisma";
import { coachingEngagementActorAccessWhere } from "@/lib/server/coaching-engagement";
import { getQuipslySession } from "@/lib/server/quipsly-session";

export const dynamic = "force-dynamic";

function personLabel(person: { name: string | null; primaryEmail: string }) {
  return person.name || person.primaryEmail;
}

function roomTime(room: {
  scheduledStart: Date | null;
  openedAt: Date | null;
  recordingStartedAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
}) {
  return (
    room.scheduledStart ??
    room.openedAt ??
    room.recordingStartedAt ??
    room.endedAt ??
    room.createdAt
  ).getTime();
}

export default async function CoachingEngagementsPage() {
  const session = await getQuipslySession();
  if (!session?.user) {
    return (
      <main className="min-h-full px-6 py-12">
        <section className="mx-auto max-w-3xl rounded-3xl border border-[#ead8b4] bg-[#fffaf0] p-8">
          <LockKeyhole className="text-violet-800" />
          <h1 className="mt-4 font-serif text-4xl font-black text-[#3d3122]">
            Your coaching work is private.
          </h1>
          <p className="mt-3 text-[#765f40]">
            Sign in to open only the client relationships, Sessions, and
            follow-through shared with your account.
          </p>
          <Link
            href="/login?callbackUrl=%2Fcoaching%2Fengagements"
            className="mt-6 inline-flex rounded-full bg-violet-800 px-5 py-3 font-black text-white"
          >
            Sign in
          </Link>
        </section>
      </main>
    );
  }

  const prisma = getPrismaClient();
  const coachProfile = session.user.isStaff
    ? null
    : await prisma.coachProfile.findFirst({
        where: { userId: session.user.id, isActive: true },
        select: { id: true },
      });
  const engagements = await prisma.coachingEngagement.findMany({
    where: coachingEngagementActorAccessWhere(session.user, "read"),
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    take: 100,
    select: {
      id: true,
      title: true,
      status: true,
      updatedAt: true,
      members: {
        where: { status: "ACTIVE" },
        orderBy: { joinedAt: "asc" },
        select: {
          id: true,
          userId: true,
          role: true,
          user: { select: { name: true, primaryEmail: true } },
        },
      },
      callRooms: {
        orderBy: [{ scheduledStart: "desc" }, { createdAt: "desc" }],
        take: 30,
        select: {
          id: true,
          title: true,
          status: true,
          scheduledStart: true,
          openedAt: true,
          recordingStartedAt: true,
          endedAt: true,
          createdAt: true,
          transcriptJobs: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { status: true },
          },
          outputs: {
            orderBy: { createdAt: "desc" },
            take: 10,
            select: { status: true },
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
        take: 101,
        select: { id: true },
      },
      actionItems: {
        where: {
          status: "OPEN",
          sourceJson: { path: ["visibility"], equals: "engagement-shared" },
        },
        take: 101,
        select: { id: true, dueAt: true },
      },
      goals: {
        where: {
          status: "ACTIVE",
          sourceJson: { path: ["visibility"], equals: "engagement-shared" },
        },
        take: 101,
        select: { id: true },
      },
    },
  });

  const now = Date.now();
  const canSchedule = Boolean(
    session.user.isStaff ||
    coachProfile ||
    engagements.some((engagement) =>
      engagement.members.some(
        (member) =>
          member.userId === session.user.id && member.role === "COACH",
      ),
    ),
  );
  const clients: CoachingClientPortfolioItem[] = engagements.map(
    (engagement) => {
      const liveRoom = engagement.callRooms.find((room) =>
        ["OPEN", "RECORDING"].includes(room.status),
      );
      const upcomingRoom = engagement.callRooms
        .filter(
          (room) =>
            room.status === "PLANNED" &&
            room.scheduledStart &&
            room.scheduledStart.getTime() >= now,
        )
        .sort((left, right) => roomTime(left) - roomTime(right))[0];
      const nextRoom = liveRoom ?? upcomingRoom ?? null;
      const lastRoom =
        engagement.callRooms
          .filter((room) => room.status === "ENDED")
          .sort((left, right) => roomTime(right) - roomTime(left))[0] ?? null;
      const followUpRooms = engagement.callRooms.filter(
        (room) =>
          room.status === "ENDED" &&
          room._count.recordingAssets > 0 &&
          !room.outputs.some((output) => output.status === "RELEASED"),
      );
      const overdueTaskCount = engagement.actionItems.filter(
        (item) => item.dueAt && item.dueAt.getTime() < now,
      ).length;
      const primaryClient =
        engagement.members.find((member) => member.role === "CLIENT") ??
        engagement.members.find((member) => member.role !== "COACH") ??
        engagement.members[0] ??
        null;
      const actorMembership = engagement.members.find(
        (member) => member.userId === session.user.id,
      );
      const coachView = Boolean(
        session.user.isStaff || actorMembership?.role === "COACH",
      );
      const priority = chooseQuipslyCoachingClientPriority({
        now: new Date(now).toISOString(),
        viewerRole: coachView
          ? "COACH"
          : actorMembership?.role === "CLIENT"
            ? "CLIENT"
            : actorMembership?.role === "SUPPORT"
              ? "SUPPORT"
              : "OBSERVER",
        overdueCommitmentCount: overdueTaskCount,
        rooms: engagement.callRooms.map((room) => ({
          id: room.id,
          title: room.title,
          status: room.status,
          scheduledStart: room.scheduledStart?.toISOString() ?? null,
          endedAt: room.endedAt?.toISOString() ?? null,
          createdAt: room.createdAt.toISOString(),
          recordingCount: room._count.recordingAssets,
          transcriptStatus: room.transcriptJobs[0]?.status ?? null,
          followUpReleased: room.outputs.some(
            (output) => output.status === "RELEASED",
          ),
        })),
      });
      const priorityRoom = priority.roomId
        ? (engagement.callRooms.find((room) => room.id === priority.roomId) ??
          null)
        : null;
      const prioritizedSessionRoom =
        priorityRoom &&
        ["PLANNED", "OPEN", "RECORDING"].includes(priorityRoom.status)
          ? priorityRoom
          : null;
      const displayedNextRoom = prioritizedSessionRoom ?? nextRoom;
      const relationshipHref = `/coaching/engagements/${encodeURIComponent(engagement.id)}`;
      const sessionHref = (mode: "live" | "outputs" | "transcript") =>
        priorityRoom
          ? `/sessions/${encodeURIComponent(priorityRoom.id)}?mode=${mode}`
          : relationshipHref;
      const sessionTitle = priorityRoom?.title || "Coaching Session";

      const nextAction: CoachingClientPortfolioItem["nextAction"] = (() => {
        switch (priority.kind) {
          case "JOIN_LIVE_SESSION":
            return {
              label: "Join now",
              detail: `${sessionTitle} is open. Enter the familiar lobby, check devices, and join.`,
              href: sessionHref("live"),
              tone: priority.tone,
            };
          case "REVIEW_LATE_SESSION":
            return {
              label: "Open session",
              detail:
                "This planned Session’s time has passed. Open it or reschedule before creating more work.",
              href: sessionHref("live"),
              tone: priority.tone,
            };
          case "PREPARE_UPCOMING_SESSION":
            return {
              label: "Prepare session",
              detail: `${sessionTitle} is next. Review the client space, invitation, devices, and agenda.`,
              href: sessionHref("live"),
              tone: priority.tone,
            };
          case "REVIEW_COACH_FOLLOW_UP":
            return {
              label: "Review follow-up",
              detail:
                priorityRoom?.transcriptJobs[0]?.status === "COMPLETED"
                  ? "The recording and transcript are ready for corrections, notes, tasks, goals, and client-safe sharing."
                  : "The recording is protected. Review its transcript status and prepare the useful follow-up.",
              href: sessionHref("transcript"),
              tone: priority.tone,
            };
          case "VIEW_RELEASED_FOLLOW_UP":
            return {
              label: "View follow-up",
              detail:
                "Your coach shared reviewed recording, transcript, notes, goals, or commitments from this Session.",
              href: sessionHref("outputs"),
              tone: priority.tone,
            };
          case "PREPARE_UNSCHEDULED_SESSION":
            return {
              label: "Prepare session",
              detail:
                "This Session still needs a time. Open it to finish the plan and send a clear invitation.",
              href: sessionHref("live"),
              tone: priority.tone,
            };
          case "REVIEW_OVERDUE_COMMITMENTS":
            return {
              label: "Review commitments",
              detail: `${overdueTaskCount} client ${overdueTaskCount === 1 ? "commitment is" : "commitments are"} past due. Review together before assigning anything new.`,
              href: relationshipHref,
              tone: priority.tone,
            };
          case "OPEN_RELATIONSHIP":
            return {
              label: "Open client space",
              detail:
                "Review shared notes, active goals, commitments, and conversation—or schedule the next Session.",
              href: relationshipHref,
              tone: priority.tone,
            };
        }
      })();

      return {
        id: engagement.id,
        title: engagement.title,
        status: engagement.status,
        people: engagement.members.map((member) => ({
          label: personLabel(member.user),
          role: member.role,
        })),
        primaryClientLabel: primaryClient
          ? personLabel(primaryClient.user)
          : engagement.title,
        nextSession: displayedNextRoom
          ? {
              id: displayedNextRoom.id,
              title: displayedNextRoom.title || "Coaching Session",
              scheduledStart:
                displayedNextRoom.scheduledStart?.toISOString() ?? null,
              status: displayedNextRoom.status,
            }
          : null,
        lastSession: lastRoom
          ? {
              id: lastRoom.id,
              title: lastRoom.title || "Coaching Session",
              scheduledStart:
                lastRoom.scheduledStart?.toISOString() ??
                lastRoom.endedAt?.toISOString() ??
                null,
            }
          : null,
        openTaskCount: engagement.actionItems.length,
        overdueTaskCount,
        activeGoalCount: engagement.goals.length,
        visibleNoteCount: engagement.notes.length,
        followUpCount: coachView ? followUpRooms.length : 0,
        nextAction,
        updatedAt: engagement.updatedAt.toISOString(),
      };
    },
  );

  clients.sort((left, right) => {
    const toneOrder = { live: 0, attention: 1, upcoming: 2, steady: 3 };
    const toneDifference =
      toneOrder[left.nextAction.tone] - toneOrder[right.nextAction.tone];
    if (toneDifference) return toneDifference;
    const leftStart = Date.parse(left.nextSession?.scheduledStart ?? "");
    const rightStart = Date.parse(right.nextSession?.scheduledStart ?? "");
    if (Number.isFinite(leftStart) && Number.isFinite(rightStart))
      return leftStart - rightStart;
    return right.updatedAt.localeCompare(left.updatedAt);
  });

  return (
    <main className="min-h-full bg-[#f5efe4] px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-[92rem]">
        <header className="rounded-[2rem] border border-[#dfcfb4] bg-[#fffdf8] p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-800">
                Coaching · Clients
              </p>
              <h1 className="mt-2 font-serif text-4xl font-black text-[#34291d] sm:text-5xl">
                Know who needs you next.
              </h1>
              <p className="mt-3 max-w-3xl font-semibold leading-7 text-[#765f40]">
                Each private client space keeps Sessions, conversation, notes,
                goals, commitments, recordings, transcripts, and reviewed
                follow-up together across the whole coaching relationship.
              </p>
            </div>
            {canSchedule ? (
              <Link
                href="/coaching#create-appointment"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-violet-800 px-5 text-sm font-black text-white shadow-sm transition hover:bg-violet-900"
              >
                <Plus size={17} aria-hidden="true" /> Add client & session
              </Link>
            ) : null}
          </div>
        </header>

        <div className="mt-6">
          <CoachingClientPortfolio
            clients={clients}
            asOf={new Date(now).toISOString()}
          />
        </div>

        <p className="mt-6 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold leading-6 text-emerald-950">
          <UsersRound size={18} className="shrink-0" aria-hidden="true" />
          This portfolio is a projection over canonical private engagements. It
          does not copy client data, infer access, or expose the surrounding
          Nest.
        </p>
      </div>
    </main>
  );
}
