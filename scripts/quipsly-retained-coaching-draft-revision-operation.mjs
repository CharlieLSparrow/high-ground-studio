#!/usr/bin/env node

import { lstatSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";
import {
  assertNoHorizontalOverflow,
  clearRenderedSession,
  loadPlaywright,
  requireLoopbackOrigin,
  signInThroughRenderedLogin,
} from "./lib/retained-qa-browser.mjs";

const requireFromQuipsly = createRequire(
  new URL("../apps/quipsly/package.json", import.meta.url),
);
const { PrismaClient } = requireFromQuipsly("@prisma/client");
const { PrismaPg } = requireFromQuipsly("@prisma/adapter-pg");

const KEYCHAIN_SERVICE = "com.quipsly.qa.retained-coaching";
const ROOM_ID = "retained-coaching-follow-up-20260731";
const COACH_EMAIL = "quipsly-coach-retained-20260731@example.test";
const CLIENT_EMAIL = "quipsly-client-retained-20260731@example.test";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function requireLoopbackDatabaseUrl(value) {
  const url = new URL(String(value || ""));
  assert(
    url.protocol === "postgresql:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      Boolean(url.pathname.slice(1)),
    "Draft-revision operation requires an explicit loopback PostgreSQL database.",
  );
  return url.toString();
}

function stamp() {
  return new Date().toISOString().replace(/[-:.]/g, "").replace("Z", "Z");
}

function draftSelector(title) {
  return {
    roomId: ROOM_ID,
    kind: "CLIENT_FOLLOW_UP",
    status: "DRAFT",
    title,
  };
}

function retainedPassword(identity) {
  const store = String(
    process.env.QUIPSLY_RETAINED_COACHING_CREDENTIAL_STORE || "keychain",
  )
    .trim()
    .toLowerCase();
  if (store === "keychain") {
    return readRetainedQAPassword({
      service: KEYCHAIN_SERVICE,
      account: identity.email,
    });
  }
  assert(
    store === "temporary",
    "Credential store must be temporary or keychain.",
  );
  const configuredDirectory = String(
    process.env.QUIPSLY_RETAINED_COACHING_CREDENTIAL_DIRECTORY || "",
  ).trim();
  assert(
    configuredDirectory,
    "Temporary retained credential directory is required.",
  );
  const directory = path.resolve(configuredDirectory);
  assert(
    path.isAbsolute(directory),
    "Temporary retained credential directory must be absolute.",
  );
  const directoryInfo = lstatSync(directory);
  assert(
    directoryInfo.isDirectory() &&
      !directoryInfo.isSymbolicLink() &&
      directoryInfo.uid === process.getuid?.() &&
      (directoryInfo.mode & 0o077) === 0,
    "Temporary retained credential directory must be owner-only and cannot be a symlink.",
  );
  const credentialPath = path.join(directory, `${identity.role}.json`);
  const credentialInfo = lstatSync(credentialPath);
  assert(
    credentialInfo.isFile() &&
      !credentialInfo.isSymbolicLink() &&
      credentialInfo.uid === process.getuid?.() &&
      (credentialInfo.mode & 0o077) === 0,
    `Temporary ${identity.role} credential must be an owner-only regular file.`,
  );
  const credential = JSON.parse(readFileSync(credentialPath, "utf8"));
  assert(
    credential.email === identity.email,
    `Temporary ${identity.role} credential belongs to a different identity.`,
  );
  assert(
    typeof credential.password === "string" && credential.password.length >= 16,
    `Temporary ${identity.role} password is invalid.`,
  );
  return credential.password;
}

async function followUpSurface(page) {
  const heading = page.getByRole("heading", {
    name: "Client follow-up",
    exact: true,
  });
  await heading.waitFor({ timeout: 25_000 });
  return heading.locator("xpath=ancestor::section[1]");
}

async function captureSurface(surface, screenshotPath) {
  const page = surface.page();
  const viewport = page.viewportSize();
  const box = await surface.boundingBox();
  if (viewport && box && box.height + 240 > viewport.height) {
    await page.setViewportSize({
      width: viewport.width,
      height: Math.min(3_200, Math.ceil(box.height + 240)),
    });
  }
  await surface.scrollIntoViewIfNeeded();
  await surface.screenshot({ path: screenshotPath });
}

async function operateCoach({
  browser,
  baseURL,
  artifactDirectory,
  title,
  introV1,
  introV2,
}) {
  const identity = { role: "coach", email: COACH_EMAIL };
  const password = retainedPassword(identity);
  assert(password, "The retained coach Keychain password is unavailable.");
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1200 },
    colorScheme: "light",
    locale: "en-US",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  try {
    await signInThroughRenderedLogin({
      page,
      baseURL,
      identity,
      password,
      callbackPath: `/sessions/${ROOM_ID}?mode=outputs`,
    });
    const surface = await followUpSurface(page);
    await surface
      .getByRole("button", { name: "Prepare a new draft", exact: true })
      .waitFor();
    await surface.getByLabel("Title").fill(title);
    await surface.getByLabel("Opening note").fill(introV1);
    await surface
      .getByLabel("Bring into the next Session")
      .fill(
        "Review the client-selected commitment without changing its canonical identity.",
      );
    const selected = await surface
      .locator('input[type="checkbox"]:checked')
      .count();
    assert(
      selected > 0,
      "The retained coach surface did not preserve any reviewed client-safe selection.",
    );
    await surface
      .getByRole("button", { name: "Prepare a new draft", exact: true })
      .click();
    await surface
      .getByText(/Private draft created from the selected client-safe records/i)
      .waitFor({ timeout: 20_000 });
    await surface.getByText("Private coach draft", { exact: true }).waitFor();
    await surface.getByText(/Editing private revision 1\./i).waitFor();
    const artifact = surface.getByTestId("client-follow-up-artifact");
    await artifact.getByText(introV1, { exact: true }).waitFor();
    await assertNoHorizontalOverflow(surface, "coach revision 1");
    await captureSurface(
      surface,
      path.join(artifactDirectory, "coach-private-revision-1.png"),
    );

    await surface.getByLabel("Opening note").fill(introV2);
    await surface
      .getByRole("button", { name: "Save private draft changes", exact: true })
      .click();
    await surface
      .getByText(/Private draft revised with an immutable history entry/i)
      .waitFor({ timeout: 20_000 });
    await surface.getByText(/Editing private revision 2/i).waitFor();
    await artifact.getByText(introV2, { exact: true }).waitFor();
    assert(
      (await artifact.getByText(introV1, { exact: true }).count()) === 0,
      "The rendered artifact did not advance to the revised opening note.",
    );
    await assertNoHorizontalOverflow(surface, "coach revision 2");
    await captureSurface(
      surface,
      path.join(artifactDirectory, "coach-private-revision-2.png"),
    );
    assert(
      pageErrors.length === 0,
      `Coach draft revision raised ${pageErrors.length} browser exception(s).`,
    );
    await clearRenderedSession(page, baseURL, identity.role);
    return {
      role: identity.role,
      createdThroughRenderedProduct: true,
      revisedThroughRenderedProduct: true,
      visibleRevision: 2,
      browserExceptions: 0,
      sessionClear: "passed",
    };
  } finally {
    await context.close();
  }
}

