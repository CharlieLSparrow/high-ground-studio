#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";
import { requireLoopbackDatabaseUrl } from "./quipsly-retained-coaching-draft-revision-operation.mjs";

const REPO_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const RUNNER = path.join(
  REPO_ROOT,
  "apps/mobile-capture/HighGroundCapture/scripts/run-capture-runtime-ui-smoke.sh",
);
const KEYCHAIN_SERVICE = "com.quipsly.qa.retained-coaching";
const ROOM_ID = "retained-coaching-follow-up-20260731";
const ROOM_TITLE = "Retained coaching follow-up rehearsal";
const BUNDLE_ID = "com.highgroundodyssey.HighGroundCapture";
const COACH = {
  role: "coach",
  email: "quipsly-coach-retained-20260731@example.test",
};
const CLIENT = {
  role: "client",
  email: "quipsly-client-retained-20260731@example.test",
};

const requireFromQuipsly = createRequire(
  new URL("../apps/quipsly/package.json", import.meta.url),
);
const { PrismaClient } = requireFromQuipsly("@prisma/client");
const { PrismaPg } = requireFromQuipsly("@prisma/adapter-pg");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requireLoopbackOrigin(value) {
  const url = new URL(String(value || ""));
  assert(
    url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
    "Native coach follow-up operation refuses non-loopback Nest origins.",
  );
  return url.origin;
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
  assert(store === "temporary", "Credential store must be temporary or keychain.");
  const directory = path.resolve(
    String(
      process.env.QUIPSLY_RETAINED_COACHING_CREDENTIAL_DIRECTORY || "",
    ).trim(),
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
    credential.email === identity.email &&
      typeof credential.password === "string" &&
      credential.password.length >= 16,
    `Temporary ${identity.role} credential is invalid.`,
  );
  return credential.password;
}

function simulatorDevice() {
  const destination =
    process.env.QUIPSLY_CAPTURE_UI_TEST_DESTINATION ||
    "platform=iOS Simulator,name=iPhone 17 Pro";
  const id = destination.match(/(?:^|,)id=([^,]+)/)?.[1];
  if (id) return id;
  const name = destination.match(/(?:^|,)name=([^,]+)/)?.[1];
  assert(name, "Native coach follow-up operation requires one exact simulator name or ID.");
  return name;
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    stdio: "inherit",
    ...options,
  });
  assert(
    result.status === 0,
    `${command} ${args.join(" ")} failed (exit ${String(result.status)}).`,
  );
}

