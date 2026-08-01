#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import {
  chmod,
  link,
  mkdir,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";

const REPO_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const RUNTIME_RUNNER = path.join(
  REPO_ROOT,
  "apps/mobile-capture/HighGroundCapture/scripts/run-capture-runtime-ui-smoke.sh",
);
const PRODUCTION_ORIGIN = "https://nest.quipsly.com";
const KEYCHAIN_SERVICE = "quipsly-capture-reviewer";
const OPERATOR_EMAIL = "codex@dev.test";
const RETAINED_PREFIX = "QA Retained · ";
const RETAINED_SESSION_TITLE =
  "QA Retained · Capture Build 25 longitudinal session · 2026-08-01";
const RELEASED_CAPTURE_SOURCE = "4ef8ddbacbba7949b16607d8dae5454ff28e9082";
const RELEASED_CAPTURE_BUILD = 25;
const REQUEST_TIMEOUT_MS = 30_000;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function cleanText(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export function requireProductionOrigin(value) {
  const url = new URL(String(value || ""));
  assert(
    url.origin === PRODUCTION_ORIGIN &&
      url.protocol === "https:" &&
      url.hostname === "nest.quipsly.com" &&
      !url.username &&
      !url.password &&
      ["", "/"].includes(url.pathname) &&
      !url.search &&
      !url.hash,
    `Production native operation requires exactly ${PRODUCTION_ORIGIN}.`,
  );
  return url.origin;
}

export function requireRetainedLabel(value, { label, max }) {
  const normalized = cleanText(value);
  assert(
    normalized.startsWith(RETAINED_PREFIX),
    `${label} must start with the visible \`${RETAINED_PREFIX}\` label.`,
  );
  assert(normalized.length <= max, `${label} is limited to ${max} characters.`);
  return normalized;
}

export function requireArtifactPath(value, { label, extension }) {
  const raw = typeof value === "string" ? value.trim() : "";
  assert(raw && path.isAbsolute(raw), `${label} must be an explicit absolute path.`);
  const resolved = path.resolve(raw);
  assert(resolved !== "/" && resolved !== REPO_ROOT, `${label} target is too broad.`);
  assert(
    !resolved.startsWith(`${REPO_ROOT}${path.sep}`),
    `${label} must stay outside the Git worktree.`,
  );
  assert(resolved.endsWith(extension), `${label} must end with ${extension}.`);
  return resolved;
}

export function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--") continue;
    if (key === "--help" || key === "-h") return { help: true };
    if (
      ![
        "--project",
        "--task",
        "--tag",
        "--result-bundle",
        "--receipt",
      ].includes(key)
    ) {
      throw new Error(`Unknown argument: ${key}`);
    }
    values.set(key, argv[index + 1] ?? "");
    index += 1;
  }
  return {
    help: false,
    projectName: requireRetainedLabel(values.get("--project"), {
      label: "Project name",
      max: 120,
    }),
    taskTitle: requireRetainedLabel(values.get("--task"), {
      label: "Task title",
      max: 220,
    }),
    tagLabel: requireRetainedLabel(values.get("--tag"), {
      label: "Tag label",
      max: 80,
    }),
    resultBundle: requireArtifactPath(values.get("--result-bundle"), {
      label: "Result bundle",
      extension: ".xcresult",
    }),
    receipt: requireArtifactPath(values.get("--receipt"), {
      label: "Receipt",
      extension: ".json",
    }),
  };
}

