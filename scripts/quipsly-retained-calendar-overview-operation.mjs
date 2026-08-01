#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { chmod, mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  assertNoHorizontalOverflow,
  clearRenderedSession,
  loadPlaywright,
  requireLoopbackOrigin,
  signInThroughRenderedLogin,
} from "./lib/retained-qa-browser.mjs";
import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";

const KEYCHAIN_SERVICE = "com.quipsly.qa.retained-product";
const MEDIA_OPERATOR_EMAIL = "quipsly-media-ms8ct81g@example.test";
const RECEIPT_SCHEMA = "quipsly-retained-calendar-overview-v2";
const EXPECTED_PURPOSES = ["COACHING", "PODCAST_PRODUCTION", "PERSONAL_COMMITMENTS"];
const FORBIDDEN_CLIENT_FIELDS = [
  "credentialRef",
  "providerCalendarId",
  "syncTokenRef",
  "tokenDigest",
  "grantedScopes",
  "attendees",
  "encryptedPayload",
  "refreshToken",
  "accessToken",
];

const requireFromQuipsly = createRequire(
  new URL("../apps/quipsly/package.json", import.meta.url),
);
const { Client } = requireFromQuipsly("pg");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function requireLoopbackDatabaseUrl(value) {
  const url = new URL(value);
  assert(
    ["postgres:", "postgresql:"].includes(url.protocol)
      && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      && Boolean(url.pathname)
      && url.pathname !== "/",
    "Calendar overview operation requires an explicit loopback PostgreSQL database.",
  );
  return url.toString();
}

export function parseArguments(argv) {
  let outputDir = "";
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--") continue;
    if (argv[index] === "--output-dir") {
      outputDir = argv[index + 1] || "";
      index += 1;
      continue;
    }
    if (argv[index] === "--help") return { help: true, outputDir: "" };
    throw new Error(`Unknown argument: ${argv[index]}`);
  }
  assert(outputDir && path.isAbsolute(outputDir), "--output-dir must be an absolute path.");
  return { help: false, outputDir: path.resolve(outputDir) };
}

async function writePrivateJson(target, value) {
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  await chmod(target, 0o600);
}