function resetCaptureSimulatorApp() {
  const device = simulatorDevice();
  const boot = spawnSync("xcrun", ["simctl", "boot", device], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  assert(
    boot.status === 0 || /current state: Booted|Unable to boot device in current state/i.test(`${boot.stdout}\n${boot.stderr}`),
    `Could not boot the exact iPhone simulator: ${device}`,
  );
  runCommand("xcrun", ["simctl", "bootstatus", device, "-b"]);
  spawnSync("xcrun", ["simctl", "terminate", device, BUNDLE_ID], {
    cwd: REPO_ROOT,
    stdio: "ignore",
  });
  spawnSync("xcrun", ["simctl", "uninstall", device, BUNDLE_ID], {
    cwd: REPO_ROOT,
    stdio: "ignore",
  });
}

function runNativeJourney({ mode, identity, password, resultBundle, extra = {} }) {
  resetCaptureSimulatorApp();
  runCommand("bash", [RUNNER], {
    env: {
      ...process.env,
      QUIPSLY_CAPTURE_UI_TEST_MODE: mode,
      QUIPSLY_CAPTURE_UI_TEST_EMAIL: identity.email,
      QUIPSLY_CAPTURE_UI_TEST_PASSWORD: password,
      QUIPSLY_CAPTURE_UI_TEST_SESSION_ID: ROOM_ID,
      QUIPSLY_CAPTURE_UI_TEST_SESSION_TITLE: ROOM_TITLE,
      QUIPSLY_CAPTURE_UI_TEST_RESULT_BUNDLE_PATH: resultBundle,
      ...extra,
    },
  });
}

function stamp() {
  return new Date().toISOString().replace(/[-:.]/g, "");
}

export async function main() {
  const baseURL = requireLoopbackOrigin(
    process.env.QUIPSLY_RETAINED_COACHING_BASE_URL || "http://127.0.0.1:3012",
  );
  const databaseURL = requireLoopbackDatabaseUrl(process.env.DATABASE_URL);
  const runStamp = stamp();
  const title = `QA native coach follow-up ${runStamp}`;
  const intro = "Native coach revision one remains private until explicit release.";
  const revisedIntro = "Native coach revision two is the deliberately reviewed client copy.";
  const nextSessionFocus = "Review progress without changing the canonical task or goal.";
  const coachResultBundle = path.resolve(
    `/private/tmp/quipsly-native-coach-follow-up-${runStamp}-${process.pid}.xcresult`,
  );
  const clientResultBundle = path.resolve(
    `/private/tmp/quipsly-native-client-follow-up-${runStamp}-${process.pid}.xcresult`,
  );
  const coachPassword = retainedPassword(COACH);
  const clientPassword = retainedPassword(CLIENT);
  assert(coachPassword && clientPassword, "Retained coach/client credentials are unavailable.");

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseURL }),
    log: ["error"],
  });
  let outputID = null;
  try {
    const [outputCountBefore, deliveryCountBefore, calendarCountBefore] =
      await Promise.all([
        prisma.sessionOutput.count(),
        prisma.deliveryEvent.count(),
        prisma.calendarEventLink.count(),
      ]);
    assert(
      (await prisma.sessionOutput.count({ where: { title } })) === 0,
      "The unique native follow-up title already exists.",
    );

    runNativeJourney({
      mode: "coach-follow-up-authoring",
      identity: COACH,
      password: coachPassword,
      resultBundle: coachResultBundle,
      extra: {
        QUIPSLY_CAPTURE_UI_TEST_BASE_URL: baseURL,
        QUIPSLY_CAPTURE_UI_TEST_COACH_FOLLOW_UP_TITLE: title,
        QUIPSLY_CAPTURE_UI_TEST_COACH_FOLLOW_UP_INTRO: intro,
        QUIPSLY_CAPTURE_UI_TEST_COACH_FOLLOW_UP_REVISED_INTRO: revisedIntro,
        QUIPSLY_CAPTURE_UI_TEST_COACH_FOLLOW_UP_NEXT_SESSION_FOCUS:
          nextSessionFocus,
      },
    });

    const released = await prisma.sessionOutput.findFirstOrThrow({
      where: {
        roomId: ROOM_ID,
        kind: "CLIENT_FOLLOW_UP",
        title,
        status: "RELEASED",
      },
      select: {
        id: true,
        revision: true,
        contentSha256: true,
        revisions: {
          orderBy: { revision: "asc" },
          select: { revision: true, operation: true },
        },
        deliveries: {
          orderBy: { occurredAt: "asc" },
          select: { kind: true, metadataJson: true },
        },
      },
    });
    outputID = released.id;
    assert(
      released.revision === 3 &&
        released.revisions.map((item) => item.operation).join("|") ===
          "DRAFT_CREATED|DRAFT_UPDATED|RELEASED_IN_APP",
      "Native coach authoring did not preserve create, revise, and release history.",
    );
    assert(
      released.deliveries.length === 1 &&
        released.deliveries[0].kind === "RELEASED_IN_APP",
      "Native release did not produce the exact in-app visibility receipt.",
    );
    assert(
      released.deliveries[0].metadataJson?.externalMessageSent === false &&
        released.deliveries[0].metadataJson?.providerCalendarMutated === false &&
        released.deliveries[0].metadataJson?.publicationPerformed === false,
      "Native release claimed an external message, Calendar mutation, or publication.",
    );

    runNativeJourney({
      mode: "client-follow-up",
      identity: CLIENT,
      password: clientPassword,
      resultBundle: clientResultBundle,
      extra: {
        QUIPSLY_CAPTURE_UI_TEST_BASE_URL: baseURL,
        QUIPSLY_CAPTURE_UI_TEST_CLIENT_FOLLOW_UP_ID: released.id,
        QUIPSLY_CAPTURE_UI_TEST_CLIENT_FOLLOW_UP_TITLE: title,
        QUIPSLY_CAPTURE_UI_TEST_CLIENT_FOLLOW_UP_SHA256:
          released.contentSha256,
      },
    });

    const acknowledged = await prisma.sessionOutput.findUniqueOrThrow({
      where: { id: released.id },
      select: {
        status: true,
        revision: true,
        contentSha256: true,
        deliveries: {
          orderBy: { occurredAt: "asc" },
          select: { kind: true, contentSha256: true, occurredAt: true },
        },
      },
    });
    assert(
        acknowledged.status === "RELEASED" &&
        acknowledged.revision === 3 &&
        acknowledged.contentSha256 === released.contentSha256 &&
        acknowledged.deliveries.some(
          (item) => item.kind === "OPENED_IN_APP" && item.occurredAt instanceof Date,
        ),
      "The intended client did not acknowledge the exact immutable release.",
    );
    assert(
      acknowledged.deliveries.map((item) => item.kind).join("|") ===
        "RELEASED_IN_APP|OPENED_IN_APP" &&
        acknowledged.deliveries.every(
          (item) => item.contentSha256 === released.contentSha256,
        ),
      "Client readback was not bound to the exact released content hash.",
    );
    assert(
      (await prisma.calendarEventLink.count()) === calendarCountBefore,
      "Native follow-up operation changed Calendar evidence.",
    );
    assert(
      (await prisma.sessionOutput.count()) === outputCountBefore + 1 &&
        (await prisma.deliveryEvent.count()) === deliveryCountBefore + 2,
      "Native follow-up operation changed unexpected output or delivery records.",
    );

    await prisma.sessionOutput.delete({ where: { id: released.id } });
    outputID = null;
    assert(
      (await prisma.sessionOutput.count()) === outputCountBefore &&
        (await prisma.deliveryEvent.count()) === deliveryCountBefore,
      "Exact native QA output cleanup did not restore baseline counts.",
    );
    const receipt = {
      ok: true,
      localOnly: true,
      compiledCaptureOperation: true,
      coach: { created: true, revised: true, releasedInApp: true },
      client: { exactReleaseRead: true, openedInApp: true },
      immutableRevisionOperations: released.revisions.map(
        (item) => item.operation,
      ),
      contentSha256: released.contentSha256,
      externalMessageSent: false,
      providerCalendarMutated: false,
      publicationPerformed: false,
      exactQAOutputRemoved: true,
      coachResultBundle,
      clientResultBundle,
      artifactsPreserved: true,
      credentialsPrinted: false,
    };
    console.log(JSON.stringify(receipt, null, 2));
    return receipt;
  } finally {
    if (outputID) {
      await prisma.sessionOutput.deleteMany({
        where: {
          id: outputID,
          roomId: ROOM_ID,
          kind: "CLIENT_FOLLOW_UP",
          title,
        },
      });
    } else {
      await prisma.sessionOutput.deleteMany({
        where: {
          roomId: ROOM_ID,
          kind: "CLIENT_FOLLOW_UP",
          title,
        },
      });
    }
    await prisma.$disconnect();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
