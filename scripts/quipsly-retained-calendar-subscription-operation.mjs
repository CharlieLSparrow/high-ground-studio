#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
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
const RECEIPT_SCHEMA = "quipsly-retained-calendar-subscription-v1";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const ETAG_PATTERN = /^"[0-9a-f]{64}"$/;

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

function tokenDigest(token) {
  return createHash("sha256")
    .update(`quipsly-calendar-feed-v1\0${token}`)
    .digest("hex");
}

export function requireLoopbackDatabaseUrl(value) {
  const url = new URL(value);
  assert(
    ["postgres:", "postgresql:"].includes(url.protocol) &&
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
      Boolean(url.pathname) &&
      url.pathname !== "/",
    "Calendar subscription operation requires an explicit loopback PostgreSQL database.",
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
  assert(
    outputDir && path.isAbsolute(outputDir),
    "--output-dir must be an absolute path.",
  );
  return { help: false, outputDir: path.resolve(outputDir) };
}

function privateFeedUrl(value, baseURL) {
  const url = new URL(value);
  assert(
    url.origin === baseURL,
    "Calendar capability escaped the local Nest origin.",
  );
  const match = url.pathname.match(/^\/api\/calendar\/feeds\/([^/]+)$/);
  assert(
    match && TOKEN_PATTERN.test(match[1]),
    "Calendar capability URL is malformed.",
  );
  return { url: url.toString(), token: match[1] };
}

async function waitForDifferentText(locator, priorValue) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const value = (await locator.textContent())?.trim() || "";
    if (value && value !== priorValue) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    "The replacement calendar capability did not become visible.",
  );
}

async function inspectFeedResponse(url, expectedStatus, entityTag = "") {
  const response = await fetch(url, {
    redirect: "error",
    headers: entityTag ? { "If-None-Match": entityTag } : {},
  });
  assert(
    response.status === expectedStatus,
    `Calendar capability returned HTTP ${response.status}; expected ${expectedStatus}.`,
  );
  const body = expectedStatus === 304 ? "" : await response.text();
  return {
    status: response.status,
    body,
    entityTag: response.headers.get("etag") || "",
    cacheControl: response.headers.get("cache-control") || "",
    contentType: response.headers.get("content-type") || "",
  };
}

async function feedDatabaseReadback(client, digest) {
  const result = await client.query(
    `SELECT
       feed."id",
       feed."collectionId",
       feed."status",
       feed."tokenDigest",
       feed."lastGeneratedAt",
       feed."metadataJson",
       collection."purpose",
       owner."primaryEmail"
     FROM "CalendarFeed" AS feed
     INNER JOIN "CalendarCollection" AS collection ON collection."id" = feed."collectionId"
     INNER JOIN "User" AS owner ON owner."id" = feed."ownerUserId"
     WHERE feed."tokenDigest" = $1`,
    [digest],
  );
  assert(
    result.rowCount === 1,
    "The calendar capability did not resolve to one canonical feed row.",
  );
  return result.rows[0];
}

async function contentReceiptCount(
  client,
  collectionId,
  feedId,
  contentDigest,
) {
  const result = await client.query(
    `SELECT COUNT(*)::int AS count
     FROM "CalendarSyncReceipt"
     WHERE "collectionId" = $1
       AND "operation" = 'FEED_RENDER'
       AND "metadataJson"->>'feedId' = $2
       AND "responseDigest" = $3`,
    [collectionId, feedId, contentDigest],
  );
  return result.rows[0].count;
}