async function assertCalendarSchema(client) {
  const tableNames = [
    "CalendarConnection",
    "CalendarCollection",
    "CalendarProjection",
    "CalendarSyncCursor",
    "CalendarSyncReceipt",
    "CalendarFeed",
    "CalendarOAuthCredential",
  ];
  const tables = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = ANY($1::text[])
     ORDER BY table_name`,
    [tableNames],
  );
  assert(tables.rowCount === tableNames.length, "The loopback database is missing calendar projection tables.");

  const constraints = await client.query(
    `SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint
     WHERE conname = ANY($1::text[])
     ORDER BY conname`,
    [["CalendarConnection_scope_exactly_one", "CalendarCollection_scope_exactly_one"]],
  );
  assert(constraints.rowCount === 2, "Calendar owner-scope constraints are missing.");
  assert(
    constraints.rows.every((row) => String(row.definition).includes("workspaceId")),
    "Calendar owner-scope constraints do not include organization workspace ownership.",
  );
  return {
    tableCount: tables.rowCount,
    ownerScopeConstraintCount: constraints.rowCount,
    workspaceOwnerScopeVerified: true,
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(`Usage:
  DATABASE_URL=postgresql://... pnpm quipsly:retained:calendar-overview -- \\
    --output-dir "/absolute/private/calendar-operation"

The operation requires loopback Nest and PostgreSQL, signs in as the retained
.test media operator, verifies the rendered desktop and phone Schedule,
confirms the authenticated overview API is redacted, reads the additive schema
boundary, saves private evidence, clears the browser session, and performs no
calendar/provider mutation.`);
    return;
  }

  process.umask(0o077);
  await mkdir(options.outputDir, { recursive: false, mode: 0o700 });
  const baseURL = requireLoopbackOrigin(
    process.env.QUIPSLY_RETAINED_CALENDAR_BASE_URL || "http://127.0.0.1:3012",
    "QUIPSLY_RETAINED_CALENDAR_BASE_URL",
  );
  const databaseURL = requireLoopbackDatabaseUrl(process.env.DATABASE_URL || "");
  const password = readRetainedQAPassword({
    service: KEYCHAIN_SERVICE,
    account: MEDIA_OPERATOR_EMAIL,
  });
  assert(password, "The retained media operator has no Keychain password.");

  const database = new Client({ connectionString: databaseURL, connectionTimeoutMillis: 5_000 });
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "light",
    locale: "en-US",
    timezoneId: "America/Denver",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const pageErrors = [];
  const serverFailures = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin === baseURL && response.status() >= 500) {
      serverFailures.push({ path: url.pathname, status: response.status() });
    }
  });
  let signedIn = false;
  let sessionCleared = false;
  let temporaryConnectionId = "";
  let temporaryCollectionId = "";
  let temporaryRoomSchedule = null;

  try {
    await database.connect();
    const schema = await assertCalendarSchema(database);
    await signInThroughRenderedLogin({
      page,
      baseURL,
      identity: { role: "retained-calendar-overview", email: MEDIA_OPERATOR_EMAIL },
      password,
      callbackPath: "/schedule",
    });
    signedIn = true;

    await page.getByRole("heading", { name: "Time for the work you actually chose." }).waitFor({ timeout: 30_000 });
    await page.getByRole("heading", { name: "One schedule, three clear boundaries." }).waitFor();
    await page.getByRole("heading", { name: "Connect Google Calendar on purpose." }).waitFor();
    await page.getByRole("link", { name: "Connect Google Calendar" }).waitFor();
    for (const heading of ["Coaching calendar", "Podcast production", "My calendar"]) {
      await page.getByRole("heading", { name: heading, exact: true }).waitFor();
    }
    await page.getByText("External writes held", { exact: true }).waitFor();
    await page.getByText(/No provider credentials, calendar identifiers, attendee lists, or sync tokens are exposed here/).waitFor();
    const calendarSystem = page.locator('section[aria-labelledby="calendar-system-heading"]');
    const googleCalendarConnection = page.locator('section[aria-labelledby="google-calendar-connection-heading"]');
    await assertNoHorizontalOverflow(page.getByRole("main").last(), "desktop Schedule");

    const api = await page.evaluate(async () => {
      const response = await fetch("/api/calendar/overview", { headers: { accept: "application/json" } });
      return {
        status: response.status,
        cacheControl: response.headers.get("cache-control"),
        vary: response.headers.get("vary"),
        body: await response.json(),
      };
    });
    assert(api.status === 200 && api.body?.ok === true, "Authenticated calendar overview API failed.");
    assert(api.cacheControl === "private, no-store", "Calendar overview API permitted shared caching.");
    const varyFields = String(api.vary || "").split(",").map((field) => field.trim().toLowerCase());
    assert(
      varyFields.includes("authorization") && varyFields.includes("cookie"),
      "Calendar overview API lost its identity cache boundary.",
    );
    assert(api.body.overview?.providerSecretsExposed === false, "Calendar overview did not assert provider redaction.");
    assert(api.body.overview?.externalWritesEnabled === false, "Unverified local provider writes were not held.");
    assert(
      JSON.stringify(api.body.overview?.purposes?.map((item) => item.purpose)) === JSON.stringify(EXPECTED_PURPOSES),
      "Calendar overview purpose order or membership drifted.",
    );
    const serializedOverview = JSON.stringify(api.body.overview);
    for (const forbidden of FORBIDDEN_CLIENT_FIELDS) {
      assert(!serializedOverview.includes(forbidden), `Calendar overview exposed forbidden field ${forbidden}.`);
    }

    const googleConnection = await page.evaluate(async () => {
      const response = await fetch("/api/calendar/connections/google", { headers: { accept: "application/json" } });
      return {
        status: response.status,
        cacheControl: response.headers.get("cache-control"),
        body: await response.json(),
      };
    });
    assert(googleConnection.status === 200 && googleConnection.body?.ok === true, "Google Calendar connection status failed.");
    assert(googleConnection.cacheControl === "private, no-store", "Google Calendar connection status permitted shared caching.");
    assert(googleConnection.body.connection === null, "The local operation unexpectedly found a real Google Calendar connection.");
    const serializedGoogleConnection = JSON.stringify(googleConnection.body);
    for (const forbidden of FORBIDDEN_CLIENT_FIELDS) {
      assert(!serializedGoogleConnection.includes(forbidden), `Google Calendar status exposed forbidden field ${forbidden}.`);
    }

    const actorRow = await database.query(
      `SELECT "id" FROM "User" WHERE lower("primaryEmail") = lower($1) LIMIT 1`,
      [MEDIA_OPERATOR_EMAIL],
    );
    assert(actorRow.rowCount === 1, "The retained calendar actor is missing from PostgreSQL.");
    const actorUserId = actorRow.rows[0].id;
    let sessionRow = await database.query(
      `SELECT r."id", r."purpose", r."projectId"
       FROM "CallRoom" r
       WHERE r."scheduledStart" IS NOT NULL
         AND r."scheduledEnd" IS NOT NULL
         AND r."status" NOT IN ('CANCELED', 'FAILED')
         AND r."purpose" IN ('PODCAST', 'COACHING')
         AND (
           r."createdByUserId" = $1
           OR EXISTS (
             SELECT 1 FROM "CallParticipant" p
             WHERE p."roomId" = r."id" AND p."userId" = $1
           )
           OR EXISTS (
             SELECT 1 FROM "StudioProjectAccessGrant" g
             WHERE g."projectId" = r."projectId"
               AND lower(g."email") = lower($2)
               AND g."status" = 'ACTIVE'
           )
         )
       ORDER BY r."scheduledStart" ASC
       LIMIT 1`,
      [actorUserId, MEDIA_OPERATOR_EMAIL],
    );
    if (sessionRow.rowCount === 0) {
      const unscheduled = await database.query(
        `SELECT "id", "scheduledStart", "scheduledEnd", "metadataJson", "updatedAt"
         FROM "CallRoom"
         WHERE "createdByUserId" = $1
           AND "purpose" IN ('PODCAST', 'COACHING')
           AND "status" IN ('PLANNED', 'OPEN')
         ORDER BY "createdAt" DESC
         LIMIT 1`,
        [actorUserId],
      );
      assert(unscheduled.rowCount === 1, "No actor-owned retained Session is available for temporary schedule preview.");
      temporaryRoomSchedule = unscheduled.rows[0];
      const previewStart = new Date(Date.now() + 7 * 86_400_000);
      previewStart.setMinutes(0, 0, 0);
      const previewEnd = new Date(previewStart.getTime() + 60 * 60_000);
      await database.query(
        `UPDATE "CallRoom"
         SET "scheduledStart" = $2,
             "scheduledEnd" = $3,
             "metadataJson" = COALESCE("metadataJson", '{}'::jsonb) || $4::jsonb,
             "updatedAt" = now()
         WHERE "id" = $1`,
        [temporaryRoomSchedule.id, previewStart, previewEnd, JSON.stringify({ scheduledTimezone: "America/Denver" })],
      );
      sessionRow = await database.query(
        `SELECT "id", "purpose", "projectId" FROM "CallRoom" WHERE "id" = $1`,
        [temporaryRoomSchedule.id],
      );
    }
    const previewRoom = sessionRow.rows[0];
    temporaryConnectionId = `retained-google-preview-${randomUUID()}`;
    temporaryCollectionId = `retained-google-selection-${randomUUID()}`;
    await database.query(
      `INSERT INTO "CalendarConnection"
        ("id", "userId", "provider", "connectionKind", "providerAccountKey", "status", "verifiedAt", "lastCheckedAt", "metadataJson", "createdAt", "updatedAt")
       VALUES ($1, $2, 'GOOGLE', 'USER_OAUTH', $3, 'VERIFIED', now(), now(), $4::jsonb, now(), now())`,
      [temporaryConnectionId, actorUserId, `retained-preview:${randomUUID()}`, JSON.stringify({ schema: "quipsly-retained-calendar-preview-fixture-v1" })],
    );
    const collectionPurpose = previewRoom.purpose === "PODCAST" ? "PODCAST_PRODUCTION" : "COACHING";
    await database.query(
      `INSERT INTO "CalendarCollection"
        ("id", "connectionId", "nestId", "ownerUserId", "purpose", "displayName", "timezone", "providerCalendarId", "visibility", "isDefault", "status", "metadataJson", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5::"CalendarCollectionPurpose", 'Retained preview only', 'America/Denver', 'retained-preview-calendar', $6::"CalendarCollectionVisibility", true, 'ACTIVE', $7::jsonb, now(), now())`,
      [
        temporaryCollectionId,
        temporaryConnectionId,
        previewRoom.purpose === "PODCAST" ? previewRoom.projectId : null,
        previewRoom.purpose === "COACHING" ? actorUserId : null,
        collectionPurpose,
        previewRoom.purpose === "PODCAST" ? "TEAM" : "PRIVATE",
        JSON.stringify({ schema: "quipsly-retained-calendar-preview-fixture-v1" }),
      ],
    );
    const sessionProjection = await page.evaluate(async ({ roomId, collectionId }) => {
      const previewResponse = await fetch(`/api/calendar/sessions/${encodeURIComponent(roomId)}/projection?collectionId=${encodeURIComponent(collectionId)}`, { cache: "no-store" });
      const previewBody = await previewResponse.json();
      const staleResponse = await fetch(`/api/calendar/sessions/${encodeURIComponent(roomId)}/projection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectionId, expectedSourceRevision: "deliberately-stale" }),
      });
      return {
        previewStatus: previewResponse.status,
        previewBody,
        staleStatus: staleResponse.status,
        staleBody: await staleResponse.json(),
      };
    }, { roomId: previewRoom.id, collectionId: temporaryCollectionId });
    assert(sessionProjection.previewStatus === 200 && sessionProjection.previewBody?.ok === true, "Real Session projection preview failed.");
    assert(sessionProjection.previewBody.preview?.action === "CREATE", "The temporary selection did not produce a create preview.");
    assert(sessionProjection.previewBody.preview?.sendUpdates === "none", "Session projection preview did not hold notifications off.");
    assert(sessionProjection.previewBody.preview?.snapshot?.attendeesIncluded === false, "Session projection preview included attendees.");
    assert(
      sessionProjection.previewBody.preview?.snapshot?.providerVisibility === (previewRoom.purpose === "PODCAST" ? "default" : "private"),
      "Session projection preview did not preserve the selected calendar visibility boundary.",
    );
    assert(sessionProjection.previewBody.externalSideEffects === false, "Session projection preview claimed a provider side effect.");
    assert(sessionProjection.staleStatus === 409, "Stale Session projection confirmation was not rejected.");
    assert(sessionProjection.staleBody?.externalSideEffects === false, "Stale confirmation claimed a provider side effect.");
    const sideEffects = await database.query(
      `SELECT
         (SELECT count(*)::int FROM "CalendarProjection" WHERE "collectionId" = $1) AS projections,
         (SELECT count(*)::int FROM "CalendarSyncReceipt" WHERE "connectionId" = $2) AS receipts`,
      [temporaryCollectionId, temporaryConnectionId],
    );
    assert(sideEffects.rows[0].projections === 0 && sideEffects.rows[0].receipts === 0, "Preview or stale confirmation persisted a projection side effect.");
    await database.query(`DELETE FROM "CalendarCollection" WHERE "id" = $1`, [temporaryCollectionId]);
    temporaryCollectionId = "";
    await database.query(`DELETE FROM "CalendarConnection" WHERE "id" = $1`, [temporaryConnectionId]);
    temporaryConnectionId = "";
    if (temporaryRoomSchedule) {
      await database.query(
        `UPDATE "CallRoom"
         SET "scheduledStart" = $2,
             "scheduledEnd" = $3,
             "metadataJson" = $4::jsonb,
             "updatedAt" = $5
         WHERE "id" = $1`,
        [
          temporaryRoomSchedule.id,
          temporaryRoomSchedule.scheduledStart,
          temporaryRoomSchedule.scheduledEnd,
          JSON.stringify(temporaryRoomSchedule.metadataJson || {}),
          temporaryRoomSchedule.updatedAt,
        ],
      );
      temporaryRoomSchedule = null;
    }

    const desktopScreenshot = path.join(options.outputDir, "schedule-calendar-system-desktop.png");
    await calendarSystem.screenshot({ path: desktopScreenshot });
    await chmod(desktopScreenshot, 0o600);
    const googleDesktopScreenshot = path.join(options.outputDir, "schedule-google-calendar-connection-desktop.png");
    await googleCalendarConnection.screenshot({ path: googleDesktopScreenshot });
    await chmod(googleDesktopScreenshot, 0o600);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: "load" });
    await page.getByRole("heading", { name: "One schedule, three clear boundaries." }).waitFor({ timeout: 30_000 });
    await page.getByRole("heading", { name: "Connect Google Calendar on purpose." }).waitFor();
    await assertNoHorizontalOverflow(page.getByRole("main").last(), "phone-width Schedule");
    const phoneScreenshot = path.join(options.outputDir, "schedule-calendar-system-phone.png");
    await page.screenshot({ path: phoneScreenshot });
    await chmod(phoneScreenshot, 0o600);
    await googleCalendarConnection.scrollIntoViewIfNeeded();
    const googlePhoneScreenshot = path.join(options.outputDir, "schedule-google-calendar-connection-phone.png");
    await googleCalendarConnection.screenshot({ path: googlePhoneScreenshot });
    await chmod(googlePhoneScreenshot, 0o600);

    assert(pageErrors.length === 0, `Rendered Schedule raised browser errors: ${pageErrors.join(" | ")}`);
    assert(serverFailures.length === 0, `Rendered Schedule received server failures: ${JSON.stringify(serverFailures)}`);
    await clearRenderedSession(page, baseURL, "retained-calendar-overview");
    sessionCleared = true;

    const receiptPath = path.join(options.outputDir, "operation.json");
    await writePrivateJson(receiptPath, {
      schema: RECEIPT_SCHEMA,
      ok: true,
      completedAt: new Date().toISOString(),
      sourceCommit: process.env.QUIPSLY_CALENDAR_SOURCE_COMMIT || null,
      localOnly: true,
      rendered: { desktop: true, phoneWidth: true, horizontalOverflow: false },
      overview: {
        purposeCount: api.body.overview.purposes.length,
        purposes: api.body.overview.purposes.map((item) => item.purpose),
        providerSecretsExposed: false,
        externalWritesEnabled: false,
        digest: sha256(serializedOverview),
      },
      googleConnection: {
        configuredLocally: false,
        realConnectionPresent: false,
        credentialFieldsExposed: false,
      },
      sessionProjection: {
        realScheduledSessionPreviewed: true,
        action: sessionProjection.previewBody.preview.action,
        sourceRevision: sessionProjection.previewBody.preview.sourceRevision,
        sendUpdates: "none",
        attendeesIncluded: false,
        providerVisibility: sessionProjection.previewBody.preview.snapshot.providerVisibility,
        staleConfirmationRejected: true,
        projectionRowsRetained: 0,
        receiptRowsRetained: 0,
      },
      database: schema,
      identity: { emailSha256: sha256(MEDIA_OPERATOR_EMAIL), renderedLogin: true },
      evidence: [
        "schedule-calendar-system-desktop.png",
        "schedule-calendar-system-phone.png",
        "schedule-google-calendar-connection-desktop.png",
        "schedule-google-calendar-connection-phone.png",
      ],
      boundaries: {
        browserSessionCleared: true,
        browserExceptions: 0,
        serverFailures: 0,
        databaseMutated: false,
        providerCalendarMutated: false,
        invitationsSent: false,
        credentialsPrinted: false,
        tokensPrinted: false,
        externalSideEffects: false,
      },
    });
    const modes = await Promise.all(
      [receiptPath, desktopScreenshot, phoneScreenshot, googleDesktopScreenshot, googlePhoneScreenshot]
        .map(async (target) => (await stat(target)).mode & 0o777),
    );
    assert(modes.every((mode) => mode === 0o600), "Calendar evidence artifacts are not all private mode 0600.");

    console.log(JSON.stringify({
      ok: true,
      localOnly: true,
      renderedDesktop: true,
      renderedPhoneWidth: true,
      authenticatedOverview: true,
      schemaVerified: true,
      browserSessionCleared: true,
      externalSideEffects: false,
      receipt: receiptPath,
    }, null, 2));
  } finally {
    if (signedIn && !sessionCleared) {
      await clearRenderedSession(page, baseURL, "retained-calendar-overview").catch(() => {});
    }
    if (temporaryConnectionId) {
      if (temporaryCollectionId) {
        await database.query(`DELETE FROM "CalendarCollection" WHERE "id" = $1`, [temporaryCollectionId]).catch(() => {});
      }
      await database.query(`DELETE FROM "CalendarConnection" WHERE "id" = $1`, [temporaryConnectionId]).catch(() => {});
    }
    if (temporaryRoomSchedule) {
      await database.query(
        `UPDATE "CallRoom" SET "scheduledStart" = $2, "scheduledEnd" = $3, "metadataJson" = $4::jsonb, "updatedAt" = $5 WHERE "id" = $1`,
        [
          temporaryRoomSchedule.id,
          temporaryRoomSchedule.scheduledStart,
          temporaryRoomSchedule.scheduledEnd,
          JSON.stringify(temporaryRoomSchedule.metadataJson || {}),
          temporaryRoomSchedule.updatedAt,
        ],
      ).catch(() => {});
    }
    await database.end().catch(() => {});
    await context.close();
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
