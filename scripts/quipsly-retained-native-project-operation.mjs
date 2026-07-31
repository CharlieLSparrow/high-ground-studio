#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";

const requireFromQuipsly = createRequire(
  new URL("../apps/quipsly/package.json", import.meta.url),
);
const { PrismaClient } = requireFromQuipsly("@prisma/client");
const { PrismaPg } = requireFromQuipsly("@prisma/adapter-pg");

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const runtimeRunner = path.join(
  repoRoot,
  "apps/mobile-capture/HighGroundCapture/scripts/run-capture-runtime-ui-smoke.sh",
);
const KEYCHAIN_SERVICE = "com.quipsly.qa.retained-product";
const MEDIA_OPERATOR_EMAIL = "quipsly-media-ms8ct81g@example.test";
const RETAINED_PREFIX = "QA Retained · ";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function loopbackHost(hostname) {
  return ["127.0.0.1", "localhost", "[::1]"].includes(hostname);
}

export function requireLoopbackOrigin(value) {
  const url = new URL(value);
  assert(
    url.protocol === "http:" &&
      loopbackHost(url.hostname) &&
      !url.username &&
      !url.password &&
      ["", "/"].includes(url.pathname) &&
      !url.search &&
      !url.hash,
    "Retained native project operation requires a credential-free loopback Nest origin.",
  );
  return url.origin;
}

export function requireLocalDatabaseUrl(value) {
  const url = new URL(value);
  assert(
    ["postgres:", "postgresql:"].includes(url.protocol) &&
      loopbackHost(url.hostname) &&
      Boolean(url.pathname) &&
      url.pathname !== "/",
    "Retained native project operation requires an explicit loopback PostgreSQL database.",
  );
  return url.toString();
}

export function requireRetainedLabel(value, { label, max }) {
  const normalized =
    typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  assert(
    normalized.startsWith(RETAINED_PREFIX),
    `${label} must start with the visible \`${RETAINED_PREFIX}\` label.`,
  );
  assert(normalized.length <= max, `${label} is limited to ${max} characters.`);
  return normalized;
}

export function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--") continue;
    if (key === "--help") return { help: true };
    if (!["--project", "--task", "--tag", "--result-bundle"].includes(key)) {
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
      max: 240,
    }),
    tagLabel: requireRetainedLabel(values.get("--tag"), {
      label: "Tag label",
      max: 80,
    }),
    resultBundle: values.get("--result-bundle") || null,
  };
}

function sourceIsRetainedAndSideEffectFree(source) {
  return (
    source?.schema === "quipsly-mobile-quick-entry-v1" &&
    source?.humanCommitted === true &&
    source?.externalSideEffects === false
  );
}

async function loadExactState(prisma, options) {
  const user = await prisma.user.findUnique({
    where: { primaryEmail: MEDIA_OPERATOR_EMAIL },
    select: { id: true, isActive: true, emailVerified: true },
  });
  assert(
    user?.id && user.isActive && user.emailVerified,
    "Retained media operator is not an active verified Quipsly user.",
  );

  const projects = await prisma.studioProject.findMany({
    where: {
      name: options.projectName,
      accessGrants: {
        some: {
          email: MEDIA_OPERATOR_EMAIL,
          role: "OWNER",
          status: "ACTIVE",
        },
      },
    },
    include: {
      accessGrants: {
        where: { email: MEDIA_OPERATOR_EMAIL, status: "ACTIVE" },
      },
    },
  });
  assert(
    projects.length <= 1,
    `Expected at most one retained project; found ${projects.length}.`,
  );
  const project = projects[0] ?? null;
  if (!project) return { user, project: null };

  const noteTitle = `${options.taskTitle} · note`;
  const goalTitle = `${options.taskTitle} · goal`;
  const [tasks, notes, goals, tags] = await Promise.all([
    prisma.actionItem.findMany({
      where: { projectId: project.id, title: options.taskTitle },
      include: { tagLinks: { include: { tag: true } } },
    }),
    prisma.studioDocument.findMany({
      where: { projectId: project.id, title: noteTitle },
      include: {
        blocks: { orderBy: { order: "asc" } },
        tagLinks: { include: { tag: true } },
        documentOperations: true,
      },
    }),
    prisma.goal.findMany({
      where: { projectId: project.id, title: goalTitle },
      include: { tagLinks: { include: { tag: true } } },
    }),
    prisma.studioTag.findMany({
      where: { projectId: project.id, label: options.tagLabel },
    }),
  ]);
  return { user, project, tasks, notes, goals, tags };
}