async function verifyClient({
  browser,
  baseURL,
  artifactDirectory,
  draftTitle,
  releasedTitle,
}) {
  const identity = { role: "client", email: CLIENT_EMAIL };
  const password = retainedPassword(identity);
  assert(password, "The retained client Keychain password is unavailable.");
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: "light",
    locale: "en-US",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  try {
    await signInThroughRenderedLogin({
      page,
      baseURL,
      identity,
      password,
      callbackPath: `/sessions/${ROOM_ID}?mode=outputs`,
    });
    const surface = await followUpSurface(page);
    await surface
      .getByRole("heading", { name: releasedTitle, exact: true })
      .waitFor({ timeout: 20_000 });
    assert(
      (await surface.getByText(draftTitle, { exact: true }).count()) === 0,
      "Client learned the private draft title.",
    );
    assert(
      (await surface
        .getByText("Private coach draft", { exact: true })
        .count()) === 0,
      "Client received a private-draft state signal.",
    );
    await assertNoHorizontalOverflow(surface, "client private-draft denial");
    await captureSurface(
      surface,
      path.join(artifactDirectory, "client-released-artifact-only.png"),
    );
    assert(
      pageErrors.length === 0,
      `Client privacy readback raised ${pageErrors.length} browser exception(s).`,
    );
    await clearRenderedSession(page, baseURL, identity.role);
    return {
      role: identity.role,
      releasedArtifactVisible: true,
      privateDraftConcealed: true,
      browserExceptions: 0,
      sessionClear: "passed",
    };
  } finally {
    await context.close();
  }
}

async function readDraftEvidence(prisma, title) {
  const output = await prisma.sessionOutput.findFirstOrThrow({
    where: draftSelector(title),
    select: {
      id: true,
      revision: true,
      status: true,
      contentSha256: true,
      recipientUserId: true,
      revisions: {
        orderBy: { revision: "asc" },
        select: {
          id: true,
          revision: true,
          operation: true,
          snapshotJson: true,
        },
      },
      deliveries: { select: { id: true } },
    },
  });
  return output;
}