async function writePrivateJson(target, value) {
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  await chmod(target, 0o600);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(`Usage:
  DATABASE_URL=postgresql://... pnpm quipsly:retained:calendar-subscription -- \\
    --output-dir "/absolute/private/calendar-subscription-operation"

The operation signs the retained .test media operator into loopback Nest,
creates a personal subscription through rendered Schedule, proves one content
receipt across repeated conditional polling, replaces and revokes the link,
reads PostgreSQL independently, and contacts no external calendar provider.`);
    return;
  }

  process.umask(0o077);
  await mkdir(options.outputDir, { recursive: false, mode: 0o700 });
  const baseURL = requireLoopbackOrigin(
    process.env.QUIPSLY_RETAINED_CALENDAR_BASE_URL || "http://127.0.0.1:3012",
    "QUIPSLY_RETAINED_CALENDAR_BASE_URL",
  );
  const databaseURL = requireLoopbackDatabaseUrl(
    process.env.DATABASE_URL || "",
  );
  const password = readRetainedQAPassword({
    service: KEYCHAIN_SERVICE,
    account: MEDIA_OPERATOR_EMAIL,
  });
  assert(password, "The retained media operator has no Keychain password.");

  const database = new Client({
    connectionString: databaseURL,
    connectionTimeoutMillis: 5_000,
  });
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 960 },
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
  let capabilityMayBeActive = false;
  try {
    await database.connect();
    await signInThroughRenderedLogin({
      page,
      baseURL,
      identity: {
        role: "retained-calendar-subscription",
        email: MEDIA_OPERATOR_EMAIL,
      },
      password,
      callbackPath: "/schedule",
    });
    signedIn = true;

    const section = page.locator(
      'section[aria-labelledby="calendar-subscriptions-heading"]',
    );
    await section
      .getByRole("heading", { name: "Read-only calendar subscriptions" })
      .waitFor();
    const commitments = section
      .locator("article")
      .filter({ hasText: "My commitments" });
    await commitments.getByText("Not shared", { exact: true }).waitFor();
    await assertNoHorizontalOverflow(
      section,
      "calendar subscriptions before creation",
    );

    await commitments
      .getByRole("button", { name: "Create private link" })
      .click();
    capabilityMayBeActive = true;
    const oneTimeLink = section.locator("p.font-mono");
    await oneTimeLink.waitFor();
    await section
      .getByText(/Private link created\. Add or copy it now/)
      .waitFor();
    const first = privateFeedUrl(
      (await oneTimeLink.textContent())?.trim() || "",
      baseURL,
    );
    const firstDigest = tokenDigest(first.token);

    const firstResponse = await inspectFeedResponse(first.url, 200);
    assert(
      firstResponse.contentType.includes("text/calendar"),
      "Feed did not return iCalendar content.",
    );
    assert(
      firstResponse.cacheControl === "private, max-age=300, must-revalidate",
      "Feed lost its private conditional-cache boundary.",
    );
    assert(
      ETAG_PATTERN.test(firstResponse.entityTag),
      "Feed did not return a strong content ETag.",
    );
    assert(
      firstResponse.body.startsWith("BEGIN:VCALENDAR\r\n"),
      "Feed body is not a CRLF iCalendar document.",
    );
    assert(
      !firstResponse.body.includes(MEDIA_OPERATOR_EMAIL),
      "Feed exposed its owner email.",
    );
    assert(
      !/BEGIN:VALARM|MAILTO:|credentialRef|tokenDigest/i.test(
        firstResponse.body,
      ),
      "Feed exposed a reminder, attendee, credential, or capability field.",
    );

    const firstRow = await feedDatabaseReadback(database, firstDigest);
    assert(
      firstRow.status === "ACTIVE",
      "First capability was not active after creation.",
    );
    assert(
      firstRow.tokenDigest === firstDigest,
      "Stored capability digest does not match the one-time token.",
    );
    assert(
      !JSON.stringify(firstRow).includes(first.token),
      "PostgreSQL retained the raw calendar token.",
    );
    const firstContentDigest = firstResponse.entityTag.slice(1, -1);
    assert(
      firstRow.metadataJson?.lastContentDigest === firstContentDigest,
      "Feed row did not retain the published content digest.",
    );
    assert(
      (await contentReceiptCount(
        database,
        firstRow.collectionId,
        firstRow.id,
        firstContentDigest,
      )) === 1,
      "First content revision did not have exactly one receipt.",
    );

    const unchanged = await inspectFeedResponse(
      first.url,
      304,
      firstResponse.entityTag,
    );
    assert(unchanged.body === "", "Unchanged feed returned a response body.");
    assert(
      (await contentReceiptCount(
        database,
        firstRow.collectionId,
        firstRow.id,
        firstContentDigest,
      )) === 1,
      "Unchanged polling created a duplicate content receipt.",
    );

    await commitments
      .getByRole("button", { name: "Replace private link" })
      .click();
    const secondText = await waitForDifferentText(oneTimeLink, first.url);
    await section
      .getByText(/Private link created\. Add or copy it now/)
      .waitFor();
    const second = privateFeedUrl(secondText, baseURL);
    const secondDigest = tokenDigest(second.token);
    assert(
      secondDigest !== firstDigest,
      "Rotation returned the prior capability.",
    );
    assert(
      (await inspectFeedResponse(first.url, 404)).status === 404,
      "Rotation did not revoke the prior link.",
    );
    const secondResponse = await inspectFeedResponse(second.url, 200);
    assert(
      ETAG_PATTERN.test(secondResponse.entityTag),
      "Replacement feed did not return a content ETag.",
    );

    const secondRow = await feedDatabaseReadback(database, secondDigest);
    const active = await database.query(
      `SELECT COUNT(*)::int AS count FROM "CalendarFeed"
       WHERE "collectionId" = $1 AND "ownerUserId" = (
         SELECT "id" FROM "User" WHERE "primaryEmail" = $2
       ) AND "status" = 'ACTIVE'`,
      [secondRow.collectionId, MEDIA_OPERATOR_EMAIL],
    );
    assert(
      active.rows[0].count === 1,
      "Rotation did not leave exactly one active capability.",
    );

    await commitments.getByRole("button", { name: "Revoke" }).click();
    capabilityMayBeActive = false;
    await section
      .getByText(
        /Subscription revoked\. The old private link now returns not found/,
      )
      .waitFor();
    await commitments.getByText("Not shared", { exact: true }).waitFor();
    assert(
      (await inspectFeedResponse(second.url, 404)).status === 404,
      "Explicit revocation did not stop the replacement link.",
    );

    const finalRows = await database.query(
      `SELECT feed."status", COUNT(*)::int AS count
       FROM "CalendarFeed" AS feed
       INNER JOIN "CalendarCollection" AS collection ON collection."id" = feed."collectionId"
       INNER JOIN "User" AS owner ON owner."id" = feed."ownerUserId"
       WHERE owner."primaryEmail" = $1
         AND collection."purpose" = 'PERSONAL_COMMITMENTS'
         AND feed."id" IN ($2, $3)
       GROUP BY feed."status"`,
      [MEDIA_OPERATOR_EMAIL, firstRow.id, secondRow.id],
    );
    assert(
      finalRows.rows.length === 1 &&
        finalRows.rows[0].status === "REVOKED" &&
        finalRows.rows[0].count === 2,
      "The operation did not retain exactly two revoked capability revisions.",
    );
    const operationReceipts = await database.query(
      `SELECT "operation", COUNT(*)::int AS count, BOOL_AND(NOT "externalMutated") AS private
       FROM "CalendarSyncReceipt"
       WHERE "collectionId" = $1
         AND (
           "metadataJson"->>'feedId' = ANY($2::text[])
           OR COALESCE("metadataJson"->'feedIds', '[]'::jsonb) ?| $2::text[]
         )
       GROUP BY "operation" ORDER BY "operation"`,
      [secondRow.collectionId, [firstRow.id, secondRow.id]],
    );
    const receiptCounts = Object.fromEntries(
      operationReceipts.rows.map((row) => [row.operation, row.count]),
    );
    assert(
      receiptCounts.VERIFY === 2 &&
        receiptCounts.FEED_RENDER === 2 &&
        receiptCounts.FEED_REVOKE === 2,
      "Rotation/revocation receipt counts are incomplete.",
    );
    assert(
      operationReceipts.rows.every((row) => row.private === true),
      "A subscription receipt claimed an external mutation.",
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await assertNoHorizontalOverflow(
      section,
      "calendar subscriptions after revocation",
    );
    const screenshotPath = path.join(
      options.outputDir,
      "calendar-subscription-revoked.png",
    );
    await page
      .locator("#calendar-subscriptions-heading")
      .evaluate((heading) => {
        heading.scrollIntoView({ block: "start" });
        window.scrollBy(0, -72);
      });
    await page.screenshot({ path: screenshotPath, fullPage: false });
    await chmod(screenshotPath, 0o600);
    assert(
      pageErrors.length === 0,
      `Rendered Schedule raised browser errors: ${pageErrors.join(" | ")}`,
    );
    assert(
      serverFailures.length === 0,
      `Rendered Schedule received server failures: ${JSON.stringify(serverFailures)}`,
    );

    await clearRenderedSession(page, baseURL, "retained-calendar-subscription");
    sessionCleared = true;
    const receiptPath = path.join(options.outputDir, "operation.json");
    await writePrivateJson(receiptPath, {
      schema: RECEIPT_SCHEMA,
      ok: true,
      completedAt: new Date().toISOString(),
      sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
      sourceHadUncommittedChanges: Boolean(
        execFileSync("git", ["status", "--porcelain"], {
          encoding: "utf8",
        }).trim(),
      ),
      localOnly: true,
      rendered: {
        create: true,
        replace: true,
        revoke: true,
        phoneWidth: true,
        horizontalOverflow: false,
      },
      feed: {
        firstFeedIdSha256: sha256(firstRow.id),
        secondFeedIdSha256: sha256(secondRow.id),
        firstTokenSha256: sha256(first.token),
        secondTokenSha256: sha256(second.token),
        contentDigest: firstContentDigest,
        eventCount: Number(firstRow.metadataJson?.lastEventCount || 0),
        unchangedResponse: 304,
        finalActiveCount: 0,
        finalRevokedCount: 2,
        receiptCounts,
      },
      identity: { emailSha256: sha256(MEDIA_OPERATOR_EMAIL) },
      evidence: ["calendar-subscription-revoked.png"],
      boundaries: {
        browserSessionCleared: true,
        browserExceptions: 0,
        serverFailures: 0,
        databaseMutated: true,
        rawCapabilityPersisted: false,
        providerCalendarMutated: false,
        providerContacted: false,
        invitationsSent: false,
        credentialsPrinted: false,
        rawCapabilityEmittedByOperation: false,
        applicationRequestLogExclusionConfigured: true,
        cloudRunRequestLogExclusionVerified: false,
        externalSideEffects: false,
      },
    });
    const modes = await Promise.all(
      [receiptPath, screenshotPath].map(
        async (target) => (await stat(target)).mode & 0o777,
      ),
    );
    assert(
      modes.every((mode) => mode === 0o600),
      "Calendar subscription evidence is not private mode 0600.",
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          localOnly: true,
          renderedLifecycle: true,
          contentAddressedPolling: true,
          finalActiveCount: 0,
          providerContacted: false,
          browserSessionCleared: true,
          receipt: receiptPath,
        },
        null,
        2,
      ),
    );
  } finally {
    if (capabilityMayBeActive && signedIn) {
      await page
        .evaluate(async () => {
          await fetch("/api/calendar/feeds", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ purpose: "PERSONAL_COMMITMENTS" }),
          });
        })
        .catch(() => {});
    }
    if (signedIn && !sessionCleared) {
      await clearRenderedSession(
        page,
        baseURL,
        "retained-calendar-subscription",
      ).catch(() => {});
    }
    await database.end().catch(() => {});
    await context.close();
    await browser.close();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(
      `FAIL ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
