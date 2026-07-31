#!/usr/bin/env node

import crypto from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

import { resolveRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";

const requireFromQuipsly = createRequire(
  new URL("../apps/quipsly/package.json", import.meta.url),
);
const { PrismaClient } = requireFromQuipsly("@prisma/client");
const { PrismaPg } = requireFromQuipsly("@prisma/adapter-pg");
const { initializeApp, getApps } = requireFromQuipsly("firebase-admin/app");
const { getAuth } = requireFromQuipsly("firebase-admin/auth");

const PROJECT_ID = "quipsly-reef";
const ROOM_ID = "retained-coaching-follow-up-20260731";
const BOOKING_ID = "retained-coaching-booking-20260731";
const NEXT_ROOM_ID = "qa-retained-coaching-next-session-20260807";
const NEXT_BOOKING_ID = "qa-retained-coaching-next-booking-20260807";
const CONTINUITY_WORKSPACE_ID = "qa-retained-coaching-workspace";
const CONTINUITY_WORKSPACE_SLUG = "qa-retained-coaching";
const CONTINUITY_PROJECT_ID = "qa-retained-coaching-engagement";
const CONTINUITY_PROJECT_SLUG = "qa-retained-coaching-engagement";
const COACH_EMAIL = "quipsly-coach-retained-20260731@example.test";
const CLIENT_EMAIL = "quipsly-client-retained-20260731@example.test";
const OUTSIDER_EMAIL = "quipsly-followup-outsider-retained-20260731@example.test";
const COACH_UID = "quipsly-coach-retained-20260731";
const CLIENT_UID = "quipsly-client-retained-20260731";
const OUTSIDER_UID = "quipsly-followup-outsider-retained-20260731";
const CLIENT_SAFE_NOTE_ID = "retained-follow-up-client-safe-note-20260731";
const PRIVATE_NOTE_ID = "retained-follow-up-private-note-20260731";
const SHARED_NOTE_ID = "retained-follow-up-shared-note-20260731";
const TASK_ID = "retained-follow-up-client-task-20260731";
const CANDIDATE_TASK_ID = "retained-follow-up-candidate-task-20260731";
const GOAL_ID = "retained-follow-up-client-goal-20260731";
const KEYCHAIN_SERVICE = "com.quipsly.qa.retained-coaching";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loopbackHost(hostname) {
  return ["localhost", "127.0.0.1", "::1"].includes(hostname);
}

function requireLoopbackOrigin(value, label) {
  const url = new URL(value);
  assert(
    url.protocol === "http:"
      && loopbackHost(url.hostname)
      && !url.username
      && !url.password
      && url.pathname === "/"
      && !url.search
      && !url.hash,
    `${label} must be a credential-free loopback HTTP origin.`,
  );
  return url.origin;
}

function requireLocalDatabase(value) {
  const url = new URL(value);
  assert(
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
    "Retained coaching dogfood refuses non-local databases.",
  );
  return value;
}

function credentialPath(label) {
  return path.join(
    os.tmpdir(),
    `quipsly-retained-coaching-${label}-credentials.json`,
  );
}

function password() {
  return `Qp-${crypto.randomBytes(24).toString("base64url")}!26`;
}

function credentialStore() {
  const value = String(
    process.env.QUIPSLY_RETAINED_COACHING_CREDENTIAL_STORE || "temporary",
  ).trim().toLowerCase();
  assert(
    value === "temporary" || value === "keychain",
    "QUIPSLY_RETAINED_COACHING_CREDENTIAL_STORE must be temporary or keychain.",
  );
  return value;
}

async function upsertFirebaseUser(auth, input) {
  const current = await auth.getUser(input.uid).catch((error) => {
    if (error?.code === "auth/user-not-found") return null;
    throw error;
  });
  if (current) {
    await auth.updateUser(input.uid, {
      email: input.email,
      password: input.password,
      displayName: input.name,
      emailVerified: true,
      disabled: false,
    });
  } else {
    await auth.createUser({
      uid: input.uid,
      email: input.email,
      password: input.password,
      displayName: input.name,
      emailVerified: true,
    });
  }
}

async function main() {
  const baseURL = requireLoopbackOrigin(
    process.env.QUIPSLY_RETAINED_COACHING_BASE_URL
      || "http://127.0.0.1:3012",
    "QUIPSLY_RETAINED_COACHING_BASE_URL",
  );
  requireLoopbackOrigin(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || ""}`,
    "FIREBASE_AUTH_EMULATOR_HOST",
  );
  const databaseURL = requireLocalDatabase(process.env.DATABASE_URL || "");
  const store = credentialStore();
  const credentials = [
    {
      role: "coach",
      uid: COACH_UID,
      email: COACH_EMAIL,
      name: "Quipsly Retained Coach",
      password: store === "temporary" ? password() : null,
      file: credentialPath("coach"),
    },
    {
      role: "client",
      uid: CLIENT_UID,
      email: CLIENT_EMAIL,
      name: "Quipsly Retained Client",
      password: store === "temporary" ? password() : null,
      file: credentialPath("client"),
    },
    {
      role: "outsider",
      uid: OUTSIDER_UID,
      email: OUTSIDER_EMAIL,
      name: "Quipsly Retained Room Producer",
      password: store === "temporary" ? password() : null,
      file: credentialPath("outsider"),
    },
  ];
  for (const identity of credentials) {
    assert(
      /^[^\s@]+@[^\s@]+\.test$/.test(identity.email),
      "Retained coaching identities must use reserved .test email addresses.",
    );
    if (store === "keychain") {
      const resolved = resolveRetainedQAPassword({
        service: KEYCHAIN_SERVICE,
        account: identity.email,
        generate: password,
      });
      identity.password = resolved.password;
      identity.keychainCreated = resolved.created;
    }
    assert(identity.password, `No ${identity.role} QA password was resolved.`);
  }

  if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
  const auth = getAuth();
  await Promise.all(
    credentials.map((identity) => upsertFirebaseUser(auth, identity)),
  );

  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: databaseURL,
      max: 2,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    }),
    log: ["error"],
  });
  try {
    const userByRole = {};
    for (const identity of credentials) {
      userByRole[identity.role] = await prisma.user.upsert({
        where: { primaryEmail: identity.email },
        update: {
          firebaseUid: identity.uid,
          name: identity.name,
          emailVerified: new Date(),
          isActive: true,
        },
        create: {
          primaryEmail: identity.email,
          firebaseUid: identity.uid,
          name: identity.name,
          emailVerified: new Date(),
          isActive: true,
        },
      });
    }

    const scheduledStart = new Date("2026-07-31T16:00:00.000Z");
    const scheduledEnd = new Date("2026-07-31T17:00:00.000Z");
    const nextScheduledStart = new Date("2026-08-07T16:00:00.000Z");
    const nextScheduledEnd = new Date("2026-08-07T17:00:00.000Z");
    const workspace = await prisma.studioWorkspace.upsert({
      where: { slug: CONTINUITY_WORKSPACE_SLUG },
      update: {
        name: "QA Retained · Coaching continuity",
        description: "Private longitudinal coaching acceptance data.",
        ownerLabel: COACH_EMAIL,
        isPrivate: true,
      },
      create: {
        id: CONTINUITY_WORKSPACE_ID,
        slug: CONTINUITY_WORKSPACE_SLUG,
        name: "QA Retained · Coaching continuity",
        description: "Private longitudinal coaching acceptance data.",
        ownerLabel: COACH_EMAIL,
        isPrivate: true,
      },
    });
    const continuityProject = await prisma.studioProject.upsert({
      where: {
        workspaceId_slug: {
          workspaceId: workspace.id,
          slug: CONTINUITY_PROJECT_SLUG,
        },
      },
      update: {
        name: "QA Retained · Coaching engagement",
        description: "Two sequential Sessions proving private continuity without copied work.",
        sourceLabel: "qa-retained-coaching-continuity",
        isPrivate: true,
      },
      create: {
        id: CONTINUITY_PROJECT_ID,
        workspaceId: workspace.id,
        slug: CONTINUITY_PROJECT_SLUG,
        name: "QA Retained · Coaching engagement",
        description: "Two sequential Sessions proving private continuity without copied work.",
        sourceLabel: "qa-retained-coaching-continuity",
        isPrivate: true,
      },
    });
    for (const grant of [
      { email: COACH_EMAIL, role: "OWNER" },
      { email: CLIENT_EMAIL, role: "VIEWER" },
      { email: OUTSIDER_EMAIL, role: "VIEWER" },
    ]) {
      await prisma.studioProjectAccessGrant.upsert({
        where: {
          projectId_email: {
            projectId: continuityProject.id,
            email: grant.email,
          },
        },
        update: {
          role: grant.role,
          status: "ACTIVE",
          createdByUserId: userByRole.coach.id,
          createdByEmail: COACH_EMAIL,
          note: "QA Retained · Coaching continuity rendered-operation access.",
        },
        create: {
          projectId: continuityProject.id,
          email: grant.email,
          role: grant.role,
          status: "ACTIVE",
          createdByUserId: userByRole.coach.id,
          createdByEmail: COACH_EMAIL,
          note: "QA Retained · Coaching continuity rendered-operation access.",
        },
      });
    }
    await prisma.coachingBooking.upsert({
      where: { id: BOOKING_ID },
      update: {
        clientUserId: userByRole.client.id,
        coachUserId: userByRole.coach.id,
        status: "COMPLETED",
        scheduledStart,
        scheduledEnd,
        timezone: "America/Denver",
        paymentPolicy: "FREE",
      },
      create: {
        id: BOOKING_ID,
        clientUserId: userByRole.client.id,
        coachUserId: userByRole.coach.id,
        status: "COMPLETED",
        scheduledStart,
        scheduledEnd,
        timezone: "America/Denver",
        paymentPolicy: "FREE",
      },
    });
    await prisma.callRoom.upsert({
      where: { id: ROOM_ID },
      update: {
        bookingId: BOOKING_ID,
        createdByUserId: userByRole.coach.id,
        projectId: continuityProject.id,
        purpose: "COACHING",
        status: "ENDED",
        title: "Retained coaching follow-up rehearsal",
        scheduledStart,
        scheduledEnd,
        nestSlug: CONTINUITY_PROJECT_SLUG,
        projectSlug: CONTINUITY_PROJECT_SLUG,
      },
      create: {
        id: ROOM_ID,
        bookingId: BOOKING_ID,
        createdByUserId: userByRole.coach.id,
        projectId: continuityProject.id,
        purpose: "COACHING",
        status: "ENDED",
        title: "Retained coaching follow-up rehearsal",
        scheduledStart,
        scheduledEnd,
        nestSlug: CONTINUITY_PROJECT_SLUG,
        projectSlug: CONTINUITY_PROJECT_SLUG,
      },
    });

    const participants = [
      {
        id: `${ROOM_ID}-coach`,
        userId: userByRole.coach.id,
        email: COACH_EMAIL,
        displayName: "Quipsly Retained Coach",
        role: "COACH",
      },
      {
        id: `${ROOM_ID}-client`,
        userId: userByRole.client.id,
        email: CLIENT_EMAIL,
        displayName: "Quipsly Retained Client",
        role: "CLIENT",
      },
      {
        id: `${ROOM_ID}-producer`,
        userId: userByRole.outsider.id,
        email: OUTSIDER_EMAIL,
        displayName: "Quipsly Retained Room Producer",
        role: "PRODUCER",
      },
    ];
    for (const participant of participants) {
      await prisma.callParticipant.upsert({
        where: { id: participant.id },
        update: { roomId: ROOM_ID, ...participant },
        create: { roomId: ROOM_ID, ...participant },
      });
    }

    await prisma.coachingBooking.upsert({
      where: { id: NEXT_BOOKING_ID },
      update: {
        clientUserId: userByRole.client.id,
        coachUserId: userByRole.coach.id,
        status: "CONFIRMED",
        scheduledStart: nextScheduledStart,
        scheduledEnd: nextScheduledEnd,
        timezone: "America/Denver",
        paymentPolicy: "FREE",
      },
      create: {
        id: NEXT_BOOKING_ID,
        clientUserId: userByRole.client.id,
        coachUserId: userByRole.coach.id,
        status: "CONFIRMED",
        scheduledStart: nextScheduledStart,
        scheduledEnd: nextScheduledEnd,
        timezone: "America/Denver",
        paymentPolicy: "FREE",
      },
    });
    await prisma.callRoom.upsert({
      where: { id: NEXT_ROOM_ID },
      update: {
        bookingId: NEXT_BOOKING_ID,
        createdByUserId: userByRole.coach.id,
        projectId: continuityProject.id,
        purpose: "COACHING",
        status: "PLANNED",
        title: "QA Retained · Coaching continuity Session 2",
        scheduledStart: nextScheduledStart,
        scheduledEnd: nextScheduledEnd,
        nestSlug: CONTINUITY_PROJECT_SLUG,
        projectSlug: CONTINUITY_PROJECT_SLUG,
      },
      create: {
        id: NEXT_ROOM_ID,
        bookingId: NEXT_BOOKING_ID,
        createdByUserId: userByRole.coach.id,
        projectId: continuityProject.id,
        purpose: "COACHING",
        status: "PLANNED",
        title: "QA Retained · Coaching continuity Session 2",
        scheduledStart: nextScheduledStart,
        scheduledEnd: nextScheduledEnd,
        nestSlug: CONTINUITY_PROJECT_SLUG,
        projectSlug: CONTINUITY_PROJECT_SLUG,
      },
    });
    for (const participant of participants) {
      await prisma.callParticipant.upsert({
        where: { id: `${NEXT_ROOM_ID}-${participant.role.toLowerCase()}` },
        update: {
          roomId: NEXT_ROOM_ID,
          userId: participant.userId,
          email: participant.email,
          displayName: participant.displayName,
          role: participant.role,
        },
        create: {
          id: `${NEXT_ROOM_ID}-${participant.role.toLowerCase()}`,
          roomId: NEXT_ROOM_ID,
          userId: participant.userId,
          email: participant.email,
          displayName: participant.displayName,
          role: participant.role,
        },
      });
    }

    const notes = [
      {
        id: CLIENT_SAFE_NOTE_ID,
        visibility: "CLIENT_SAFE",
        kind: "FOLLOW_UP",
        title: "Practice evidence",
        body: "Bring one specific example of the new boundary in use.",
      },
      {
        id: PRIVATE_NOTE_ID,
        visibility: "AUTHOR_PRIVATE",
        kind: "SESSION_NOTE",
        title: "Coach-only formulation",
        body: "RETAINED PRIVATE MARKER: never release this formulation.",
      },
      {
        id: SHARED_NOTE_ID,
        visibility: "SESSION_SHARED",
        kind: "SESSION_NOTE",
        title: "Room-shared note",
        body: "RETAINED SHARED MARKER: room visibility is not follow-up consent.",
      },
    ];
    for (const note of notes) {
      await prisma.coachingNote.upsert({
        where: { id: note.id },
        update: {
          roomId: ROOM_ID,
          bookingId: BOOKING_ID,
          authorUserId: userByRole.coach.id,
          ...note,
        },
        create: {
          roomId: ROOM_ID,
          bookingId: BOOKING_ID,
          authorUserId: userByRole.coach.id,
          ...note,
        },
      });
    }

    await prisma.actionItem.upsert({
      where: { id: TASK_ID },
      update: {
        roomId: ROOM_ID,
        bookingId: BOOKING_ID,
        assignedUserId: userByRole.client.id,
        title: "Run one protected rehearsal",
        detail: "Write down what changed and what remained difficult.",
        dueAt: new Date("2026-08-03T18:00:00.000Z"),
        sourceJson: { source: "retained-coaching-follow-up-seed" },
      },
      create: {
        id: TASK_ID,
        roomId: ROOM_ID,
        bookingId: BOOKING_ID,
        assignedUserId: userByRole.client.id,
        title: "Run one protected rehearsal",
        detail: "Write down what changed and what remained difficult.",
        dueAt: new Date("2026-08-03T18:00:00.000Z"),
        sourceJson: { source: "retained-coaching-follow-up-seed" },
      },
    });
    await prisma.actionItem.upsert({
      where: { id: CANDIDATE_TASK_ID },
      update: {
        roomId: ROOM_ID,
        bookingId: BOOKING_ID,
        assignedUserId: userByRole.client.id,
        title: "RETAINED UNREVIEWED MARKER",
        sourceJson: {
          source: "transcript-packet-builder",
          candidate: true,
        },
      },
      create: {
        id: CANDIDATE_TASK_ID,
        roomId: ROOM_ID,
        bookingId: BOOKING_ID,
        assignedUserId: userByRole.client.id,
        title: "RETAINED UNREVIEWED MARKER",
        sourceJson: {
          source: "transcript-packet-builder",
          candidate: true,
        },
      },
    });
    await prisma.goal.upsert({
      where: { id: GOAL_ID },
      update: {
        roomId: ROOM_ID,
        bookingId: BOOKING_ID,
        ownerUserId: userByRole.client.id,
        title: "Use a sustainable boundary",
        description: "Prefer repeatable evidence over a perfect performance.",
        targetAt: new Date("2026-08-14T18:00:00.000Z"),
        sourceJson: { source: "retained-coaching-follow-up-seed" },
      },
      create: {
        id: GOAL_ID,
        roomId: ROOM_ID,
        bookingId: BOOKING_ID,
        ownerUserId: userByRole.client.id,
        title: "Use a sustainable boundary",
        description: "Prefer repeatable evidence over a perfect performance.",
        targetAt: new Date("2026-08-14T18:00:00.000Z"),
        sourceJson: { source: "retained-coaching-follow-up-seed" },
      },
    });

    for (const identity of credentials) {
      if (store === "temporary") {
        await writeFile(
          identity.file,
          JSON.stringify({
            baseURL,
            role: identity.role,
            email: identity.email,
            password: identity.password,
            roomID: ROOM_ID,
          }),
          { mode: 0o600 },
        );
      }
    }

    const outputCount = await prisma.sessionOutput.count({
      where: { roomId: ROOM_ID },
    });
    console.log(
      JSON.stringify(
        {
          ok: true,
          localOnly: true,
          retained: true,
          baseURL,
          roomID: ROOM_ID,
          nextRoomID: NEXT_ROOM_ID,
          bookingID: BOOKING_ID,
          identities: credentials.map((identity) => ({
            role: identity.role,
            email: identity.email,
            uid: identity.uid,
            credentialStore: store,
            credentialFile: store === "temporary" ? identity.file : null,
            keychainService: store === "keychain" ? KEYCHAIN_SERVICE : null,
            keychainItemCreated:
              store === "keychain" ? identity.keychainCreated === true : null,
          })),
          canonicalRecords: {
            projectID: continuityProject.id,
            priorRoomID: ROOM_ID,
            nextRoomID: NEXT_ROOM_ID,
            clientSafeNoteID: CLIENT_SAFE_NOTE_ID,
            privateNoteID: PRIVATE_NOTE_ID,
            sharedNoteID: SHARED_NOTE_ID,
            taskID: TASK_ID,
            candidateTaskID: CANDIDATE_TASK_ID,
            goalID: GOAL_ID,
          },
          existingOutputCount: outputCount,
          secretsPrinted: false,
          externalSideEffects: false,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

await main();
