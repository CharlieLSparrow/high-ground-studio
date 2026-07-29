#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, "..");
const captureRoot = path.join(
  root,
  "apps/mobile-capture/HighGroundCapture/HighGroundCapture",
);

const [manuscript, shell, auth, route, store, routeTest, uiTest] =
  await Promise.all([
    readFile(path.join(captureRoot, "MobileEpisodeManuscript.swift"), "utf8"),
    readFile(path.join(captureRoot, "CapturePhoneShell.swift"), "utf8"),
    readFile(path.join(captureRoot, "AuthManager.swift"), "utf8"),
    readFile(
      path.join(
        root,
        "apps/quipsly/src/app/api/nests/[slug]/episode-room/route.ts",
      ),
      "utf8",
    ),
    readFile(
      path.join(
        root,
        "apps/quipsly/src/lib/server/episode-room-store.ts",
      ),
      "utf8",
    ),
    readFile(
      path.join(
        root,
        "apps/quipsly/src/app/api/nests/[slug]/episode-room/route.test.ts",
      ),
      "utf8",
    ),
    readFile(
      path.join(
        root,
        "apps/mobile-capture/HighGroundCapture/HighGroundCaptureUITests/CaptureExperienceUITests.swift",
      ),
      "utf8",
    ),
  ]);

const checks = [];
function check(name, condition) {
  assert.ok(condition, name);
  checks.push(name);
}

check(
  "native manuscript uses a dedicated authenticated projection",
  manuscript.includes('URLQueryItem(name: "writing", value: "1")')
    && manuscript.includes("AuthManager.shared.authenticatedData")
    && route.includes('searchParams.get("writing") === "1"')
    && route.includes("loadEpisodeRoomWritingRuntime"),
);
check(
  "manuscript projection is isolated from Watch, recording sessions, and proxy reconciliation",
  store.includes("export async function loadEpisodeRoomWritingRuntime")
    && store.includes("This intentionally avoids proxy reconciliation")
    && !store.slice(
      store.indexOf("export async function loadEpisodeRoomWritingRuntime"),
      store.indexOf("/**\n * Lightweight shared-playback projection"),
    ).includes("reconcileEpisodeCaptureProxies")
    && routeTest.includes("without loading Watch or the full editor runtime"),
);
check(
  "opaque writing versions avoid re-downloading unchanged blocks",
  manuscript.includes('URLQueryItem(name: "writingVersion", value: version)')
    && manuscript.includes("nextWriting.version == writing?.version")
    && manuscript.includes("nextBlocks = blocks")
    && store.includes("knownVersion: knownWritingVersion"),
);
check(
  "protected manuscript cache is owner and episode partitioned",
  manuscript.includes('appendingPathComponent("EpisodeManuscriptCache"')
    && manuscript.includes("Self.digest(owner.ownerAccountID)")
    && manuscript.includes("Self.digest(context.projectSlug)")
    && manuscript.includes("Self.digest(context.episodeSlug)")
    && manuscript.includes("cache.ownerDigest =="),
);
check(
  "protected manuscript cache is complete-protection and backup excluded",
  manuscript.includes("FileProtectionType.complete")
    && manuscript.includes(".completeFileProtection")
    && manuscript.includes("isExcludedFromBackup = true")
    && auth.includes("MobileEpisodeManuscriptClient.clearProtectedCache()"),
);
check(
  "protected-offline mode reads the cache without attempting network work",
  manuscript.includes("guard AuthManager.shared.networkActionsAllowed else")
    && manuscript.includes("Protected offline copy")
    && manuscript.includes("Connect to Nest once"),
);
check(
  "manuscript response cannot leave the configured Nest origin",
  manuscript.includes("private static func isSameOrigin")
    && manuscript.includes("candidate?.scheme?.lowercased()")
    && manuscript.includes("candidate?.host?.lowercased()")
    && manuscript.includes("candidate?.port == expected.port")
    && manuscript.includes("response left the configured Nest origin"),
);
check(
  "Capture exposes the read-only manuscript before shared Watch",
  shell.indexOf("MobileEpisodeManuscriptCard(")
    < shell.indexOf("MobileEpisodeWatchCard(")
    && manuscript.includes('"CaptureEpisodeManuscriptOpenButton"')
    && manuscript.includes("Read-only here")
    && manuscript.includes("Open canonical episode in Nest")
    && manuscript.includes(
      'components.path = "/nests/\\(projectSlug)/episodes/\\(episodeSlug)"',
    ),
);
check(
  "deterministic rehearsal preview names the canonical episode and Be Curious cue",
  manuscript.includes('title: "The Swear Jar"')
    && manuscript.includes('title: "Clip · Be Curious"')
    && manuscript.includes("blockCount: 34"),
);
check(
  "simulator UX test opens and verifies the manuscript boundary",
  uiTest.includes(
    "testEpisodeManuscriptIsReadableBesideTheRecorderWithoutCreatingAnEditableCopy",
  )
    && uiTest.includes('"CaptureEpisodeManuscriptReader"')
    && uiTest.includes('"Clip · Be Curious"'),
);

console.log(`PASS iOS episode manuscript contract (${checks.length}/${checks.length})`);