function runGit(args, { acceptStatus = [0] } = {}) {
  const result = spawnSync("git", args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  assert(
    acceptStatus.includes(result.status),
    `Git preflight failed for ${args.join(" ")} (exit ${String(result.status)}).`,
  );
  return { status: result.status, stdout: String(result.stdout || "").trim() };
}

export function assertCanonicalProductionReadback({
  rootWork,
  projectWork,
  options,
}) {
  assert(rootWork?.ok === true, "Production Work root did not report ok=true.");
  assert(
    rootWork.workspaceKind === "quipsly-mobile-work-v1",
    "Production Work root returned the wrong schema.",
  );
  const matchingProjects = Array.isArray(rootWork.projects)
    ? rootWork.projects.filter((project) => project?.name === options.projectName)
    : [];
  assert(
    matchingProjects.length === 1,
    `Expected one exact retained project; found ${matchingProjects.length}.`,
  );
  const project = matchingProjects[0];
  assert(
    project?.role === "OWNER" && project?.canWrite === true && project?.isHomeNest === false,
    "The retained production project is not an owned writable non-Home Nest.",
  );

  assert(projectWork?.ok === true, "Selected production Work readback did not report ok=true.");
  assert(
    projectWork.selectedProjectId === project.id &&
      projectWork.workspace?.project?.id === project.id,
    "Selected Work readback drifted from the created project identity.",
  );
  assert(
    projectWork.workspace?.project?.role === "OWNER" &&
      projectWork.workspace?.project?.canWrite === true,
    "Selected Work readback lost owner write access.",
  );

  const exact = (values, title) =>
    Array.isArray(values) ? values.filter((value) => value?.title === title) : [];
  const tasks = exact(projectWork.workspace?.tasks, options.taskTitle);
  const notes = exact(projectWork.workspace?.notes, `${options.taskTitle} · note`);
  const goals = exact(projectWork.workspace?.goals, `${options.taskTitle} · goal`);
  const tags = Array.isArray(projectWork.workspace?.tags)
    ? projectWork.workspace.tags.filter((tag) => tag?.label === options.tagLabel)
    : [];
  assert(tasks.length === 1, `Expected one exact production Task; found ${tasks.length}.`);
  assert(notes.length === 1, `Expected one exact production Note; found ${notes.length}.`);
  assert(goals.length === 1, `Expected one exact production Goal; found ${goals.length}.`);
  assert(tags.length === 1, `Expected one exact production tag; found ${tags.length}.`);

  const task = tasks[0];
  const note = notes[0];
  const goal = goals[0];
  const tag = tags[0];
  assert(task.status === "OPEN" && task.roomId === null, "Production Task state or project-only identity drifted.");
  assert(goal.status === "ACTIVE" && goal.roomId === null, "Production Goal state or project-only identity drifted.");
  assert(
    typeof note.stableId === "string" &&
      note.stableId &&
      typeof note.contentRevision === "string" &&
      /^[0-9a-f]{64}$/.test(note.contentRevision) &&
      Array.isArray(note.blocks) &&
      note.blocks.length > 0 &&
      note.canEditContent === true &&
      typeof note.webPath === "string" &&
      note.webPath.includes(encodeURIComponent(note.id)),
    "Production Note lost document-kernel identity, content, editability, or web routing.",
  );
  assert(tag.isActive === true && tag.archivedAt === null, "Production tag is not active.");
  assert(tag.usageCount === 3, "Production tag is not reused by exactly Task, Note, and Goal.");

  for (const [kind, entity] of [
    ["Task", task],
    ["Note", note],
    ["Goal", goal],
  ]) {
    assert(
      Array.isArray(entity.tagIds) &&
        entity.tagIds.length === 1 &&
        entity.tagIds[0] === tag.id &&
        Array.isArray(entity.tagLabels) &&
        entity.tagLabels.length === 1 &&
        entity.tagLabels[0] === options.tagLabel,
      `${kind} did not reuse the exact canonical production tag.`,
    );
  }

  const boundaries = projectWork.boundaries;
  for (const key of [
    "actorScoped",
    "ownedGoalsOnly",
    "explicitProjectGrantRequired",
    "protectedOfflineSnapshotSupported",
    "canonicalProjectRecords",
    "canonicalProjectTags",
    "onlineVocabularyManagement",
    "unreviewedTranscriptCandidatesExcluded",
    "mutationsUseExistingProtectedOutboxes",
  ]) {
    assert(boundaries?.[key] === true, `Production Work boundary ${key} is not true.`);
  }
  assert(boundaries?.sourceMutated === false, "Production Work claimed source mutation.");
  assert(boundaries?.externalSideEffects === false, "Production Work claimed external side effects.");

  return { project, task, note, goal, tag };
}

async function ensureMissing(target, label) {
  try {
    await stat(target);
    throw new Error(`${label} already exists; refusing to overwrite it.`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function requestJson(url, { token, ...options } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null);
    assert(response.ok, `Request to ${new URL(url).pathname} failed with HTTP ${response.status}.`);
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

async function authenticate(baseURL, password) {
  const config = await requestJson(`${baseURL}/api/mac/firebase-client-config`);
  const apiKey = cleanText(config?.firebase?.apiKey);
  assert(config?.ok === true && apiKey, "Production Firebase client config is unavailable.");
  const signIn = await requestJson(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      body: JSON.stringify({
        email: OPERATOR_EMAIL,
        password,
        returnSecureToken: true,
      }),
    },
  );
  const idToken = cleanText(signIn?.idToken);
  assert(idToken, "Firebase did not return a native bearer token.");
  const lookup = await requestJson(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    { method: "POST", body: JSON.stringify({ idToken }) },
  );
  const account = Array.isArray(lookup?.users) ? lookup.users[0] : null;
  assert(
    cleanText(account?.email).toLowerCase() === OPERATOR_EMAIL &&
      account?.emailVerified === true,
    "The retained production Firebase identity is not exact and verified.",
  );
  const session = await requestJson(`${baseURL}/api/mac/session-check`, {
    token: idToken,
  });
  assert(
    (session?.ok === true || session?.authenticated === true) &&
      cleanText(session?.user?.primaryEmail || session?.user?.email).toLowerCase() === OPERATOR_EMAIL &&
      Boolean(session?.homeNest?.slug || session?.onboarding?.homeNestSlug),
    "Quipsly native session-check did not return the exact retained account and Home Nest.",
  );
  return { idToken, session };
}

async function fetchWork(baseURL, idToken, projectId = "") {
  const url = new URL("/api/mobile/capture/work", baseURL);
  if (projectId) url.searchParams.set("projectId", projectId);
  return requestJson(url.toString(), { token: idToken });
}

async function fetchSessions(baseURL, idToken) {
  const payload = await requestJson(`${baseURL}/api/mobile/capture/sessions`, {
    token: idToken,
  });
  assert(payload?.ok === true && Array.isArray(payload.sessions), "Production Sessions readback is unavailable.");
  return payload.sessions;
}

function assertRetainedSession(sessions) {
  const matches = sessions.filter((session) => session?.title === RETAINED_SESSION_TITLE);
  assert(matches.length === 1, `Expected one exact retained Capture Session; found ${matches.length}.`);
  return matches[0];
}

function runCompiledOperation({ baseURL, password, options }) {
  const result = spawnSync("bash", [RUNTIME_RUNNER], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      QUIPSLY_CAPTURE_UI_TEST_MODE: "project-create",
      QUIPSLY_CAPTURE_UI_TEST_BASE_URL: baseURL,
      QUIPSLY_CAPTURE_UI_TEST_EMAIL: OPERATOR_EMAIL,
      QUIPSLY_CAPTURE_UI_TEST_PASSWORD: password,
      QUIPSLY_CAPTURE_UI_TEST_PROJECT_NAME: options.projectName,
      QUIPSLY_CAPTURE_UI_TEST_PROJECT_TASK_TITLE: options.taskTitle,
      QUIPSLY_CAPTURE_UI_TEST_PROJECT_TAG_LABEL: options.tagLabel,
      QUIPSLY_CAPTURE_UI_TEST_RESULT_BUNDLE_PATH: options.resultBundle,
    },
    stdio: "inherit",
  });
  assert(
    result.status === 0,
    `Compiled production iPhone operation failed (exit ${String(result.status)}).`,
  );
}

async function writePrivateAtomicReceipt(target, value) {
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  await ensureMissing(target, "Receipt");
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    await link(temporary, target);
    await chmod(target, 0o600);
  } finally {
    await unlink(temporary).catch((error) => {
      if (error?.code !== "ENOENT") throw error;
    });
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(`Usage:
  pnpm quipsly:retained:production-native-project -- \\
    --project "QA Retained · Production iPhone system 2026-08-01 A" \\
    --task "QA Retained · Build the production cross-device system A" \\
    --tag "QA Retained · Product system A" \\
    --result-bundle "/absolute/private/path/operation.xcresult" \\
    --receipt "/absolute/private/path/operation.json"

This fail-closed operation signs the fixed verified .test account into the
compiled Quipsly Capture app against production, creates and preserves one
private Nest plus a Task, document-kernel Note, Goal, and one shared canonical
tag, then independently reads their stable identities back through production
Nest APIs. It does not publish, invite, record, schedule, or clean up product
artifacts.`);
    return;
  }

  const baseURL = requireProductionOrigin(
    process.env.QUIPSLY_RETAINED_PRODUCTION_BASE_URL || PRODUCTION_ORIGIN,
  );
  await ensureMissing(options.resultBundle, "Result bundle");
  await ensureMissing(options.receipt, "Receipt");
  await mkdir(path.dirname(options.resultBundle), { recursive: true, mode: 0o700 });

  const status = runGit(["status", "--porcelain"]);
  assert(!status.stdout, "Production native operation requires a clean Git worktree.");
  const headCommit = runGit(["rev-parse", "HEAD"]).stdout;
  const releasedProductDiff = runGit(
    [
      "diff",
      "--quiet",
      RELEASED_CAPTURE_SOURCE,
      "HEAD",
      "--",
      "apps/mobile-capture/HighGroundCapture/HighGroundCapture",
      "apps/mobile-capture/HighGroundCapture/HighGroundCapture.xcodeproj",
    ],
    { acceptStatus: [0, 1] },
  );
  assert(
    releasedProductDiff.status === 0,
    `Compiled Capture product source no longer matches released Build ${RELEASED_CAPTURE_BUILD}.`,
  );

  const password = readRetainedQAPassword({
    service: KEYCHAIN_SERVICE,
    account: OPERATOR_EMAIL,
  });
  assert(password, "The retained production operator has no Keychain password.");
  const auth = await authenticate(baseURL, password);
  const [beforeWork, beforeSessions] = await Promise.all([
    fetchWork(baseURL, auth.idToken),
    fetchSessions(baseURL, auth.idToken),
  ]);
  const matchingBefore = Array.isArray(beforeWork?.projects)
    ? beforeWork.projects.filter((project) => project?.name === options.projectName)
    : [];
  assert(
    matchingBefore.length === 0,
    "This exact retained production project already exists; choose a new visible operation name.",
  );
  const retainedSessionBefore = assertRetainedSession(beforeSessions);

  runCompiledOperation({ baseURL, password, options });

  const [afterWork, afterSessions] = await Promise.all([
    fetchWork(baseURL, auth.idToken),
    fetchSessions(baseURL, auth.idToken),
  ]);
  const createdProject = afterWork.projects?.find(
    (project) => project?.name === options.projectName,
  );
  assert(createdProject?.id, "Compiled Capture operation did not create the production Nest.");
  const selectedWork = await fetchWork(baseURL, auth.idToken, createdProject.id);
  const records = assertCanonicalProductionReadback({
    rootWork: afterWork,
    projectWork: selectedWork,
    options,
  });
  const retainedSessionAfter = assertRetainedSession(afterSessions);
  assert(
    beforeSessions.length === afterSessions.length &&
      retainedSessionBefore.id === retainedSessionAfter.id,
    "Project operation changed the retained Capture Session collection.",
  );

  const receipt = {
    schema: "quipsly-retained-production-native-project-operation-v1",
    ok: true,
    completedAt: new Date().toISOString(),
    origin: baseURL,
    retained: true,
    privateProductArtifacts: true,
    compiledIPhoneOperation: true,
    releasedCaptureBuild: RELEASED_CAPTURE_BUILD,
    releasedCaptureSource: RELEASED_CAPTURE_SOURCE,
    operatorSourceCommit: headCommit,
    identity: {
      email: OPERATOR_EMAIL,
      firebaseVerified: true,
      nativeSessionVerified: true,
      homeNestPresent: true,
    },
    records: {
      project: { id: records.project.id, slug: records.project.slug, name: records.project.name },
      task: { id: records.task.id, title: records.task.title, status: records.task.status },
      note: {
        id: records.note.id,
        stableId: records.note.stableId,
        title: records.note.title,
        contentRevision: records.note.contentRevision,
        webPath: records.note.webPath,
      },
      goal: { id: records.goal.id, title: records.goal.title, status: records.goal.status },
      tag: { id: records.tag.id, label: records.tag.label, usageCount: records.tag.usageCount },
    },
    retainedSession: {
      id: retainedSessionAfter.id,
      title: retainedSessionAfter.title,
      countBefore: beforeSessions.length,
      countAfter: afterSessions.length,
      unchanged: true,
    },
    evidence: {
      xcresult: options.resultBundle,
      receipt: options.receipt,
      canonicalApiReadback: true,
      stableIdentityReadback: true,
      artifactPreserved: true,
    },
    boundaries: {
      accountScoped: true,
      exactProductionOrigin: true,
      cleanCommittedSource: true,
      releasedProductSourceMatched: true,
      credentialsFromKeychain: true,
      credentialsPrinted: false,
      tokensPrinted: false,
      sourceMutated: false,
      externalSideEffects: false,
      recordingStarted: false,
      sessionCreated: false,
      invitationSent: false,
      calendarMutated: false,
      publicationPerformed: false,
      cleanupPerformed: false,
    },
  };
  await writePrivateAtomicReceipt(options.receipt, receipt);
  const receiptMode = (await stat(options.receipt)).mode & 0o777;
  assert(
    receiptMode === (fsConstants.S_IRUSR | fsConstants.S_IWUSR),
    "Receipt mode is not 0600.",
  );
  console.log(JSON.stringify({
    ok: true,
    retained: true,
    production: true,
    compiledIPhoneOperation: true,
    canonicalApiReadback: true,
    projectId: records.project.id,
    taskId: records.task.id,
    noteId: records.note.id,
    goalId: records.goal.id,
    tagId: records.tag.id,
    resultBundle: options.resultBundle,
    receipt: options.receipt,
    artifactPreserved: true,
    credentialsPrinted: false,
    tokensPrinted: false,
    externalSideEffects: false,
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
