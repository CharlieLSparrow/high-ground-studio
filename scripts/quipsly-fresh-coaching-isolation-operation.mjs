#!/usr/bin/env node

import assert from "node:assert/strict";

import { loadFreshCoachingAcceptanceContext } from "./lib/coaching-acceptance-context.mjs";
import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";
import {
  assertNoHorizontalOverflow,
  clearRenderedSession,
  loadPlaywright,
  requireLoopbackOrigin,
  signInThroughRenderedLogin,
} from "./lib/retained-qa-browser.mjs";

assert.equal(
  process.env.QUIPSLY_FRESH_COACHING_ISOLATION_OPERATION,
  "1",
  "Set QUIPSLY_FRESH_COACHING_ISOLATION_OPERATION=1 to prove fresh-account tenant isolation.",
);

const baseURL = requireLoopbackOrigin(
  process.env.QUIPSLY_LOCAL_BASE_URL || "http://127.0.0.1:3012",
  "Fresh coaching isolation base URL",
);
const target = await loadFreshCoachingAcceptanceContext({ baseURL });
assert(
  target,
  "QUIPSLY_COACHING_ACCEPTANCE_CONTEXT is required; isolation must continue the exact fresh-user invitation journey.",
);
const neighborContextPath =
  process.env.QUIPSLY_COACHING_ACCEPTANCE_NEIGHBOR_CONTEXT;
assert(
  neighborContextPath,
  "QUIPSLY_COACHING_ACCEPTANCE_NEIGHBOR_CONTEXT is required; isolation needs a separately created control tenant.",
);
const neighbor = await loadFreshCoachingAcceptanceContext({
  baseURL,
  env: {
    ...process.env,
    QUIPSLY_COACHING_ACCEPTANCE_CONTEXT: neighborContextPath,
  },
});
assert(neighbor, "The adversarial neighboring coaching context is unavailable.");
assert.notEqual(neighbor.roomId, target.roomId);
assert.notEqual(neighbor.engagementId, target.engagementId);

const databaseURL = new URL(
  process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio",
);
assert(
  ["postgres:", "postgresql:"].includes(databaseURL.protocol) &&
    ["127.0.0.1", "localhost", "[::1]"].includes(databaseURL.hostname),
  "Fresh coaching isolation refuses non-loopback PostgreSQL.",
);
process.env.DATABASE_URL = databaseURL.toString();
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";

const { getPrismaClient } = await import("../apps/quipsly/src/lib/prisma.ts");
const { listAccessibleStudioProjectSummariesForEmail } = await import(
  "../apps/quipsly/src/lib/server/studio-project-access.ts"
);
const { coachingEngagementActorAccessWhere } = await import(
  "../apps/quipsly/src/lib/server/coaching-engagement.ts"
);
const { sessionActorAccessWhere } = await import(
  "../apps/quipsly/src/lib/server/session-access.ts"
);

const prisma = getPrismaClient();

function encodedPath(prefix, value) {
  return `${prefix}/${encodeURIComponent(value)}`;
}

function assertSubset(actual, expected, label) {
  for (const value of actual) {
    assert(
      expected.has(value),
      `${label} disclosed unauthorized identity ${value}.`,
    );
  }
}

function assertAbsent(value, forbidden, label) {
  for (const needle of forbidden.filter(Boolean)) {
    assert.equal(
      value.includes(needle),
      false,
      `${label} disclosed foreign content ${JSON.stringify(needle)}.`,
    );
  }
}

