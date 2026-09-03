import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loopbackHost(hostname) {
  return ["127.0.0.1", "localhost", "::1", "[::1]"].includes(hostname);
}

function defaultStateDirectory(env) {
  if (env.QUIPSLY_LOCAL_STATE_DIR) return path.resolve(env.QUIPSLY_LOCAL_STATE_DIR);
  if (process.platform === "darwin") {
    const cacheRoot = execFileSync("getconf", ["DARWIN_USER_CACHE_DIR"], { encoding: "utf8" }).trim();
    if (cacheRoot) return path.join(cacheRoot, "quipsly", "local");
  }
  return path.join(env.XDG_RUNTIME_DIR || "/tmp", `quipsly-local-${process.getuid?.() ?? "unknown"}`);
}

async function firstLine(filePath, label) {
  const value = (await readFile(filePath, "utf8")).split(/\r?\n/, 1)[0]?.trim() || "";
  assert(value, `${label} is missing from the local Nest lifecycle state.`);
  return value;
}

async function optionalFirstLine(filePath) {
  try {
    return (await readFile(filePath, "utf8")).split(/\r?\n/, 1)[0]?.trim() || null;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function computeCurrentSourceRevision({ repositoryRoot, envPath }) {
  const stateScript = path.join(repositoryRoot, "scripts", "dev", "quipsly-local-state.sh");
  return execFileSync(
    "bash",
    [
      "-c",
      'source "$1"; quipsly_local_nest_source_revision "$2" "$3"',
      "quipsly-local-source-boundary",
      stateScript,
      repositoryRoot,
      envPath,
    ],
    { cwd: repositoryRoot, encoding: "utf8" },
  ).trim();
}

function computeCurrentGitRevision(repositoryRoot) {
  const dirty = execFileSync(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=all"],
    { cwd: repositoryRoot, encoding: "utf8" },
  ).trim();
  assert(!dirty, "The commit-bound local Nest requires a clean worktree.");
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();
}

export async function requireCurrentLocalNestSource({
  repositoryRoot,
  baseURL,
  env = process.env,
  stateDirectory = null,
  currentSourceRevision = null,
  fetchImpl = globalThis.fetch,
}) {
  const root = path.resolve(repositoryRoot);
  const origin = new URL(baseURL);
  assert(origin.protocol === "http:" && loopbackHost(origin.hostname), "Fresh acceptance refuses a non-loopback Nest runtime.");
  const state = stateDirectory || defaultStateDirectory(env);
  const [recordedRoot, recordedRevision, revisionKind] = await Promise.all([
    firstLine(path.join(state, "repo-root"), "Runtime source worktree"),
    firstLine(path.join(state, "source-revision"), "Runtime source revision"),
    optionalFirstLine(path.join(state, "source-revision-kind")),
  ]);
  assert(path.resolve(recordedRoot) === root, `Local Nest is running from ${recordedRoot}, not ${root}.`);
  const sourceRevisionKind = revisionKind || "source-closure";
  assert(
    ["source-closure", "git-head"].includes(sourceRevisionKind),
    `Unsupported local Nest source revision kind: ${sourceRevisionKind}.`,
  );
  const current = currentSourceRevision || (sourceRevisionKind === "git-head"
    ? computeCurrentGitRevision(root)
    : computeCurrentSourceRevision({
        repositoryRoot: root,
        envPath: await firstLine(path.join(state, "nest-env-path"), "Runtime environment path"),
      }));
  assert(recordedRevision === current, "Local Nest is not serving the current executable source closure. Restart it with pnpm quipsly:local:up.");
  const response = await fetchImpl(new URL("/api/health", origin));
  assert(response?.ok === true, `Local Nest health failed with HTTP ${response?.status ?? "unknown"}.`);
  return {
    sourceSha: current,
    sourceRevisionKind,
    repositoryRoot: root,
    runtimeSourceRevision: recordedRevision,
  };
}
