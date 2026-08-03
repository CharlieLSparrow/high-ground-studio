/** @jest-environment node */

import { createHash } from "node:crypto";

import {
  CLIENT_FOLLOW_UP_ATTENTION_SCHEMA,
  loadClientFollowUpAttention,
  projectClientFollowUpAttention,
} from "./client-follow-up-attention";
import {
  CLIENT_FOLLOW_UP_MANIFEST_SCHEMA,
  CLIENT_FOLLOW_UP_SCHEMA,
  clientFollowUpRecordSha256Matches,
  clientFollowUpSha256,
  stableClientFollowUpJson,
} from "./session-client-follow-up";

function fixture(overrides: Record<string, unknown> = {}) {
  const body = {
    schema: CLIENT_FOLLOW_UP_SCHEMA,
    title: "Your coaching follow-up",
    intro: "One useful step at a time.",
    session: { id: "room-1", title: "Leadership coaching" },
    notes: [{ id: "note-1", title: "Keep this", body: "Protect the useful constraint.", kind: "FOLLOW_UP", sourceAnchor: null }],
    goals: [],
    tasks: [{ id: "task-1", title: "Try one change", detail: null, status: "OPEN", dueAt: null, sourceAnchor: null }],
    nextSessionFocus: "Review what changed.",
  };
  const manifest = {
    schema: CLIENT_FOLLOW_UP_MANIFEST_SCHEMA,
    roomId: "room-1",
    recipientUserId: "client-1",
    records: {
      notes: [{ id: "note-1", contentSha256: clientFollowUpSha256({ title: "Keep this", body: "Protect the useful constraint.", kind: "FOLLOW_UP", sourceAnchor: null }) }],
      goals: [],
      tasks: [{ id: "task-1", contentSha256: clientFollowUpSha256({ title: "Try one change", detail: null, status: "OPEN", dueAt: null, sourceAnchor: null }) }],
    },
  };
  return {
    id: "output-1",
    roomId: "room-1",
    createdByUserId: "coach-1",
    recipientUserId: "client-1",
    kind: "CLIENT_FOLLOW_UP",
    status: "RELEASED",
    title: body.title,
    bodyJson: body,
    sourceManifestJson: manifest,
    contentSha256: clientFollowUpSha256(body),
    revision: 2,
    releasedAt: new Date("2026-08-03T18:00:00.000Z"),
    updatedAt: new Date("2026-08-03T18:00:00.000Z"),
    room: {
      id: "room-1",
      title: "Leadership coaching",
      booking: {
        clientUserId: "client-1",
        coachUserId: "coach-1",
        coachUser: { name: "Homer", primaryEmail: "coach@example.test" },
      },
    },
    deliveries: [],
    ...overrides,
  };
}

describe("client follow-up attention", () => {
  it("canonicalizes optional fields like persisted JSON and reads historical record digests", () => {
    const persisted = {
      title: "Keep this",
      sourceAnchor: { roomId: "room-1" },
    };
    const prePersistence = {
      title: "Keep this",
      sourceAnchor: { roomId: "room-1", sourceSpan: undefined },
    };
    expect(stableClientFollowUpJson(prePersistence)).toBe(
      stableClientFollowUpJson(persisted),
    );

    const historicalDigest = createHash("sha256")
      .update('{"sourceAnchor":{"roomId":"room-1","sourceSpan":undefined},"title":"Keep this"}')
      .digest("hex");
    expect(clientFollowUpRecordSha256Matches(persisted, historicalDigest)).toBe(true);
  });

  it("projects one exact unopened recipient snapshot into Today", () => {
    expect(projectClientFollowUpAttention(fixture(), "client-1")).toEqual({
      schema: CLIENT_FOLLOW_UP_ATTENTION_SCHEMA,
      outputId: "output-1",
      roomId: "room-1",
      sessionTitle: "Leadership coaching",
      title: "Your coaching follow-up",
      revision: 2,
      contentSha256: clientFollowUpSha256(fixture().bodyJson),
      releasedAt: "2026-08-03T18:00:00.000Z",
      coachLabel: "Homer",
      selectedCount: 2,
      href: "/sessions/room-1?mode=outputs#client-follow-up",
    });
  });

  it("rejects a different recipient, relationship drift, corrupted snapshot, and mismatched selected record", () => {
    expect(projectClientFollowUpAttention(fixture(), "outsider")).toBeNull();
    expect(projectClientFollowUpAttention(fixture({ createdByUserId: "other-coach" }), "client-1")).toBeNull();
    expect(projectClientFollowUpAttention(fixture({ contentSha256: "0".repeat(64) }), "client-1")).toBeNull();
    const changedBody = structuredClone(fixture().bodyJson) as any;
    changedBody.tasks[0].title = "Different wording";
    expect(projectClientFollowUpAttention(fixture({
      bodyJson: changedBody,
      contentSha256: clientFollowUpSha256(changedBody),
    }), "client-1")).toBeNull();
  });

  it("removes the exact snapshot after recipient-confirmed open and continues to the next verified candidate", async () => {
    const opened = fixture({
      id: "opened-output",
      deliveries: [{
        outputId: "opened-output",
        roomId: "room-1",
        actorUserId: "client-1",
        recipientUserId: "client-1",
        kind: "OPENED_IN_APP",
        status: "CONFIRMED",
        contentSha256: clientFollowUpSha256(fixture().bodyJson),
      }],
    });
    const next = fixture({ id: "next-output" });
    const findMany = jest.fn().mockResolvedValue([opened, next]);

    await expect(loadClientFollowUpAttention({ sessionOutput: { findMany } }, "client-1"))
      .resolves.toMatchObject({ outputId: "next-output", roomId: "room-1" });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ recipientUserId: "client-1", status: "RELEASED" }),
      take: 25,
    }));
  });
});