async function actorBoundary(identity) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: identity.userId },
    select: {
      id: true,
      primaryEmail: true,
      roles: { select: { role: true } },
    },
  });
  const roleNames = user.roles.map(({ role }) => String(role));
  const isStaff = roleNames.some((role) =>
    ["OWNER", "TEAM_SCHEDULER", "ADMIN", "STAFF"].includes(role),
  );
  assert.equal(
    isStaff,
    false,
    `${identity.role} fresh account unexpectedly inherited internal staff authority.`,
  );
  if (identity.role === "coach") {
    assert(
      roleNames.includes("COACH"),
      "Fresh coach setup did not retain the product-scoped COACH role.",
    );
  }

  const actor = {
    id: user.id,
    primaryEmail: user.primaryEmail,
    isStaff: false,
  };
  const projects = await listAccessibleStudioProjectSummariesForEmail(
    user.primaryEmail,
    prisma,
  );
  const rooms = await prisma.callRoom.findMany({
    where: sessionActorAccessWhere(actor),
    select: { id: true, title: true, purpose: true },
  });
  const engagements = await prisma.coachingEngagement.findMany({
    where: coachingEngagementActorAccessWhere(actor, "read"),
    select: { id: true, title: true },
  });

  return {
    identity,
    user,
    roleNames,
    projectIds: new Set(projects.map(({ id }) => id)),
    projectSlugs: new Set(projects.map(({ slug }) => slug)),
    roomIds: new Set(rooms.map(({ id }) => id)),
    engagementIds: new Set(engagements.map(({ id }) => id)),
  };
}

const boundaries = {
  coach: await actorBoundary(target.identities.coach),
  client: await actorBoundary(target.identities.client),
};

for (const boundary of Object.values(boundaries)) {
  assert(
    boundary.roomIds.has(target.roomId),
    `${boundary.identity.role} cannot see the Session intentionally shared by the invitation flow.`,
  );
  assert(
    boundary.engagementIds.has(target.engagementId),
    `${boundary.identity.role} cannot see the coaching relationship intentionally shared by the invitation flow.`,
  );
}

const accessibleProjectUnion = new Set([
  ...boundaries.coach.projectIds,
  ...boundaries.client.projectIds,
]);
const accessibleRoomUnion = new Set([
  ...boundaries.coach.roomIds,
  ...boundaries.client.roomIds,
]);
const accessibleEngagementUnion = new Set([
  ...boundaries.coach.engagementIds,
  ...boundaries.client.engagementIds,
]);

// Create the adversarial tenant through the same public product journey, then
// use direct reads only to select its exact private resources for negative
// authorization probes. This keeps the proof meaningful on a zero-state lab.
const neighborProjects = await listAccessibleStudioProjectSummariesForEmail(
  neighbor.identities.coach.email,
  prisma,
);
const neighborProject = neighborProjects.find(
  ({ id }) => !accessibleProjectUnion.has(id),
);
assert(
  neighborProject,
  "The independently created neighboring coach has no private Nest control case.",
);
const [foreignProject, foreignRoom, foreignEngagement] = await Promise.all([
  prisma.studioProject.findUnique({
    where: { id: neighborProject.id },
    select: { id: true, slug: true, name: true },
  }),
  prisma.callRoom.findUnique({
    where: { id: neighbor.roomId },
    select: { id: true, title: true, purpose: true },
  }),
  prisma.coachingEngagement.findUnique({
    where: { id: neighbor.engagementId },
    select: { id: true, title: true },
  }),
]);

assert(
  foreignProject && foreignRoom && foreignEngagement,
  "Isolation needs one independently created neighboring Nest, Session, and coaching relationship; an empty control case is not accepted.",
);
assert.equal(accessibleRoomUnion.has(foreignRoom.id), false);
assert.equal(accessibleEngagementUnion.has(foreignEngagement.id), false);

const foreignStrings = [
  foreignProject.id,
  foreignProject.slug,
  foreignProject.name,
  foreignRoom.id,
  foreignRoom.title,
  foreignEngagement.id,
  foreignEngagement.title,
];

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true });
const operated = {};

