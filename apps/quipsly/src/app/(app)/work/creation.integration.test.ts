/** @jest-environment node */
jest.mock("server-only", () => ({}));
jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySession: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySession } from "@/lib/server/quipsly-session";
import { personalOrSharedSessionTaskAccessWhere } from "@/lib/server/task-access";
import { createWorkGoal, createWorkTask, editWorkTask } from "./actions";

const enabled = process.env.QUIPSLY_LOCAL_DB_SMOKE === "1";
if (enabled) {
  const url = new URL(process.env.QUIPSLY_LOCAL_DATABASE_URL || "invalid:");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Work creation tests require a loopback database.");
  process.env.DATABASE_URL = url.toString();
}

(enabled ? describe : describe.skip)("Work creation through the authenticated action boundary", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID();
  const id = (name: string) => `work-create-${name}-${nonce}`;
  const people = ["owner", "editor", "viewer", "outsider"];
  const signIn = (name: string) => jest.mocked(getQuipslySession).mockResolvedValue({
    user: { id: id(name), primaryEmail: `${id(name)}@example.test` },
  } as Awaited<ReturnType<typeof getQuipslySession>>);
  const task = (extra = {}) => ({ clientRequestId: randomUUID(), title: "Prepare our next conversation", ...extra });
  beforeAll(async () => {
    await prisma.user.createMany({ data: people.map(name => ({ id: id(name), primaryEmail: `${id(name)}@example.test` })) });
    await prisma.studioWorkspace.create({ data: { id: id("workspace"), slug: id("workspace"), name: "Work creation QA" } });
    await prisma.studioProject.create({ data: { id: id("project"), slug: id("project"), name: "Writing together", workspaceId: id("workspace") } });
    await prisma.studioProjectAccessGrant.createMany({ data: (["owner", "editor", "viewer"] as const).map(name => ({
      projectId: id("project"), email: `${id(name)}@example.test`, memberUserId: id(name), role: name.toUpperCase() as "OWNER" | "EDITOR" | "VIEWER",
    })) });
    await prisma.studioTag.create({ data: { id: id("tag"), projectId: id("project"), slug: "research", label: "Research", hexColor: "#506b46" } });
  });
  beforeEach(() => { jest.mocked(revalidatePath).mockReset(); signIn("owner"); });
  afterAll(async () => {
    const userIds = people.map(id);
    await prisma.taskOccurrence.deleteMany({ where: { series: { ownerUserId: { in: userIds } } } });
    await prisma.actionItem.deleteMany({ where: { assignedUserId: { in: userIds } } });
    await prisma.taskRecurrenceSeries.deleteMany({ where: { ownerUserId: { in: userIds } } });
    await prisma.goal.deleteMany({ where: { ownerUserId: { in: userIds } } });
    await prisma.studioProject.deleteMany({ where: { id: id("project") } });
    await prisma.studioWorkspace.deleteMany({ where: { id: id("workspace") } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it("races independent transactions and returns one ordinary task and receipt", async () => {
    const input = task({ projectId: id("project") });
    const results = await Promise.all([createWorkTask(input), createWorkTask(input), createWorkTask(input)]);
    expect(results.every(result => result.ok)).toBe(true);
    if (!results[0].ok) throw new Error("Task did not save");
    expect(results).toEqual([results[0], results[0], results[0]]);
    expect(await prisma.actionItem.count({ where: { id: results[0].taskId } })).toBe(1);
    expect(await prisma.actionItem.findUnique({ where: { id: results[0].taskId } })).toMatchObject({
      assignedUserId: id("owner"), projectId: id("project"), isNestShared: false,
    });
  });

  it("recovers a committed save after a failed reply and preserves later edits and tag color", async () => {
    const input = task({ title: "Retained response-loss task", projectId: id("project") });
    jest.mocked(revalidatePath).mockImplementationOnce(() => { throw new Error("Injected failure after commit"); });
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    try { expect(await createWorkTask(input)).toMatchObject({ ok: false, code: "UNAVAILABLE" }); }
    finally { consoleError.mockRestore(); }
    const saved = await prisma.actionItem.findFirstOrThrow({ where: { assignedUserId: id("owner"), title: input.title } });
    expect(await editWorkTask({ taskId: saved.id, title: "Edited after saving", detail: "Keep this context", dueLocal: null,
      timezone: "UTC", expectedUpdatedAt: saved.updatedAt.toISOString() })).toMatchObject({ ok: true });
    await prisma.actionItemTagLink.create({ data: { actionItemId: saved.id, tagId: id("tag") } });
    const retry = await createWorkTask(input);
    expect(retry).toMatchObject({ ok: true, taskId: saved.id });
    expect(await prisma.actionItem.findUnique({ where: { id: saved.id }, include: { tagLinks: { include: { tag: true } } } }))
      .toMatchObject({ title: "Edited after saving", detail: "Keep this context", tagLinks: [{ tag: { hexColor: "#506b46" } }] });
    expect(await prisma.actionItem.count({ where: { assignedUserId: id("owner"), sourceJson: { path: ["creationCommand", "clientRequestId"], equals: input.clientRequestId } } })).toBe(1);
  });

  it("replays normalized input but rejects reuse for different work, including recurrence changes", async () => {
    const input = task({ title: "  Keep   the idea  " });
    const saved = await createWorkTask(input);
    expect(await createWorkTask({ ...input, title: "Keep the idea", clientRequestId: input.clientRequestId.toUpperCase() })).toEqual(saved);
    expect(await createWorkTask({ ...input, title: "Another idea" })).toMatchObject({ ok: false, code: "CONFLICT" });
    expect(await createWorkTask({ ...input, dueLocal: "2026-10-01T09:00", timezone: "America/Denver",
      recurrence: { cadence: "FIXED", frequency: "WEEKLY" } })).toMatchObject({ ok: false, code: "CONFLICT" });
  });

  it.each(["FIXED", "COMPLETION"] as const)("creates just one %s series when the request races and retries", async cadence => {
    const input = task({ dueLocal: "2026-10-01T09:00", timezone: "America/Denver", recurrence: { cadence, frequency: "WEEKLY" as const } });
    const [first, second] = await Promise.all([createWorkTask(input), createWorkTask(input)]);
    expect(first).toEqual(second);
    if (!first.ok || !first.recurrenceSeriesId) throw new Error("Repeating task did not save");
    expect(await createWorkTask(input)).toEqual(first);
    expect(await prisma.taskRecurrenceSeries.count({ where: { id: first.recurrenceSeriesId } })).toBe(1);
    expect(await prisma.taskOccurrence.count({ where: { seriesId: first.recurrenceSeriesId } })).toBe(cadence === "FIXED" ? 3 : 1);
  });

  it("deduplicates goals without reverting a subsequent definition change", async () => {
    const input = { clientRequestId: randomUUID(), title: "Finish the chapter", projectId: id("project") };
    const [first, second] = await Promise.all([createWorkGoal(input), createWorkGoal(input)]);
    expect(first).toEqual(second);
    if (!first.ok) throw new Error("Goal did not save");
    await prisma.goal.update({ where: { id: first.goalId }, data: { title: "Finish the whole manuscript" } });
    expect(await createWorkGoal(input)).toMatchObject({ ok: true, goalId: first.goalId, receiptId: first.receiptId });
    expect((await prisma.goal.findUniqueOrThrow({ where: { id: first.goalId } })).title).toBe("Finish the whole manuscript");
    expect(await createWorkGoal({ ...input, description: "A different intent" })).toMatchObject({ ok: false, code: "CONFLICT" });
  });

  it("uses current Nest write membership on create and replay", async () => {
    const input = task({ projectId: id("project") });
    signIn("editor");
    const saved = await createWorkTask(input);
    expect(saved.ok).toBe(true);
    await prisma.studioProjectAccessGrant.updateMany({ where: { projectId: id("project"), memberUserId: id("editor") }, data: { status: "REVOKED" } });
    expect(await createWorkTask(input)).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    for (const person of ["viewer", "outsider"]) {
      signIn(person);
      expect(await createWorkTask(input)).toMatchObject({ ok: false, code: "INVALID_INPUT" });
      expect(await createWorkGoal(input)).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    }
  });

  it("binds request keys to the signed-in user and keeps personal results private", async () => {
    const input = task();
    const first = await createWorkTask(input);
    signIn("outsider");
    const second = await createWorkTask(input);
    if (!first.ok || !second.ok) throw new Error("Personal work did not save");
    expect(first.taskId).not.toBe(second.taskId);
    expect(await prisma.actionItem.count({ where: { id: first.taskId, OR: personalOrSharedSessionTaskAccessWhere(id("outsider")) } })).toBe(0);
    expect(await prisma.actionItem.count({ where: { id: second.taskId, OR: personalOrSharedSessionTaskAccessWhere(id("owner")) } })).toBe(0);
  });

  it("rejects missing identities and malformed request keys", async () => {
    expect(await createWorkTask(task({ clientRequestId: "bad-key" }))).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(await createWorkGoal(task({ clientRequestId: "bad-key" }))).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    jest.mocked(getQuipslySession).mockResolvedValue(null);
    expect(await createWorkTask(task())).toMatchObject({ ok: false, code: "AUTH_REQUIRED" });
    expect(await createWorkGoal(task())).toMatchObject({ ok: false, code: "AUTH_REQUIRED" });
  });
});
