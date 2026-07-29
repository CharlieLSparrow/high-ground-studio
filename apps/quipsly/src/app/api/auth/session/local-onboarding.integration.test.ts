/** @jest-environment node */

import { randomUUID } from "node:crypto";

import { getPrismaClient } from "@/lib/prisma";

const runLocalAuthSmoke =
  process.env.QUIPSLY_LOCAL_AUTH_SMOKE === "1" ? describe : describe.skip;

if (process.env.QUIPSLY_LOCAL_AUTH_SMOKE === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL) {
    throw new Error(
      "QUIPSLY_LOCAL_DATABASE_URL is required for the local auth onboarding smoke.",
    );
  }
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

type JsonRecord = Record<string, unknown>;

function assertLoopbackOrigin(value: string, label: string) {
  const url = new URL(value);
  const isLoopback =
    url.hostname === "127.0.0.1" || url.hostname === "localhost";

  expect(url.protocol).toBe("http:");
  expect(isLoopback).toBe(true);
  expect(url.username).toBe("");
  expect(url.password).toBe("");
  expect(url.pathname).toBe("/");
  expect(url.search).toBe("");
  expect(url.hash).toBe("");

  if (!isLoopback) {
    throw new Error(`${label} must be a loopback HTTP origin.`);
  }

  return url.origin;
}

async function readJson(response: Response, label: string) {
  const text = await response.text();
  let body: JsonRecord;
  try {
    body = JSON.parse(text) as JsonRecord;
  } catch {
    throw new Error(
      `${label} returned non-JSON HTTP ${response.status}: ${text.slice(0, 240)}`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `${label} returned HTTP ${response.status}: ${text.slice(0, 240)}`,
    );
  }

  return body;
}

function stringField(body: JsonRecord, key: string, label: string) {
  const value = body[key];
  if (typeof value !== "string" || !value) {
    throw new Error(`${label} did not return ${key}.`);
  }
  return value;
}

function parseSessionCookie(response: Response) {
  const setCookie = response.headers.get("set-cookie") ?? "";
  const match = setCookie.match(/(?:^|,\s*)(session=[^;,\s]+)/i);
  if (!match?.[1]) throw new Error("Quipsly did not set its session cookie.");
  return match[1];
}

function expectSessionCookieCleared(response: Response) {
  const setCookie = response.headers.get("set-cookie") ?? "";
  expect(setCookie).toMatch(
    /(?:^|,\s*)session=(?:deleted)?;.*(?:max-age=0|expires=)/i,
  );
}