try {
  for (const [role, boundary] of Object.entries(boundaries)) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    try {
      const password = readRetainedQAPassword({
        service: target.keychainService,
        account: boundary.identity.email,
      });
      assert(password, `${role} fresh-account Keychain password is unavailable.`);
      await signInThroughRenderedLogin({
        page,
        baseURL,
        identity: boundary.identity,
        password,
        callbackPath: "/projects",
      });

      const projectsResponse = await page.goto(`${baseURL}/projects`, {
        waitUntil: "domcontentloaded",
      });
      assert.equal(projectsResponse?.status(), 200);
      await page
        .getByRole("heading", {
          name: "Nests hold the work. Documents hold the text.",
          exact: true,
        })
        .waitFor({ timeout: 30_000 });
      await assertNoHorizontalOverflow(
        page.locator("main").last(),
        `${role} isolated Nest index at phone width`,
      );
      const projectHrefs = await page.locator('a[href^="/nests/"]').evaluateAll(
        (links) => links.map((link) => link.getAttribute("href") || ""),
      );
      const renderedProjectSlugs = new Set(
        projectHrefs
          .map((href) => href.split("?")[0].split("/")[2] || "")
          .map((slug) => decodeURIComponent(slug))
          .filter(Boolean),
      );
      assertSubset(
        renderedProjectSlugs,
        boundary.projectSlugs,
        `${role} rendered Nest index`,
      );
      assert.equal(
        renderedProjectSlugs.has(foreignProject.slug),
        false,
        `${role} Nest index linked a neighboring private Nest.`,
      );
      assertAbsent(
        await page.locator("main").last().innerText(),
        [foreignProject.name],
        `${role} rendered Nest index`,
      );

      const sessionListResponse = await context.request.get(
        `${baseURL}/api/mobile/capture/sessions`,
      );
      assert.equal(sessionListResponse.status(), 200);
      const sessionList = await sessionListResponse.json();
      assert.equal(sessionList?.ok, true);
      assert.equal(
        sessionList?.user?.isStaff,
        false,
        `${role} Capture projection unexpectedly treated the account as internal staff.`,
      );
      const projectedRoomIds = new Set(
        (sessionList.sessions || []).map((room) => room.callRoomId || room.id),
      );
      const projectedProjectIds = new Set(
        (sessionList.captureProjects || []).map((project) => project.id),
      );
      const projectedEngagementIds = new Set(
        (sessionList.coachingEngagements || []).map(
          (engagement) => engagement.id,
        ),
      );
      assertSubset(
        projectedRoomIds,
        boundary.roomIds,
        `${role} Capture Session feed`,
      );
      assertSubset(
        projectedProjectIds,
        boundary.projectIds,
        `${role} Capture project picker`,
      );
      assertSubset(
        projectedEngagementIds,
        boundary.engagementIds,
        `${role} Capture coaching picker`,
      );
      assert(
        projectedRoomIds.has(target.roomId),
        `${role} Capture feed omitted the intentionally shared coaching Session.`,
      );
      assert.equal(
        [...(sessionList.sessions || [])].some(
          (room) => String(room.purpose).toUpperCase() === "PODCAST",
        ),
        false,
        `${role} fresh coaching feed included an unrelated podcast Session.`,
      );
      assertAbsent(
        JSON.stringify(sessionList),
        foreignStrings,
        `${role} Capture Session response`,
      );

      const sessionsPageResponse = await page.goto(
        `${baseURL}/coaching/sessions`,
        { waitUntil: "domcontentloaded" },
      );
      assert.equal(sessionsPageResponse?.status(), 200);
      await page
        .getByText(target.sessionTitle, { exact: false })
        .first()
        .waitFor({ timeout: 30_000 });
      await assertNoHorizontalOverflow(
        page.locator("main").last(),
        `${role} isolated Session index at phone width`,
      );
      assertAbsent(
        await page.locator("main").last().innerText(),
        [foreignRoom.title, foreignEngagement.title],
        `${role} rendered Session index`,
      );

      const directChecks = [
        {
          label: "foreign Nest page",
          url: `${baseURL}${encodedPath("/nests", foreignProject.slug)}`,
          expectedStatus: 404,
          permittedRequestEchoes: [foreignProject.slug],
        },
        {
          label: "foreign Session page",
          url: `${baseURL}${encodedPath("/sessions", foreignRoom.id)}`,
          expectedStatus: 404,
          permittedRequestEchoes: [foreignRoom.id],
        },
        {
          label: "foreign coaching page",
          url: `${baseURL}${encodedPath("/coaching/engagements", foreignEngagement.id)}`,
          expectedStatus: 404,
          permittedRequestEchoes: [foreignEngagement.id],
        },
        {
          label: "foreign Nest source API",
          url: `${baseURL}/api/nests/${encodeURIComponent(foreignProject.slug)}/source-story`,
          expectedStatus: 404,
          permittedRequestEchoes: [foreignProject.slug],
        },
        {
          label: "foreign Session context API",
          url: `${baseURL}/api/mobile/capture/sessions/context?callRoomId=${encodeURIComponent(foreignRoom.id)}`,
          expectedStatus: 404,
          permittedRequestEchoes: [foreignRoom.id],
        },
        {
          label: "foreign coaching work API",
          url: `${baseURL}/api/coaching/engagements/${encodeURIComponent(foreignEngagement.id)}/work`,
          expectedStatus: 404,
          permittedRequestEchoes: [foreignEngagement.id],
        },
      ];
      for (const check of directChecks) {
        const response = await context.request.get(check.url);
        assert.equal(
          response.status(),
          check.expectedStatus,
          `${role} ${check.label} returned HTTP ${response.status()} instead of an indistinguishable not-found boundary.`,
        );
        assertAbsent(
          await response.text(),
          foreignStrings.filter(
            (value) => !check.permittedRequestEchoes.includes(value),
          ),
          `${role} ${check.label}`,
        );
      }

      operated[role] = {
        isStaff: false,
        accessibleProjectCount: boundary.projectIds.size,
        accessibleRoomCount: boundary.roomIds.size,
        accessibleEngagementCount: boundary.engagementIds.size,
        renderedProjectCount: renderedProjectSlugs.size,
        captureSessionCount: projectedRoomIds.size,
        directUnauthorizedBoundariesRefused: directChecks.length,
        sharedTargetRoomVisible: true,
        unrelatedPodcastVisible: false,
        phoneWidthOverflow: false,
      };
    } finally {
      await clearRenderedSession(page, baseURL, `fresh ${role} isolation`).catch(
        () => undefined,
      );
      await context.close();
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        localOnly: true,
        testLane: target.testLane,
        fixtureIdentifiersUsed: target.fixtureIdentifiersUsed,
        humanAcceptanceSatisfied: false,
        contextPath: target.contextPath,
        roomId: target.roomId,
        engagementId: target.engagementId,
        coachAndClientIsolationOperated: true,
        foreignProjectRefused: true,
        foreignSessionRefused: true,
        foreignEngagementRefused: true,
        normalNavigationLeakageObserved: false,
        directUrlLeakageObserved: false,
        directApiLeakageObserved: false,
        unrelatedPodcastLeakageObserved: false,
        privateTestArtifactLeakageObserved: false,
        operated,
        adversarialNeighbor: {
          projectPurpose: "known inaccessible Nest",
          sessionPurpose: foreignRoom.purpose,
          engagementPurpose: "known inaccessible coaching relationship",
          rawIdentifiersWrittenToReceipt: false,
        },
        boundaries: {
          productAuthenticationUsed: true,
          productListsAndPagesOperated: true,
          databaseUsedForReadbackAndAdversarialTargetSelectionOnly: true,
          directDatabaseWrites: false,
          adversarialNeighborCreatedThroughRenderedProduct: true,
          foreignContentNamesOmittedFromReceipt: true,
          externalSideEffects: false,
          humanNoviceAcceptanceProven: false,
        },
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
  await prisma.$disconnect();
}
