/** @jest-environment node */
import { randomUUID } from "node:crypto";
import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { loadSessionWork } from "@/lib/server/session-work";
import { DELETE, GET, PATCH, PUT } from "./route";

jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));

const enabled = process.env.QUIPSLY_LOCAL_DB_SMOKE === "1";
if (enabled) {
  const target = process.env.QUIPSLY_LOCAL_DATABASE_URL;
  if (!target || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(target).hostname)) {
    throw new Error("Client-space endpoint tests require an explicit local database.");
  }
  process.env.DATABASE_URL = target;
}

(enabled ? describe : describe.skip)("client-space work through the real web and Capture endpoint", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID();
  const people = ["coach", "client", "observer", "guest", "outsider"].map((name) => ({
    id: `space-work-${name}-${nonce}`, name, primaryEmail: `space-work-${name}-${nonce}@example.test`,
  }));
  const [coach, client, observer, guest, outsider] = people;
  const workspaceId = `space-work-${nonce}`;
  const projectId = `space-project-${nonce}`;
  const engagementId = `space-relationship-${nonce}`;
  const roomId = `space-session-${nonce}`;
  const handlers = {GET, PATCH, DELETE, PUT};

  async function act(method: keyof typeof handlers, body: Record<string, unknown> = {}, actor = client!) {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({user: actor} as never);
    const response = await handlers[method](new Request(`http://localhost/api/coaching/engagements/${engagementId}/work`, {
      method, ...(method === "GET" ? {} : {headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)}),
    }), {params: Promise.resolve({engagementId})});
    return {status: response.status, body: await response.json()};
  }

  async function seed(kind: "TASK" | "GOAL", visibility = "engagement-shared", removed = false) {
    const sourceJson = {origin: "quipsly-session-follow-through", visibility, roomId,
      recordingAssetId: "retained-source-fixture", sourceStartSeconds: 12,
      ...(removed ? {relationshipWorkRemoval: {active: true, previousStatus: kind === "TASK" ? "OPEN" : "ACTIVE"}} : {}),
    };
    return kind === "TASK"
      ? prisma.actionItem.create({data: {engagementId, roomId, title: "Original task", assignedUserId: coach!.id,
          status: removed ? "CANCELED" : "OPEN", dueAt: new Date("2026-09-20T15:30:00Z"), sourceJson}})
      : prisma.goal.create({data: {engagementId, roomId, title: "Original goal", ownerUserId: coach!.id,
          status: removed ? "ARCHIVED" : "ACTIVE", sourceJson}});
  }

  async function row(kind: "TASK" | "GOAL", id: string) {
    return kind === "TASK" ? prisma.actionItem.findUniqueOrThrow({where: {id}}) : prisma.goal.findUniqueOrThrow({where: {id}});
  }

  beforeAll(async () => {
    await prisma.user.createMany({data: people});
    await prisma.studioWorkspace.create({data: {id: workspaceId, slug: workspaceId, name: "Client-space endpoint QA"}});
    await prisma.studioProject.create({data: {id: projectId, workspaceId, slug: projectId, name: "QA"}});
    await prisma.coachingEngagement.create({data: {id: engagementId, projectId, title: "Client space",
      primaryCoachUserId: coach!.id, primaryClientUserId: client!.id, members: {create: [
        {userId: coach!.id, role: "COACH"}, {userId: client!.id, role: "CLIENT"}, {userId: observer!.id, role: "OBSERVER"},
      ]}}});
    await prisma.callRoom.create({data: {id: roomId, projectId, coachingEngagementId: engagementId, createdByUserId: coach!.id,
      participants: {create: {userId: guest!.id, role: "GUEST"}}}});
  });

  afterAll(async () => {
    try {
      await prisma.actionItem.deleteMany({where: {engagementId}});
      await prisma.goal.deleteMany({where: {engagementId}});
      await prisma.callRoom.deleteMany({where: {id: roomId}});
      await prisma.coachingEngagement.deleteMany({where: {id: engagementId}});
      await prisma.studioProject.deleteMany({where: {id: projectId}});
      await prisma.studioWorkspace.deleteMany({where: {id: workspaceId}});
      await prisma.user.deleteMany({where: {id: {in: people.map((person) => person.id)}}});
    } finally { await prisma.$disconnect(); }
  });

  it.each(["TASK", "GOAL"] as const)("cannot change, remove, or restore a known private %s ID", async (kind) => {
    for (const method of ["PATCH", "DELETE", "PUT"] as const) {
      const original = await seed(kind, "AUTHOR_PRIVATE", method === "PUT");
      const read = await act("GET");
      expect(read.body.engagement.entries.some((entry: {id: string}) => entry.id === original.id)).toBe(false);
      const response = await act(method, {kind, id: original.id, expectedUpdatedAt: original.updatedAt.toISOString(),
        title: "Unwanted change", body: "Must not be written", ownerUserId: client!.id,
        status: kind === "TASK" ? "OPEN" : "ACTIVE"});
      expect({method, status: response.status}).toEqual({method, status: 409});
      expect(await row(kind, original.id)).toEqual(original);
    }
  });

  it.each(["TASK", "GOAL"] as const)("edits, removes, and restores shared %s without losing its recording source", async (kind) => {
    const original = await seed(kind);
    const saved = await act("PATCH", {kind, id: original.id, expectedUpdatedAt: original.updatedAt.toISOString(),
      title: "Clarified together", body: "Same work in the client space and session", ownerUserId: coach!.id,
      status: kind === "TASK" ? "DONE" : "ACHIEVED", targetAt: "2026-09-20T15:30:00.000Z"});
    expect(saved).toMatchObject({status: 200, body: {ok: true, entry: {id: original.id, title: "Clarified together"}}});
    const updated = await row(kind, original.id);
    expect(updated.sourceJson).toMatchObject(original.sourceJson as object);
    const sessionWork = await loadSessionWork({prisma, roomId, actor: coach!});
    expect(sessionWork.find((entry) => entry.id === original.id)).toMatchObject({title: "Clarified together", status: kind === "TASK" ? "DONE" : "ACHIEVED"});
    expect((await act("PATCH", {kind, id: original.id, expectedUpdatedAt: original.updatedAt.toISOString(),
      title: "Stale edit", ownerUserId: coach!.id, status: kind === "TASK" ? "OPEN" : "ACTIVE"})).status).toBe(409);
    const removed = await act("DELETE", {kind, id: original.id, expectedUpdatedAt: updated.updatedAt.toISOString()});
    expect(removed).toMatchObject({status: 200, body: {ok: true, undoAvailable: true}});
    expect((await act("GET")).body.engagement.entries.some((entry: {id: string}) => entry.id === original.id)).toBe(false);
    const restored = await act("PUT", {kind, id: original.id, expectedUpdatedAt: removed.body.removal.updatedAt});
    expect(restored).toMatchObject({status: 200, body: {entry: {id: original.id, title: "Clarified together", status: kind === "TASK" ? "DONE" : "ACHIEVED"}}});
    expect((await row(kind, original.id)).sourceJson).toMatchObject(original.sourceJson as object);
  });

  it("rejects observers, single-session guests, outsiders, and removed members for all mutations", async () => {
    for (const actor of [observer!, guest!, outsider!]) {
      for (const method of ["PATCH", "DELETE", "PUT"] as const) {
        const original = await seed("TASK", "engagement-shared", method === "PUT");
        expect((await act(method, {kind: "TASK", id: original.id, expectedUpdatedAt: original.updatedAt.toISOString(),
          title: "Not allowed", ownerUserId: client!.id, status: "OPEN"}, actor)).status).toBe(404);
        expect(await row("TASK", original.id)).toEqual(original);
      }
    }
    await prisma.coachingEngagementMember.update({where: {engagementId_userId: {engagementId, userId: client!.id}}, data: {status: "REMOVED"}});
    try {
      expect((await act("GET")).status).toBe(404);
      for (const method of ["PATCH", "DELETE", "PUT"] as const) {
        const original = await seed("TASK", "engagement-shared", method === "PUT");
        expect((await act(method, {kind: "TASK", id: original.id, expectedUpdatedAt: original.updatedAt.toISOString(),
          title: "Removed member cannot change this", ownerUserId: coach!.id, status: "OPEN"})).status).toBe(404);
        expect(await row("TASK", original.id)).toEqual(original);
      }
    }
    finally { await prisma.coachingEngagementMember.update({where: {engagementId_userId: {engagementId, userId: client!.id}}, data: {status: "ACTIVE"}}); }
  });
});