runLocalAuthSmoke("local verified-auth onboarding", () => {
  jest.setTimeout(60_000);

  it("operates the signed-in Nest path and removes its disposable state", async () => {
    const nestOrigin = assertLoopbackOrigin(
      process.env.QUIPSLY_LOCAL_NEST_URL ?? "http://127.0.0.1:3012",
      "QUIPSLY_LOCAL_NEST_URL",
    );
    const authOrigin = assertLoopbackOrigin(
      process.env.QUIPSLY_LOCAL_FIREBASE_AUTH_URL ??
        "http://127.0.0.1:9099",
      "QUIPSLY_LOCAL_FIREBASE_AUTH_URL",
    );
    const firebaseProject =
      process.env.QUIPSLY_LOCAL_FIREBASE_PROJECT ?? "quipsly-reef";
    const firebaseApiKey =
      process.env.QUIPSLY_LOCAL_FIREBASE_API_KEY ?? "local-emulator-key";
    const identityToolkit = `${authOrigin}/identitytoolkit.googleapis.com`;
    const nonce = randomUUID().replaceAll("-", "").slice(0, 16);
    const email = `quipsly-local-auth-${nonce}@example.test`;
    const password = `Local-only-${nonce}!`;
    const expectedHomeSlug = `home-${email.replace("@", "-at-").replace(".", "-")}`;
    const prisma = getPrismaClient();

    let firebaseIdToken = "";
    let firebaseIdentityDeleted = false;
    let sessionCookie = "";
    let callRoomId = "";
    const quickEntryRequestId = randomUUID();
    const quickEntryTaskId = `mobile-task-${quickEntryRequestId}`;
    const quickEntryTitle = `Local iPhone follow-through ${nonce}`;
    const quickEntryTagLabel = `Local proof ${nonce}`;

    const firebasePost = async (
      route: string,
      payload: JsonRecord,
      label: string,
    ) =>
      readJson(
        await fetch(
          `${identityToolkit}/v1/${route}?key=${encodeURIComponent(firebaseApiKey)}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          },
        ),
        label,
      );

    try {
      const signUp = await firebasePost(
        "accounts:signUp",
        { email, password, returnSecureToken: true },
        "Firebase sign-up",
      );
      firebaseIdToken = stringField(signUp, "idToken", "Firebase sign-up");

      await firebasePost(
        "accounts:sendOobCode",
        { requestType: "VERIFY_EMAIL", idToken: firebaseIdToken },
        "Firebase verification request",
      );

      const oobResponse = await fetch(
        `${authOrigin}/emulator/v1/projects/${encodeURIComponent(firebaseProject)}/oobCodes`,
      );
      const oobBody = await readJson(
        oobResponse,
        "Firebase emulator OOB lookup",
      );
      const oobCodes = Array.isArray(oobBody.oobCodes)
        ? (oobBody.oobCodes as JsonRecord[])
        : [];
      const verification = oobCodes.find(
        (entry) =>
          entry.email === email && entry.requestType === "VERIFY_EMAIL",
      );
      if (!verification) {
        throw new Error(
          "Firebase emulator did not return the exact disposable email verification code.",
        );
      }

      await firebasePost(
        "accounts:update",
        {
          oobCode: stringField(
            verification,
            "oobCode",
            "Firebase verification lookup",
          ),
        },
        "Firebase email verification",
      );

      const signIn = await firebasePost(
        "accounts:signInWithPassword",
        { email, password, returnSecureToken: true },
        "Firebase verified sign-in",
      );
      firebaseIdToken = stringField(
        signIn,
        "idToken",
        "Firebase verified sign-in",
      );

      const sessionStarts = await Promise.all(
        Array.from({ length: 4 }, () =>
          fetch(`${nestOrigin}/api/auth/session`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ idToken: firebaseIdToken }),
          }),
        ),
      );
      const [sessionStart, ...concurrentSessionStarts] = sessionStarts;
      if (!sessionStart) {
        throw new Error("Quipsly did not return a primary session response.");
      }
      const sessionBody = await readJson(
        sessionStart.clone(),
        "Quipsly session creation",
      );
      sessionCookie = parseSessionCookie(sessionStart);
      for (const [index, concurrentSessionStart] of
        concurrentSessionStarts.entries()) {
        const concurrentSessionBody = await readJson(
          concurrentSessionStart,
          `Concurrent Quipsly session creation ${index + 1}`,
        );
        expect((concurrentSessionBody.homeNest as JsonRecord)?.slug).toBe(
          expectedHomeSlug,
        );
      }

      expect((sessionBody.user as JsonRecord)?.email).toBe(email);
      expect((sessionBody.onboarding as JsonRecord)?.freePlanSlug).toBe(
        "quipsly-free",
      );
      expect(
        (sessionBody.onboarding as JsonRecord)?.freeMembershipStatus,
      ).toBe("ACTIVE");
      expect((sessionBody.homeNest as JsonRecord)?.slug).toBe(
        expectedHomeSlug,
      );

      const [actor, homeProject] = await Promise.all([
        prisma.user.findUniqueOrThrow({
          where: { primaryEmail: email },
          select: { id: true },
        }),
        prisma.studioProject.findFirstOrThrow({
          where: {
            slug: expectedHomeSlug,
            sourceLabel: "nest-kind:home",
          },
          select: { id: true },
        }),
      ]);
      const [activeStarterMemberships, homeProjects, inboxes] =
        await Promise.all([
          prisma.membership.count({
            where: {
              userId: actor.id,
              status: "ACTIVE",
              plan: { slug: "quipsly-free" },
            },
          }),
          prisma.studioProject.count({
            where: {
              slug: expectedHomeSlug,
              sourceLabel: "nest-kind:home",
            },
          }),
          prisma.mediaBin.count({
            where: {
              projectId: homeProject.id,
              name: "Inbox",
            },
          }),
        ]);
      expect({
        activeStarterMemberships,
        homeProjects,
        inboxes,
      }).toEqual({
        activeStarterMemberships: 1,
        homeProjects: 1,
        inboxes: 1,
      });

      const room = await prisma.callRoom.create({
        data: {
          createdByUserId: actor.id,
          projectId: homeProject.id,
          title: "Local iPhone planning proof",
        },
        select: { id: true },
      });
      callRoomId = room.id;
      const capturedAt = new Date();
      const dueAt = new Date(capturedAt.getTime() + 6 * 60 * 60 * 1000);
      const reminderAt = new Date(capturedAt.getTime() + 5 * 60 * 60 * 1000);
      const quickEntry = await fetch(
        `${nestOrigin}/api/mobile/capture/quick-entry`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${firebaseIdToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            clientRequestId: quickEntryRequestId,
            callRoomId,
            kind: "TASK",
            title: quickEntryTitle,
            body: "Prove the same accepted task in Today, Work, and Calendar.",
            capturedAt: capturedAt.toISOString(),
            dueAt: dueAt.toISOString(),
            reminderAt: reminderAt.toISOString(),
            tagIds: [],
            newTagLabels: [quickEntryTagLabel],
          }),
        },
      );
      const quickEntryBody = await readJson(
        quickEntry,
        "iPhone due-task capture",
      );
      expect(quickEntryBody).toMatchObject({
        ok: true,
        idempotentReplay: false,
        entry: {
          id: quickEntryTaskId,
          callRoomId,
          projectId: homeProject.id,
          dueAt: dueAt.toISOString(),
          reminder: {
            id: `mobile-task-reminder-${quickEntryRequestId}`,
            actionItemId: quickEntryTaskId,
            remindAt: reminderAt.toISOString(),
            status: "ACTIVE",
            deviceNotificationScheduled: false,
          },
          tags: [{ label: quickEntryTagLabel }],
        },
        boundaries: {
          canonicalReminderIntentCommitted: true,
          deviceNotificationScheduled: false,
          delivered: false,
        },
      });

      const replay = await fetch(
        `${nestOrigin}/api/mobile/capture/quick-entry`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${firebaseIdToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            clientRequestId: quickEntryRequestId,
            callRoomId,
            kind: "TASK",
            title: quickEntryTitle,
            body: "Prove the same accepted task in Today, Work, and Calendar.",
            capturedAt: capturedAt.toISOString(),
            dueAt: dueAt.toISOString(),
            reminderAt: reminderAt.toISOString(),
            tagIds: [],
            newTagLabels: [quickEntryTagLabel],
          }),
        },
      );
      expect(await readJson(replay, "iPhone due-task replay")).toMatchObject({
        ok: true,
        idempotentReplay: true,
        entry: { id: quickEntryTaskId },
      });

      for (const route of ["/today", "/work", "/schedule"]) {
        const firstRead = await fetch(`${nestOrigin}${route}`, {
          headers: { cookie: sessionCookie },
        });
        expect(firstRead.status).toBe(200);
        const firstHtml = await firstRead.text();
        expect(firstHtml).toContain(quickEntryTaskId);
        expect(firstHtml).toContain(quickEntryTitle);
        expect(firstHtml).toContain("Reminder");

        const reload = await fetch(`${nestOrigin}${route}`, {
          headers: { cookie: sessionCookie },
        });
        expect(reload.status).toBe(200);
        const reloadHtml = await reload.text();
        expect(reloadHtml).toContain(quickEntryTaskId);
        expect(reloadHtml).toContain(quickEntryTitle);
        expect(reloadHtml).toContain("Reminder");
      }

      const persistedTask = await prisma.actionItem.findUniqueOrThrow({
        where: { id: quickEntryTaskId },
        include: {
          reminder: true,
          tagLinks: {
            include: { tag: true },
          },
        },
      });
      expect(persistedTask).toMatchObject({
        id: quickEntryTaskId,
        assignedUserId: actor.id,
        roomId: callRoomId,
        projectId: homeProject.id,
        dueAt,
        sourceJson: {
          schema: "quipsly-mobile-quick-entry-v1",
          surface: "ios-capture",
          dueAt: dueAt.toISOString(),
          reminderAt: reminderAt.toISOString(),
          humanCommitted: true,
          externalSideEffects: false,
        },
        reminder: {
          id: `mobile-task-reminder-${quickEntryRequestId}`,
          ownerUserId: actor.id,
          remindAt: reminderAt,
          status: "ACTIVE",
          sourceJson: {
            schema: "quipsly-task-reminder-intent-v1",
            explicitHumanIntent: true,
            deviceNotificationScheduled: false,
            deliveryClaimed: false,
          },
        },
        tagLinks: [{ tag: { label: quickEntryTagLabel } }],
      });
      await expect(
        prisma.actionItem.count({ where: { id: quickEntryTaskId } }),
      ).resolves.toBe(1);

      const nativeSession = await fetch(
        `${nestOrigin}/api/mac/session-check`,
        { headers: { authorization: `Bearer ${firebaseIdToken}` } },
      );
      const nativeBody = await readJson(
        nativeSession,
        "Quipsly native session check",
      );
      expect((nativeBody.user as JsonRecord)?.email).toBe(email);
      expect((nativeBody.homeNest as JsonRecord)?.slug).toBe(expectedHomeSlug);

      const authenticatedRoutes = [
        "/api/auth/session",
        "/projects",
        "/account/switch",
        `/nests/${encodeURIComponent(expectedHomeSlug)}`,
        `/create?project=${encodeURIComponent(expectedHomeSlug)}`,
      ];

      for (const route of authenticatedRoutes) {
        const response = await fetch(`${nestOrigin}${route}`, {
          headers: { cookie: sessionCookie },
          redirect: "manual",
        });
        expect(response.status).toBe(200);
      }

      const projectsHtml = await (
        await fetch(`${nestOrigin}/projects`, {
          headers: { cookie: sessionCookie },
        })
      ).text();
      expect(projectsHtml).toContain(expectedHomeSlug);

      await firebasePost(
        "accounts:delete",
        { idToken: firebaseIdToken },
        "Firebase disposable identity deletion",
      );
      firebaseIdentityDeleted = true;
      const deletedIdentitySignIn = await fetch(
        `${identityToolkit}/v1/accounts:signInWithPassword?key=${encodeURIComponent(firebaseApiKey)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password, returnSecureToken: true }),
        },
      );
      expect(deletedIdentitySignIn.ok).toBe(false);

      const logout = await fetch(`${nestOrigin}/api/auth/session`, {
        method: "DELETE",
        headers: { cookie: sessionCookie },
      });
      expect(logout.status).toBe(200);
      expectSessionCookieCleared(logout);
    } finally {
      if (firebaseIdToken && !firebaseIdentityDeleted) {
        await firebasePost(
          "accounts:delete",
          { idToken: firebaseIdToken },
          "Firebase disposable identity cleanup",
        );
      }

      const user = await prisma.user.findUnique({
        where: { primaryEmail: email },
        select: { id: true },
      });
      const homeProject = await prisma.studioProject.findFirst({
        where: {
          slug: expectedHomeSlug,
          sourceLabel: "nest-kind:home",
        },
        select: { id: true },
      });

      await prisma.$transaction(async (tx) => {
        await tx.actionItem.deleteMany({
          where: { id: quickEntryTaskId },
        });
        if (callRoomId) {
          await tx.callRoom.deleteMany({ where: { id: callRoomId } });
        }
        await tx.studioProjectAccessGrant.deleteMany({
          where: { email },
        });
        if (homeProject) {
          await tx.studioProject.delete({ where: { id: homeProject.id } });
        }
        if (user) {
          await tx.user.delete({ where: { id: user.id } });
        }
      });

      const [
        remainingUsers,
        remainingHomeProjects,
        remainingGrants,
        remainingTasks,
        remainingReminders,
        remainingRooms,
        remainingTags,
      ] =
        await Promise.all([
          prisma.user.count({ where: { primaryEmail: email } }),
          prisma.studioProject.count({
            where: {
              slug: expectedHomeSlug,
              sourceLabel: "nest-kind:home",
            },
          }),
          prisma.studioProjectAccessGrant.count({ where: { email } }),
          prisma.actionItem.count({ where: { id: quickEntryTaskId } }),
          prisma.taskReminder.count({
            where: { id: `mobile-task-reminder-${quickEntryRequestId}` },
          }),
          callRoomId
            ? prisma.callRoom.count({ where: { id: callRoomId } })
            : Promise.resolve(0),
          prisma.studioTag.count({ where: { label: quickEntryTagLabel } }),
        ]);

      expect({
        remainingUsers,
        remainingHomeProjects,
        remainingGrants,
        remainingTasks,
        remainingReminders,
        remainingRooms,
        remainingTags,
      }).toEqual({
        remainingUsers: 0,
        remainingHomeProjects: 0,
        remainingGrants: 0,
        remainingTasks: 0,
        remainingReminders: 0,
        remainingRooms: 0,
        remainingTags: 0,
      });
      await prisma.$disconnect();
    }
  });
});
