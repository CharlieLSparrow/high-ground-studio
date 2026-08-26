import fs from "node:fs";
import path from "node:path";

describe("coaching relationship overview boundary", () => {
  const source = fs.readFileSync(
    path.resolve(
      process.cwd(),
      "src/app/(app)/coaching/engagements/[engagementId]/page.tsx",
    ),
    "utf8",
  );

  it("projects only the signed-in actor's readable relationship records", () => {
    expect(source).toContain(
      'coachingEngagementAccessWhere(engagementId, session.user, "read")',
    );
    expect(source).toContain(
      '{ visibility: { in: ["SESSION_SHARED", "CLIENT_SAFE"] } }',
    );
    expect(source).toContain("{ authorUserId: session.user.id }");
    expect(source).toContain(
      'sourceJson: { path: ["visibility"], equals: "engagement-shared" }',
    );
  });

  it("keeps scheduling and private-note receipts role-bound", () => {
    expect(source).toContain(
      'session.user.isStaff || ownMembership?.role === "COACH"',
    );
    expect(source).toContain('note.visibility === "AUTHOR_PRIVATE"');
    expect(source).toContain("canSchedule={canSchedule}");
    expect(source).toContain(
      '(ownMembership && ownMembership.role !== "OBSERVER")',
    );
  });
});
