import { projectSessionCollaborationActivity } from "./session-collaboration-activity";

jest.mock("server-only", () => ({}));

describe("Session collaboration activity projection", () => {
  const now = new Date("2026-08-04T20:00:00.000Z");

  it("separates invitation acceptance, canonical removal, provider effect, and restoration", () => {
    const result = projectSessionCollaborationActivity({
      now,
      invitations: [
        {
          id: "invite-1",
          email: "guest@example.test",
          displayName: "Guest",
          role: "CLIENT",
          status: "ACCEPTED",
          createdAt: new Date("2026-08-04T18:00:00.000Z"),
          expiresAt: new Date("2026-08-11T18:00:00.000Z"),
          acceptedAt: new Date("2026-08-04T18:05:00.000Z"),
          createdBy: { name: "Host" },
          acceptedBy: { name: "Guest" },
        },
      ],
      accessReceipts: [
        {
          id: "remove-1",
          action: "REMOVE",
          providerStatus: "PENDING",
          createdAt: new Date("2026-08-04T19:00:00.000Z"),
          actor: { name: "Host" },
          participant: { displayName: "Guest" },
        },
        {
          id: "provider-1",
          action: "PROVIDER_RECONCILE",
          providerStatus: "CONVERGED",
          createdAt: new Date("2026-08-04T19:00:01.000Z"),
          actor: { name: "Host" },
          participant: { displayName: "Guest" },
        },
        {
          id: "restore-1",
          action: "RESTORE",
          providerStatus: "NOT_REQUIRED",
          createdAt: new Date("2026-08-04T19:05:00.000Z"),
          actor: { name: "Host" },
          participant: { displayName: "Guest" },
        },
      ],
      providerGrants: [],
    });

    expect(result.activity.map((entry) => entry.kind)).toEqual([
      "PARTICIPANT_RESTORED",
      "PROVIDER_RECONCILIATION",
      "PARTICIPANT_REMOVED",
      "INVITATION_ACCEPTED",
      "INVITATION_CREATED",
    ]);
    expect(
      result.activity.find((entry) => entry.kind === "PARTICIPANT_REMOVED")
        ?.detail,
    ).toMatch(/were not deleted/i);
  });

  it("deduplicates unexpired per-device leases without calling them presence", () => {
    const result = projectSessionCollaborationActivity({
      now,
      invitations: [],
      accessReceipts: [],
      providerGrants: [
        {
          id: "old-web",
          participantId: "participant-1",
          clientInstanceId: "web-1",
          clientKind: "web",
          deviceLabel: "Quipsly Web · MacIntel",
          issuedAt: new Date("2026-08-04T19:45:00.000Z"),
          expiresAt: new Date("2026-08-04T20:05:00.000Z"),
          participant: { displayName: "Guest" },
        },
        {
          id: "new-web",
          participantId: "participant-1",
          clientInstanceId: "web-1",
          clientKind: "web",
          deviceLabel: "Quipsly Web · MacIntel",
          issuedAt: new Date("2026-08-04T19:55:00.000Z"),
          expiresAt: new Date("2026-08-04T20:10:00.000Z"),
          participant: { displayName: "Guest" },
        },
        {
          id: "expired-ios",
          participantId: "participant-1",
          clientInstanceId: "ios-1",
          clientKind: "ios",
          issuedAt: new Date("2026-08-04T19:00:00.000Z"),
          expiresAt: new Date("2026-08-04T19:10:00.000Z"),
          participant: { displayName: "Guest" },
        },
      ],
    });

    expect(result.joinKeyLeases).toEqual([
      expect.objectContaining({ id: "new-web", participantLabel: "Guest" }),
    ]);
    expect(result.boundaries).toMatchObject({
      joinKeyLeaseIsPresenceProof: false,
      providerIdentitiesExposed: false,
      credentialsExposed: false,
    });
  });
});