export async function main() {
  const baseURL = requireLoopbackOrigin(
    process.env.QUIPSLY_RETAINED_COACHING_BASE_URL || "http://127.0.0.1:3012",
    "QUIPSLY_RETAINED_COACHING_BASE_URL",
  );
  const databaseURL = requireLoopbackDatabaseUrl(process.env.DATABASE_URL);
  const artifactRoot =
    process.env.QUIPSLY_RETAINED_COACHING_DRAFT_ARTIFACT_ROOT ||
    "/Volumes/My Passport/Quipsly QA Artifacts/Coaching Draft Revisions";
  const runStamp = stamp();
  const artifactDirectory = path.join(artifactRoot, runStamp);
  const title = `QA private draft revision ${runStamp}`;
  const introV1 =
    "Private revision one: review this client-safe packet before release.";
  const introV2 =
    "Private revision two: wording adjusted by the coach before release.";
  await mkdir(artifactDirectory, { recursive: true });

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseURL }),
    log: ["error"],
  });
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  let createdOutputId = null;
  try {
    const [
      released,
      outputCountBefore,
      deliveryCountBefore,
      calendarCountBefore,
    ] = await Promise.all([
      prisma.sessionOutput.findFirstOrThrow({
        where: {
          roomId: ROOM_ID,
          kind: "CLIENT_FOLLOW_UP",
          status: "RELEASED",
        },
        orderBy: [{ releasedAt: "desc" }, { revision: "desc" }],
        select: { id: true, title: true, revision: true, contentSha256: true },
      }),
      prisma.sessionOutput.count(),
      prisma.deliveryEvent.count(),
      prisma.calendarEventLink.count(),
    ]);

    const coach = await operateCoach({
      browser,
      baseURL,
      artifactDirectory,
      title,
      introV1,
      introV2,
    });
    const draft = await readDraftEvidence(prisma, title);
    createdOutputId = draft.id;
    assert(
      draft.status === "DRAFT" && draft.revision === 2,
      "Database readback did not retain private revision 2.",
    );
    assert(
      draft.revisions.length === 2,
      "Private draft did not retain exactly two immutable revisions.",
    );
    assert(
      draft.revisions[0].operation === "DRAFT_CREATED" &&
        draft.revisions[0].revision === 1,
      "Revision 1 is not the immutable create event.",
    );
    assert(
      draft.revisions[1].operation === "DRAFT_UPDATED" &&
        draft.revisions[1].revision === 2,
      "Revision 2 is not the immutable update event.",
    );
    assert(
      draft.deliveries.length === 0,
      "Revising the private draft created a delivery event.",
    );
    const request = draft.revisions[1].snapshotJson?.request || {};
    assert(
      request.externalMessageSent === false,
      "Revision evidence claimed an external message.",
    );
    assert(
      request.providerCalendarMutated === false,
      "Revision evidence claimed a provider Calendar mutation.",
    );
    assert(
      request.publicationPerformed === false,
      "Revision evidence claimed a publication action.",
    );

    const client = await verifyClient({
      browser,
      baseURL,
      artifactDirectory,
      draftTitle: title,
      releasedTitle: released.title,
    });
    const [
      releasedAfter,
      deliveryCountAfter,
      calendarCountAfter,
      outputCountDuring,
    ] = await Promise.all([
      prisma.sessionOutput.findUniqueOrThrow({
        where: { id: released.id },
        select: { revision: true, contentSha256: true, status: true },
      }),
      prisma.deliveryEvent.count(),
      prisma.calendarEventLink.count(),
      prisma.sessionOutput.count(),
    ]);
    assert(
      releasedAfter.status === "RELEASED" &&
        releasedAfter.revision === released.revision &&
        releasedAfter.contentSha256 === released.contentSha256,
      "Private revision operation rewrote the retained released output.",
    );
    assert(
      deliveryCountAfter === deliveryCountBefore,
      "Private revision operation changed delivery evidence.",
    );
    assert(
      calendarCountAfter === calendarCountBefore,
      "Private revision operation changed Calendar evidence.",
    );
    assert(
      outputCountDuring === outputCountBefore + 1,
      "Private revision operation changed an unexpected Session output.",
    );

    await prisma.sessionOutput.delete({ where: { id: draft.id } });
    createdOutputId = null;
    const outputCountAfterCleanup = await prisma.sessionOutput.count();
    assert(
      outputCountAfterCleanup === outputCountBefore,
      "Exact private QA draft cleanup did not restore the output count.",
    );
    const receipt = {
      ok: true,
      localOnly: true,
      retainedAccounts: true,
      renderedProduct: true,
      artifactDirectory,
      screenshotsCaptured: 3,
      secretsPrinted: false,
      coach,
      client,
      databaseReadback: {
        status: draft.status,
        revision: draft.revision,
        revisionOperations: draft.revisions.map(
          (revision) => revision.operation,
        ),
        deliveryCount: draft.deliveries.length,
        contentSha256: draft.contentSha256,
      },
      boundaries: {
        releasedOutputMutated: false,
        externalDeliveryEventCreated: false,
        calendarEvidenceChanged: false,
        publicationPerformed: false,
        exactPrivateQADraftRemoved: true,
      },
    };
    await writeFile(
      path.join(artifactDirectory, "receipt.json"),
      `${JSON.stringify(receipt, null, 2)}\n`,
      { mode: 0o600 },
    );
    console.log(JSON.stringify(receipt, null, 2));
    return receipt;
  } finally {
    if (createdOutputId) {
      await prisma.sessionOutput.deleteMany({
        where: { id: createdOutputId, ...draftSelector(title) },
      });
    } else {
      await prisma.sessionOutput.deleteMany({ where: draftSelector(title) });
    }
    await browser.close();
    await prisma.$disconnect();
  }
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  await main();
}
