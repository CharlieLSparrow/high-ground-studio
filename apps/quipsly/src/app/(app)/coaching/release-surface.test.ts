import { readFileSync } from "node:fs";
import { join } from "node:path";

const coachingRoot = join(process.cwd(), "src/app/(app)/coaching");
const shippingSurfaces = [
  join(coachingRoot, "page.tsx"),
  join(coachingRoot, "sessions/page.tsx"),
  join(coachingRoot, "engagements/[engagementId]/page.tsx"),
  join(process.cwd(), "src/components/coaching-engagement-workspace.tsx"),
];

describe("coaching release surfaces", () => {
  it("does not leak retained people, Episodes, or reviewer shortcuts into the ordinary journey", () => {
    const source = shippingSurfaces
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");

    expect(source).not.toMatch(
      /\bHomer\b|\bCharlie\b|High Ground Odyssey Episode|reviewer-capture@dev\.test|Reviewer preset/,
    );
  });

  it("defaults the Coaching Session planner to coaching rather than podcast fixtures", () => {
    const source = readFileSync(
      join(coachingRoot, "sessions/page.tsx"),
      "utf8",
    );

    expect(source).toContain('purpose: "COACHING"');
    expect(source).not.toContain('purpose: "PODCAST",');
  });

  it("carries the coach timezone into the ordinary appointment form and request", () => {
    const source = readFileSync(join(coachingRoot, "page.tsx"), "utf8");
    const compact = source.replace(/\s+/g, " ");

    expect(source).toMatch(
      /timezone:\s*payload\.user\?\.isStaff\s*\?\s*current\.timezone\s*:\s*payload\.coaches\?\.\[0\]\?\.timezone\s*\|\|\s*current\.timezone/,
    );
    expect(source).toContain(
      "timezone: setupForm.timezone || current.timezone",
    );
    expect(source).toContain("value={createForm.timezone}");
    expect(compact).toContain("The time above uses");
    expect(compact).toContain(
      "Both people will see the timezone with the appointment.",
    );
    expect(compact).toContain("Advanced appointment options");
    expect(compact).toContain("Schedule and create the private Session");
  });

  it("keeps operator evidence out of the ordinary coach journey and preserves durable session actions", () => {
    const source = readFileSync(join(coachingRoot, "page.tsx"), "utf8");
    const compact = source.replace(/\s+/g, " ");

    expect(source).toContain("Operations and provider diagnostics");
    expect(compact).toContain(
      "This is not part of the coach or client acceptance journey.",
    );
    expect(source).toContain("const isStaff = runway?.user?.isStaff === true");
    expect(source).toContain("href={booking.liveSessionPath}");
    expect(source).toContain("href={booking.engagementPath}");
    expect(source).toContain("?mode=transcript");
    expect(source).toContain("?mode=outputs");
  });

  it("guides coaches and clients through the real job instead of a fixture or data-model walkthrough", () => {
    const source = readFileSync(join(coachingRoot, "page.tsx"), "utf8");
    const compact = source.replace(/\s+/g, " ");

    expect(source).toContain("const isCoachingClient = Boolean(");
    expect(source).toContain(
      "const isClientOnly = isCoachingClient && !canManageCoaching",
    );
    expect(source).toContain("const journeyAction = (() => {");
    expect(source).toContain("{!isClientOnly ? (");
    expect(compact).toContain("Schedule your first coaching session");
    expect(compact).toContain("Schedule and invite");
    expect(compact).toContain("Open my session");
    expect(compact).toContain("Use the follow-up");
    expect(compact).toContain("Session workspaces");
    expect(compact).not.toContain(
      "create a booking/hold path that writes to Quipsly-owned records",
    );
    expect(compact).not.toContain(
      "The iOS capture app can only become calm once a room exists",
    );
  });

  it("labels retained browser operation as regression evidence instead of human acceptance", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "../../scripts/quipsly-retained-coaching-engagement-browser-operation.mjs",
      ),
      "utf8",
    );

    expect(source).toContain('testLane: "retained-regression"');
    expect(source).toContain("humanAcceptanceSatisfied: false");
    expect(source).toContain("fixtureIdentifiersUsed: true");
  });
});
