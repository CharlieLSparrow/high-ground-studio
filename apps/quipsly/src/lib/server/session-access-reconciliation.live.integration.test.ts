/** @jest-environment node */
jest.mock("server-only", () => ({}));
jest.mock("@/auth", () => ({ auth: jest.fn() }));

import { randomUUID } from "node:crypto";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { getPrismaClient } from "@/lib/prisma";
import { changeCoachingEngagementMemberAccess } from "./coaching-engagement-membership";
import { reconcileLiveKitParticipantJoin } from "./session-access-reconciliation";

// Real PostgreSQL + local LiveKit + three browser WebRTC clients. No microphone
// or camera is requested. This proves disconnection, not audio recording.
const enabled =
  process.env.QUIPSLY_LOCAL_DB_SMOKE === "1" &&
  process.env.QUIPSLY_LOCAL_LIVEKIT_SMOKE === "1";
if (enabled) {
  const database = process.env.QUIPSLY_LOCAL_DATABASE_URL;
  if (
    !database ||
    !["127.0.0.1", "localhost", "[::1]"].includes(new URL(database).hostname)
  )
    throw new Error("A disposable local database is required.");
  process.env.DATABASE_URL = database;
}

(enabled ? it : it.skip)(
  "disconnects both real client devices while retaining the coach, then permits restored access",
  async () => {
    const url = process.env.QUIPSLY_LOCAL_LIVEKIT_URL ?? "ws://127.0.0.1:7880";
    const parsed = new URL(url);
    if (
      !["ws:", "wss:"].includes(parsed.protocol) ||
      !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname)
    )
      throw new Error("This test refuses non-loopback providers.");
    const environment = { ...process.env };
    process.env.LIVEKIT_URL = url;
    process.env.LIVEKIT_API_KEY =
      process.env.QUIPSLY_LOCAL_LIVEKIT_KEY ?? "devkey";
    process.env.LIVEKIT_API_SECRET =
      process.env.QUIPSLY_LOCAL_LIVEKIT_SECRET ?? "secret";
    const prisma = getPrismaClient();
    const admin = new RoomServiceClient(
      url.replace(/^ws/, "http"),
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
      { requestTimeout: 5 },
    );
    const { chromium } = jest.requireActual(
      "playwright",
    ) as typeof import("playwright");
    const browser = await chromium.launch({ headless: true });
    const nonce = randomUUID();
    const providerRoom = `quipsly-access-smoke-${nonce}`;
    const coach = `live-coach-${nonce}`,
      client = `live-client-${nonce}`;
    let projectId: string | undefined,
      workspaceId: string | undefined,
      engagementId: string | undefined,
      roomId: string | undefined;
    try {
      await prisma.user.createMany({
        data: [
          { id: coach, primaryEmail: `${coach}@example.test` },
          { id: client, primaryEmail: `${client}@example.test` },
        ],
      });
      const workspace = await prisma.studioWorkspace.create({
        data: {
          slug: `live-access-${nonce}`,
          name: "Local live access rehearsal",
        },
      });
      workspaceId = workspace.id;
      const project = await prisma.studioProject.create({
        data: {
          workspaceId,
          slug: `live-access-${nonce}`,
          name: "Synthetic live access",
        },
      });
      projectId = project.id;
      const space = await prisma.coachingEngagement.create({
        data: {
          projectId,
          title: "Synthetic access rehearsal",
          members: {
            create: [
              { userId: coach, role: "COACH" },
              { userId: client, role: "CLIENT" },
            ],
          },
        },
      });
      engagementId = space.id;
      const room = await prisma.callRoom.create({
        data: {
          projectId,
          coachingEngagementId: engagementId,
          provider: "livekit",
          providerRoomId: providerRoom,
          createdByUserId: coach,
          title: "Synthetic live call",
          participants: {
            create: [
              { userId: coach, role: "COACH" },
              { userId: client, role: "CLIENT" },
            ],
          },
        },
        include: { participants: true },
      });
      roomId = room.id;
      const clientParticipant = room.participants.find(
        (p) => p.userId === client,
      )!;
      const coachParticipant = room.participants.find(
        (p) => p.userId === coach,
      )!;
      const member = await prisma.coachingEngagementMember.findUniqueOrThrow({
        where: { engagementId_userId: { engagementId, userId: client } },
      });
      const identities = [
        `${clientParticipant.id}:browser-one`,
        `${clientParticipant.id}:browser-two`,
        `${coachParticipant.id}:browser`,
      ];
      const pages = await Promise.all(
        identities.map(async (identity) => {
          const context = await browser.newContext();
          const page = await context.newPage();
          await page.goto("http://127.0.0.1:3012/", {
            waitUntil: "domcontentloaded",
          });
          await page.addScriptTag({ path: require.resolve("livekit-client") });
          const token = new AccessToken(
            process.env.LIVEKIT_API_KEY,
            process.env.LIVEKIT_API_SECRET,
            { identity, ttl: 300 },
          );
          token.addGrant({
            roomJoin: true,
            room: providerRoom,
            canSubscribe: true,
            canPublishData: true,
          });
          const jwt = await token.toJwt();
          await page.evaluate(
            async ({ url, jwt }) => {
              const global = globalThis as any;
              global.testRoom = new global.LivekitClient.Room();
              await global.testRoom.connect(url, jwt);
            },
            { url, jwt },
          );
          await prisma.callParticipantProviderGrantReceipt.create({
            data: {
              roomId: room.id,
              participantId: identity.startsWith(clientParticipant.id)
                ? clientParticipant.id
                : coachParticipant.id,
              tokenJti: randomUUID(),
              providerRoomId: providerRoom,
              providerIdentity: identity,
              clientKind: "web",
              issuedAt: new Date(),
              expiresAt: new Date(Date.now() + 300_000),
            },
          });
          return { page, jwt };
        }),
      );
      expect(
        (await admin.listParticipants(providerRoom))
          .map((p) => p.identity)
          .sort(),
      ).toEqual([...identities].sort());
      const request = {
        prisma,
        engagementId,
        memberId: member.id,
        actor: { id: coach },
        requestId: randomUUID(),
        expectedRevision: 0,
        action: "REMOVE" as const,
      };
      expect(
        (await changeCoachingEngagementMemberAccess(request)).calls,
      ).toMatchObject({ pending: false });
      for (const { page } of pages.slice(0, 2))
        await page.waitForFunction(
          () => (globalThis as any).testRoom.state === "disconnected",
        );
      expect(
        (await admin.listParticipants(providerRoom)).map((p) => p.identity),
      ).toEqual([identities[2]]);
      expect(
        await pages[2].page.evaluate(() => (globalThis as any).testRoom.state),
      ).toBe("connected");

      // A self-hosted token really can reconnect. The application reconciles the
      // signed join event against current membership instead of claiming expiry
      // already made the old token harmless.
      const reconnect = async () =>
        pages[0].page.evaluate(
          async ({ url, jwt }) => {
            const global = globalThis as any;
            global.testRoom = new global.LivekitClient.Room();
            await global.testRoom.connect(url, jwt);
          },
          { url, jwt: pages[0].jwt },
        );
      await reconnect();
      expect(
        await reconcileLiveKitParticipantJoin(
          {
            eventId: randomUUID(),
            eventType: "participant_joined",
            createdAt: null,
            egress: null,
            raw: {
              room: { name: providerRoom },
              participant: { identity: identities[0] },
            },
          },
          prisma,
        ),
      ).toMatchObject({
        status: "CONVERGED",
        tokenRevocationGuaranteed: false,
      });
      await pages[0].page.waitForFunction(
        () => (globalThis as any).testRoom.state === "disconnected",
      );
      await changeCoachingEngagementMemberAccess({
        ...request,
        action: "RESTORE",
        expectedRevision: 1,
        requestId: randomUUID(),
      });
      await reconnect();
      expect(
        await pages[0].page.evaluate(() => (globalThis as any).testRoom.state),
      ).toBe("connected");
      expect(await prisma.callParticipant.count({ where: { roomId } })).toBe(2);
    } finally {
      await browser.close();
      await admin.deleteRoom(providerRoom).catch(() => {});
      if (roomId) await prisma.callRoom.deleteMany({ where: { id: roomId } });
      if (engagementId)
        await prisma.coachingEngagement.deleteMany({
          where: { id: engagementId },
        });
      if (projectId)
        await prisma.studioProject.deleteMany({ where: { id: projectId } });
      if (workspaceId)
        await prisma.studioWorkspace.deleteMany({ where: { id: workspaceId } });
      await prisma.user.deleteMany({ where: { id: { in: [coach, client] } } });
      await prisma.$disconnect();
      process.env = environment;
    }
  },
  90_000,
);