function assertCanonicalReadback(state, options) {
  assert(
    state.project?.isPrivate === true,
    "The retained project is not private.",
  );
  assert(
    state.project.accessGrants.length === 1,
    "The retained owner grant is not exact.",
  );
  assert(
    state.project.accessGrants[0]?.role === "OWNER",
    "The retained user is not the project owner.",
  );
  assert(
    state.tasks.length === 1,
    `Expected one exact retained Task; found ${state.tasks.length}.`,
  );
  assert(
    state.notes.length === 1,
    `Expected one exact retained Note; found ${state.notes.length}.`,
  );
  assert(
    state.goals.length === 1,
    `Expected one exact retained Goal; found ${state.goals.length}.`,
  );
  assert(
    state.tags.length === 1,
    `Expected one exact retained tag; found ${state.tags.length}.`,
  );

  const task = state.tasks[0];
  const note = state.notes[0];
  const goal = state.goals[0];
  const tag = state.tags[0];
  assert(
    task.assignedUserId === state.user.id && task.status === "OPEN",
    "The retained Task owner or state drifted.",
  );
  assert(
    !task.roomId && !task.dueAt,
    "The retained Task invented a Session or due date.",
  );
  assert(
    sourceIsRetainedAndSideEffectFree(task.sourceJson),
    "The retained Task lost its explicit side-effect-free source contract.",
  );
  assert(
    note.personalOwnerUserId === state.user.id && note.isPrivate,
    "The retained Note owner or privacy drifted.",
  );
  assert(
    note.sourceLabel === "document-kind:note;origin:ios-capture",
    "The retained Note is not an iPhone document-kernel note.",
  );
  assert(
    note.blocks.length === 2 && note.documentOperations.length === 1,
    "The retained Note did not preserve its complete document operation.",
  );
  assert(
    sourceIsRetainedAndSideEffectFree(note.documentOperations[0]?.payloadJson),
    "The retained Note operation lost its source contract.",
  );
  assert(
    goal.ownerUserId === state.user.id && goal.status === "ACTIVE",
    "The retained Goal owner or state drifted.",
  );
  assert(
    !goal.roomId && !goal.targetAt,
    "The retained Goal invented a Session or target date.",
  );
  assert(
    sourceIsRetainedAndSideEffectFree(goal.sourceJson),
    "The retained Goal lost its explicit side-effect-free source contract.",
  );
  for (const [kind, links] of [
    ["Task", task.tagLinks],
    ["Note", note.tagLinks],
    ["Goal", goal.tagLinks],
  ]) {
    assert(
      links.length === 1 && links[0]?.tagId === tag.id,
      `${kind} did not reuse the exact canonical retained tag.`,
    );
    assert(
      links[0]?.createdByUserId === state.user.id,
      `${kind} tag assignment actor drifted.`,
    );
    assert(
      links[0]?.sourceJson?.explicitHumanCapture === true,
      `${kind} tag assignment is not explicit human capture.`,
    );
  }
  assert(
    tag.isPrivate && tag.isActive && !tag.archivedAt,
    "The retained tag is not active private vocabulary.",
  );

  return { task, note, goal, tag };
}

function runCompiledOperation({ baseURL, password, options, resultBundle }) {
  const result = spawnSync("bash", [runtimeRunner], {
    cwd: repoRoot,
    env: {
      ...process.env,
      QUIPSLY_CAPTURE_UI_TEST_MODE: "project-create",
      QUIPSLY_CAPTURE_UI_TEST_BASE_URL: baseURL,
      QUIPSLY_CAPTURE_UI_TEST_EMAIL: MEDIA_OPERATOR_EMAIL,
      QUIPSLY_CAPTURE_UI_TEST_PASSWORD: password,
      QUIPSLY_CAPTURE_UI_TEST_PROJECT_NAME: options.projectName,
      QUIPSLY_CAPTURE_UI_TEST_PROJECT_TASK_TITLE: options.taskTitle,
      QUIPSLY_CAPTURE_UI_TEST_PROJECT_TAG_LABEL: options.tagLabel,
      QUIPSLY_CAPTURE_UI_TEST_RESULT_BUNDLE_PATH: resultBundle,
    },
    stdio: "inherit",
  });
  assert(
    result.status === 0,
    `Compiled iPhone project operation failed (exit ${String(result.status)}).`,
  );
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(`Usage:
  DATABASE_URL=postgresql://... pnpm quipsly:retained:native-project -- \\
    --project "QA Retained · iPhone project operation" \\
    --task "QA Retained · Operate project organization" \\
    --tag "QA Retained · Longitudinal QA"

This local-only operation signs the retained .test user into the compiled iPhone
app, creates and preserves one real project plus tagged Task, Note, and Goal,
then independently verifies their canonical PostgreSQL identities.`);
    return;
  }

  const baseURL = requireLoopbackOrigin(
    process.env.QUIPSLY_RETAINED_PRODUCT_BASE_URL || "http://127.0.0.1:3012",
  );
  const databaseURL = requireLocalDatabaseUrl(process.env.DATABASE_URL || "");
  const password = readRetainedQAPassword({
    service: KEYCHAIN_SERVICE,
    account: MEDIA_OPERATOR_EMAIL,
  });
  assert(password, "The retained media operator has no Keychain password.");
  const resultBundle = path.resolve(
    options.resultBundle ||
      `/private/tmp/quipsly-retained-native-project-${Date.now()}-${process.pid}.xcresult`,
  );
  assert(
    resultBundle.startsWith("/private/tmp/"),
    "Result bundle must stay below /private/tmp.",
  );

  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: databaseURL,
      max: 2,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    }),
    log: ["error"],
  });
  try {
    const before = await loadExactState(prisma, options);
    assert(
      !before.project,
      "This exact retained project already exists; choose a new visible operation name.",
    );
    runCompiledOperation({ baseURL, password, options, resultBundle });
    const after = await loadExactState(prisma, options);
    assert(
      after.project,
      "Compiled iPhone operation did not create the canonical retained project.",
    );
    const records = assertCanonicalReadback(after, options);
    console.log(
      JSON.stringify(
        {
          ok: true,
          localOnly: true,
          retained: true,
          compiledIPhoneOperation: true,
          canonicalReadback: true,
          projectIdSha256: sha256(after.project.id),
          taskIdSha256: sha256(records.task.id),
          noteIdSha256: sha256(records.note.id),
          goalIdSha256: sha256(records.goal.id),
          tagIdSha256: sha256(records.tag.id),
          resultBundle,
          artifactPreserved: true,
          credentialsPrinted: false,
          externalSideEffects: false,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
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
