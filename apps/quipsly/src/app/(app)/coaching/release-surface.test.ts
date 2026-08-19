import { readFileSync } from "node:fs";
import { join } from "node:path";

const coachingRoot = join(process.cwd(), "src/app/(app)/coaching");
const shippingSurfaces = [
  join(coachingRoot, "page.tsx"),
  join(coachingRoot, "sessions/page.tsx"),
];

describe("coaching release surfaces", () => {
  it("does not leak retained people, Episodes, or reviewer shortcuts into the ordinary journey", () => {
    const source = shippingSurfaces.map((path) => readFileSync(path, "utf8")).join("\n");

    expect(source).not.toMatch(/\bHomer\b|\bCharlie\b|High Ground Odyssey Episode|reviewer-capture@dev\.test|Reviewer preset/);
  });

  it("defaults the Coaching Session planner to coaching rather than podcast fixtures", () => {
    const source = readFileSync(join(coachingRoot, "sessions/page.tsx"), "utf8");

    expect(source).toContain('purpose: "COACHING"');
    expect(source).not.toContain('purpose: "PODCAST",');
  });
});
