/** @jest-environment node */
jest.mock("server-only", () => ({}));
jest.mock("@/auth", () => ({ auth: jest.fn() }));

import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createServer as createTcpServer, type AddressInfo } from "node:net";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { getPrismaClient } from "@/lib/prisma";
import { changeCoachingEngagementMemberAccess } from "./coaching-engagement-membership";
import { POST as receiveProviderWebhook } from "@/app/api/providers/livekit/webhook/route";

// Real PostgreSQL + local LiveKit + three browser WebRTC clients. No microphone
// or camera is requested. This proves disconnection, not audio recording.
// Own the provider so actual signed HTTP delivery, not a hand-written join
// event, exercises the application's webhook route. Existing local calls are
// not reconfigured or stopped.
async function freeTcpPort() {
  const listener = createTcpServer();
  await new Promise<void>((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const port = (listener.address() as AddressInfo).port;
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  return port;
}

async function startWebhookProvider() {
  const events: {
    event: string;
    identity?: string;
    status: number;
    response: any;
  }[] = [];
  const server = createServer(async (incoming, outgoing) => {
    if (incoming.method === "GET" && incoming.url === "/") {
      outgoing.setHeader("content-type", "text/html");
      outgoing.end("<!doctype html><title>Local call access test</title>");
      return;
    }
    try {
      const chunks = [];
      for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks).toString("utf8");
      const response = await receiveProviderWebhook(
        new Request("http://127.0.0.1/api/providers/livekit/webhook", {
          method: "POST",
          body,
          headers: {
            "content-type": incoming.headers["content-type"] || "",
            authorization: incoming.headers.authorization || "",
          },
        }),
      );
      const result = await response.json();
      const event = JSON.parse(body);
      events.push({
        event: event.event,
        identity: event.participant?.identity,
        status: response.status,
        response: result,
      });
      outgoing.writeHead(response.status, {
        "content-type": "application/json",
      });
      outgoing.end(JSON.stringify(result));
    } catch {
      outgoing.writeHead(500);
      outgoing.end();
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const port = await freeTcpPort();
  const tcpPort = await freeTcpPort();
  const apiKey = "local-webhook-test",
    apiSecret = randomUUID();
  const process = spawn(
    "livekit-server",
    [
      "--dev",
      "--bind",
      "127.0.0.1",
      "--node-ip",
      "127.0.0.1",
      "--config-body",
      JSON.stringify({
        port,
        rtc: {
          tcp_port: tcpPort,
          udp_port: tcpPort,
          enable_loopback_candidate: true,
        },
        keys: { [apiKey]: apiSecret },
        webhook: {
          api_key: apiKey,
          urls: [`${origin}/api/providers/livekit/webhook`],
        },
      }),
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let failure: Error | undefined;
  let providerLog = "";
  process.once("error", (error) => {
    failure = error;
  });
  for (const stream of [process.stdout, process.stderr])
    stream?.on("data", (chunk) => {
      providerLog = (providerLog + chunk.toString()).slice(-4000);
    });
  const stop = async () => {
    if (process.pid && process.exitCode == null && process.signalCode == null) {
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => process.kill("SIGKILL"), 3000);
        process.once("exit", () => {
          clearTimeout(timeout);
          resolve();
        });
        process.kill("SIGTERM");
      });
    }
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };
  const admin = new RoomServiceClient(
    `http://127.0.0.1:${port}`,
    apiKey,
    apiSecret,
    { requestTimeout: 1, failover: false },
  );
  try {
    const deadline = Date.now() + 15_000;
    while (true) {
      if (failure || process.exitCode != null)
        throw (
          failure ||
          new Error(
            `Local provider exited: ${providerLog.replaceAll(apiSecret, "[redacted]")}`,
          )
        );
      try {
        await admin.listRooms();
        break;
      } catch (error) {
        if (Date.now() > deadline) throw error;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    return {
      url: `ws://127.0.0.1:${port}`,
      apiKey,
      apiSecret,
      origin,
      events,
      stop,
    };
  } catch (error) {
    await stop();
    throw error;
  }
}
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
    const provider = await startWebhookProvider();
    const url = provider.url;
    const environment = { ...process.env };
    process.env.LIVEKIT_URL = url;
    process.env.LIVEKIT_API_KEY = provider.apiKey;
    process.env.LIVEKIT_API_SECRET = provider.apiSecret;
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
    const browser = await chromium
      .launch({ headless: true })
      .catch(async (error) => {
        await provider.stop();
        process.env = environment;
        throw error;
      });
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
          await page.goto(provider.origin, {
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
      // The real webhook may disconnect the rejected device before connect()
      // resolves. Both outcomes must still prove signed delivery + disconnect.
      await reconnect().catch(() => {});
      await pages[0].page.waitForFunction(
        () => (globalThis as any).testRoom.state === "disconnected",
      );
      // Wait for the HTTP response too: disconnection happens before readback.
      const deadline = Date.now() + 10_000;
      while (
        !provider.events.some(
          (event) =>
            event.identity === identities[0] &&
            event.response.access?.status === "CONVERGED",
        ) &&
        Date.now() < deadline
      )
        await new Promise((resolve) => setTimeout(resolve, 50));
      expect(provider.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            event: "participant_joined",
            identity: identities[0],
            status: 200,
            response: expect.objectContaining({
              access: expect.objectContaining({
                status: "CONVERGED",
                tokenRevocationGuaranteed: false,
              }),
            }),
          }),
        ]),
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
      await provider.stop();
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
