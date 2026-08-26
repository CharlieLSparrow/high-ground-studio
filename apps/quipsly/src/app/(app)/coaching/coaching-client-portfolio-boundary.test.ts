import fs from "node:fs";
import path from "node:path";

describe("coaching client portfolio boundaries", () => {
  it("projects only actor-readable engagements and shared relationship work", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/(app)/coaching/engagements/page.tsx"),
      "utf8",
    );

    expect(source).toContain(
      'coachingEngagementActorAccessWhere(session.user, "read")',
    );
    expect(source).toContain(
      'sourceJson: { path: ["visibility"], equals: "engagement-shared" }',
    );
    expect(source).toContain(
      '{ visibility: { in: ["SESSION_SHARED", "CLIENT_SAFE"] } }',
    );
    expect(source).toContain("{ authorUserId: session.user.id }");
  });

  it("keeps draft follow-up actions coach-only and client creation actions role-bound", () => {
    const portfolio = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/(app)/coaching/engagements/page.tsx"),
      "utf8",
    );
    const layout = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/(app)/coaching/layout.tsx"),
      "utf8",
    );

    expect(portfolio).toContain("session.user.isStaff || actorMembership?.role === \"COACH\"");
    expect(portfolio).toContain(": coachView && followUpRoom");
    expect(portfolio).toContain('output.status === "RELEASED"');
    expect(portfolio).toContain("followUpCount: coachView ? followUpRooms.length : 0");
    expect(portfolio).toContain("const canSchedule = Boolean(");
    expect(portfolio).toContain("{canSchedule ? (");
    expect(layout).toContain("<CoachingSuiteNav canSchedule={canSchedule} />");
    expect(layout).toContain('role: "COACH"');
  });
});
