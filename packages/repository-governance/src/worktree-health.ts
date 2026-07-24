import { lstatSync } from "node:fs";
import path from "node:path";

export const WORKTREE_SURFACES = [
  "capture",
  "nest",
  "quipsly-studio",
  "hgo-web",
  "shared-contracts",
  "repository",
  "prototype-archive",
  "other",
] as const;

export type WorktreeSurface = (typeof WORKTREE_SURFACES)[number];
export type WorktreeChangeState = "staged" | "unstaged" | "untracked";
export type WorktreePathKind =
  | "source"
  | "test"
  | "documentation"
  | "configuration"
  | "generated-evidence"
  | "cache-or-build"
  | "binary-media"
  | "binary-asset"
  | "other";

export interface WorktreePathChange {
  readonly path: string;
  readonly states: readonly WorktreeChangeState[];
  readonly originalPath?: string;
  readonly sizeBytes?: number;
}

export interface ClassifiedWorktreePath extends WorktreePathChange {
  readonly surface: WorktreeSurface;
  readonly kind: WorktreePathKind;
  readonly issues: readonly WorktreePathIssue[];
}

export type WorktreeIssueCode =
  | "cache-or-build-in-worktree"
  | "generated-evidence-in-source"
  | "media-in-worktree"
  | "oversized-binary-asset"
  | "large-untracked-file"
  | "unexpected-active-surface"
  | "dirty-path-budget-exceeded";

export interface WorktreePathIssue {
  readonly code: Exclude<WorktreeIssueCode, "dirty-path-budget-exceeded">;
  readonly action: string;
}

export interface WorktreeIssueSummary {
  readonly code: WorktreeIssueCode;
  readonly count: number;
}

export interface WorktreeHealthOptions {
  readonly activeSurface?: WorktreeSurface;
  readonly maxDirtyPaths?: number;
  readonly largeFileBytes?: number;
}

export interface WorktreeHealthReport {
  readonly schema: "quipsly-worktree-health-v1";
  readonly health: "clean" | "healthy" | "attention";
  readonly activeSurface: WorktreeSurface | null;
  readonly totalPaths: number;
  readonly maxDirtyPaths: number;
  readonly stateCounts: Readonly<Record<WorktreeChangeState, number>>;
  readonly surfaceCounts: Readonly<Record<WorktreeSurface, number>>;
  readonly kindCounts: Readonly<Record<WorktreePathKind, number>>;
  readonly issueCounts: readonly WorktreeIssueSummary[];
  readonly paths: readonly ClassifiedWorktreePath[];
  readonly recommendations: readonly string[];
  readonly strictFailure: boolean;
}

const SOURCE_EXTENSIONS = new Set([
  ".c",
  ".cc",
  ".cpp",
  ".css",
  ".graphql",
  ".h",
  ".html",
  ".js",
  ".jsx",
  ".m",
  ".metal",
  ".mjs",
  ".mm",
  ".mts",
  ".prisma",
  ".py",
  ".rb",
  ".scss",
  ".sh",
  ".sql",
  ".swift",
  ".ts",
  ".tsx",
]);

const DOCUMENT_EXTENSIONS = new Set([".md", ".mdx", ".txt"]);
const CONFIG_EXTENSIONS = new Set([
  ".editorconfig",
  ".env.example",
  ".gitattributes",
  ".gitignore",
  ".json",
  ".lock",
  ".pbxproj",
  ".plist",
  ".toml",
  ".xcconfig",
  ".xml",
  ".yaml",
  ".yml",
]);
const BINARY_MEDIA_EXTENSIONS = new Set([
  ".aif",
  ".aiff",
  ".flac",
  ".m4a",
  ".mkv",
  ".mov",
  ".mp3",
  ".mp4",
  ".prproj",
  ".wav",
  ".webm",
]);
const BINARY_ASSET_EXTENSIONS = new Set([
  ".ai",
  ".gif",
  ".heic",
  ".jpeg",
  ".jpg",
  ".pdf",
  ".png",
  ".psd",
  ".tiff",
  ".webp",
  ".zip",
]);

const CACHE_OR_BUILD_SEGMENTS = new Set([
  ".build",
  ".next",
  ".turbo",
  ".venv",
  "__pycache__",
  "build",
  "deriveddata",
  "dist",
  "node_modules",
  "venv",
]);

const GENERATED_EVIDENCE_SEGMENTS = new Set([
  "artifacts",
  "coverage",
  "exports",
  "generated-reports",
  "playwright-report",
  "renders",
  "reports",
  "test-results",
]);

const ACTIVE_SURFACE_ALLOWLIST: Readonly<Record<WorktreeSurface, ReadonlySet<WorktreeSurface>>> = {
  capture: new Set(["capture", "shared-contracts", "repository"]),
  nest: new Set(["nest", "shared-contracts", "repository"]),
  "quipsly-studio": new Set(["quipsly-studio", "repository"]),
  "hgo-web": new Set(["hgo-web", "shared-contracts", "repository"]),
  "shared-contracts": new Set(["capture", "nest", "hgo-web", "shared-contracts", "repository"]),
  repository: new Set(["repository"]),
  "prototype-archive": new Set(["prototype-archive", "repository"]),
  other: new Set(["other", "repository"]),
};

function normalizedRepositoryPath(filePath: string): string {
  return filePath.trim().replaceAll("\\", "/").replace(/^(?:\.\/)+/, "");
}

function pathSegments(filePath: string): readonly string[] {
  return normalizedRepositoryPath(filePath).toLowerCase().split("/").filter(Boolean);
}

export function classifyWorktreeSurface(filePath: string): WorktreeSurface {
  const value = normalizedRepositoryPath(filePath);

  if (value.startsWith("apps/mobile-capture/HighGroundCapture/")) return "capture";
  if (
    value.startsWith("apps/quipsly/")
    || /^scripts\/(?:release\/)?quipsly-/.test(value)
    || /^cloudbuild\.(?:studio|quipsly-)/.test(value)
  ) {
    return "nest";
  }
  if (value.startsWith("apps/QuipslyStudio/")) return "quipsly-studio";
  if (
    value.startsWith("apps/web/")
    || value.startsWith("scripts/release/web-")
    || value === "cloudbuild.web.yaml"
  ) {
    return "hgo-web";
  }
  if (
    value.startsWith("prisma/")
    || /^packages\/(?:content-studio-domain|quipsly-document-kernel|quipsly-domain|studio-domain|worldhub-domain)\//.test(value)
  ) {
    return "shared-contracts";
  }
  if (
    value.startsWith(".github/")
    || value.startsWith("docs/")
    || value.startsWith("scripts/ci/")
    || value.startsWith("packages/repository-governance/")
    || !value.includes("/")
  ) {
    return "repository";
  }
  if (
    /^apps\/(?:ai-hub|motion-lab|photography-hub|quiplore|video-hub)\//.test(value)
    || value.startsWith("pathways/")
  ) {
    return "prototype-archive";
  }
  return "other";
}

export function classifyWorktreePathKind(filePath: string): WorktreePathKind {
  const value = normalizedRepositoryPath(filePath);
  const lowerValue = value.toLowerCase();
  const segments = pathSegments(value);
  const extension = path.extname(lowerValue);

  if (
    segments.some((segment) => CACHE_OR_BUILD_SEGMENTS.has(segment))
    || lowerValue.endsWith(".pyc")
    || lowerValue.endsWith(".xcresult")
  ) {
    return "cache-or-build";
  }
  if (segments.some((segment) => GENERATED_EVIDENCE_SEGMENTS.has(segment))) {
    return "generated-evidence";
  }
  if (BINARY_MEDIA_EXTENSIONS.has(extension)) return "binary-media";
  if (BINARY_ASSET_EXTENSIONS.has(extension)) return "binary-asset";
  if (
    /(?:^|\/)(?:__tests__|tests?)(?:\/|$)/i.test(value)
    || /\.(?:spec|test)\.[^.]+$/i.test(value)
  ) {
    return "test";
  }
  if (DOCUMENT_EXTENSIONS.has(extension)) return "documentation";
  if (
    CONFIG_EXTENSIONS.has(extension)
    || /(?:^|\/)(?:dockerfile|gemfile|makefile)$/i.test(value)
    || /(?:^|\/)\.[a-z0-9._-]+$/i.test(value)
  ) {
    return "configuration";
  }
  if (SOURCE_EXTENSIONS.has(extension)) return "source";
  return "other";
}

function emptyCountRecord<T extends string>(values: readonly T[]): Record<T, number> {
  return Object.fromEntries(values.map((value) => [value, 0])) as Record<T, number>;
}

function issueForPath(
  change: WorktreePathChange,
  surface: WorktreeSurface,
  kind: WorktreePathKind,
  options: Required<Pick<WorktreeHealthOptions, "largeFileBytes">> & Pick<WorktreeHealthOptions, "activeSurface">,
): readonly WorktreePathIssue[] {
  const issues: WorktreePathIssue[] = [];
  const sizeBytes = change.sizeBytes ?? 0;

  if (kind === "cache-or-build") {
    issues.push({
      code: "cache-or-build-in-worktree",
      action: "Move or ignore the cache/build output after preserving any evidence that must survive.",
    });
  }
  if (kind === "generated-evidence") {
    issues.push({
      code: "generated-evidence-in-source",
      action: "Preserve durable evidence in the artifact store or an intentional checkpoint, not as ambient source.",
    });
  }
  if (kind === "binary-media") {
    issues.push({
      code: "media-in-worktree",
      action: "Keep recordings and renders in managed media storage; retain only checksums, manifests, and small fixtures in Git.",
    });
  }
  if (kind === "binary-asset" && sizeBytes > options.largeFileBytes) {
    issues.push({
      code: "oversized-binary-asset",
      action: "Use a shipping derivative plus provenance manifest; keep the canonical original in the asset store.",
    });
  }
  if (change.states.includes("untracked") && sizeBytes > options.largeFileBytes) {
    issues.push({
      code: "large-untracked-file",
      action: "Preserve the file outside the checkout or in an approved asset workflow before deciding whether it belongs in Git.",
    });
  }
  if (
    options.activeSurface
    && !ACTIVE_SURFACE_ALLOWLIST[options.activeSurface].has(surface)
  ) {
    issues.push({
      code: "unexpected-active-surface",
      action: `Keep the ${options.activeSurface} slice dependency-closed and preserve this ${surface} path for a separate slice.`,
    });
  }
  return issues;
}

export function analyzeWorktreeHealth(
  changes: readonly WorktreePathChange[],
  options: WorktreeHealthOptions = {},
): WorktreeHealthReport {
  const maxDirtyPaths = options.maxDirtyPaths ?? 50;
  const largeFileBytes = options.largeFileBytes ?? 1_048_576;
  const stateCounts = emptyCountRecord<WorktreeChangeState>(["staged", "unstaged", "untracked"]);
  const surfaceCounts = emptyCountRecord<WorktreeSurface>(WORKTREE_SURFACES);
  const kindValues: readonly WorktreePathKind[] = [
    "source",
    "test",
    "documentation",
    "configuration",
    "generated-evidence",
    "cache-or-build",
    "binary-media",
    "binary-asset",
    "other",
  ];
  const kindCounts = emptyCountRecord<WorktreePathKind>(kindValues);

  const paths = changes
    .map((change): ClassifiedWorktreePath => {
      const normalizedPath = normalizedRepositoryPath(change.path);
      const normalizedChange: WorktreePathChange = {
        ...change,
        path: normalizedPath,
        states: [...new Set(change.states)].sort(),
      };
      const surface = classifyWorktreeSurface(normalizedPath);
      const kind = classifyWorktreePathKind(normalizedPath);
      const issues = issueForPath(normalizedChange, surface, kind, {
        activeSurface: options.activeSurface,
        largeFileBytes,
      });

      for (const state of normalizedChange.states) stateCounts[state] += 1;
      surfaceCounts[surface] += 1;
      kindCounts[kind] += 1;
      return { ...normalizedChange, surface, kind, issues };
    })
    .sort((left, right) => left.path.localeCompare(right.path));

  const issueCounter = new Map<WorktreeIssueCode, number>();
  for (const classifiedPath of paths) {
    for (const issue of classifiedPath.issues) {
      issueCounter.set(issue.code, (issueCounter.get(issue.code) ?? 0) + 1);
    }
  }
  if (paths.length > maxDirtyPaths) {
    issueCounter.set("dirty-path-budget-exceeded", paths.length - maxDirtyPaths);
  }

  const issueCounts = [...issueCounter.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((left, right) => left.code.localeCompare(right.code));
  const recommendations: string[] = [];
  if (paths.length > maxDirtyPaths) {
    recommendations.push(
      `Recover the worktree in explicit product slices; ${paths.length} paths exceed the ${maxDirtyPaths}-path active-slice budget.`,
    );
  }
  if (issueCounter.has("unexpected-active-surface")) {
    recommendations.push("Stage and commit only the declared active surface plus its explicit shared dependencies.");
  }
  if (
    issueCounter.has("cache-or-build-in-worktree")
    || issueCounter.has("generated-evidence-in-source")
    || issueCounter.has("media-in-worktree")
    || issueCounter.has("large-untracked-file")
  ) {
    recommendations.push("Preserve evidence first, then relocate generated data; this audit never deletes or cleans files.");
  }
  if (paths.length > 0) {
    recommendations.push("Inspect `git diff` and use explicit-path staging. Never use broad reset, clean, or recursive deletion as recovery.");
  }

  const strictFailure = issueCounts.length > 0;
  return {
    schema: "quipsly-worktree-health-v1",
    health: paths.length === 0 ? "clean" : strictFailure ? "attention" : "healthy",
    activeSurface: options.activeSurface ?? null,
    totalPaths: paths.length,
    maxDirtyPaths,
    stateCounts,
    surfaceCounts,
    kindCounts,
    issueCounts,
    paths,
    recommendations,
    strictFailure,
  };
}

export function parseNameStatusZ(
  raw: string,
  state: Exclude<WorktreeChangeState, "untracked">,
): readonly WorktreePathChange[] {
  const fields = raw.split("\0");
  const changes: WorktreePathChange[] = [];

  for (let index = 0; index < fields.length && fields[index];) {
    const gitStatus = fields[index++];
    const statusCode = gitStatus[0];
    if (statusCode === "R" || statusCode === "C") {
      const originalPath = fields[index++];
      const renamedPath = fields[index++];
      if (!originalPath || !renamedPath) throw new Error(`Malformed ${gitStatus} name-status record.`);
      changes.push({ path: renamedPath, originalPath, states: [state] });
      continue;
    }

    const filePath = fields[index++];
    if (!filePath) throw new Error(`Malformed ${gitStatus} name-status record.`);
    changes.push({ path: filePath, states: [state] });
  }
  return changes;
}

export function mergeWorktreeChanges(
  groups: readonly (readonly WorktreePathChange[])[],
): readonly WorktreePathChange[] {
  const merged = new Map<string, {
    originalPath?: string;
    states: Set<WorktreeChangeState>;
    sizeBytes?: number;
  }>();

  for (const group of groups) {
    for (const change of group) {
      const filePath = normalizedRepositoryPath(change.path);
      const current = merged.get(filePath) ?? { states: new Set<WorktreeChangeState>() };
      for (const state of change.states) current.states.add(state);
      current.originalPath ??= change.originalPath;
      current.sizeBytes ??= change.sizeBytes;
      merged.set(filePath, current);
    }
  }

  return [...merged.entries()].map(([filePath, value]) => ({
    path: filePath,
    states: [...value.states].sort(),
    ...(value.originalPath ? { originalPath: value.originalPath } : {}),
    ...(value.sizeBytes === undefined ? {} : { sizeBytes: value.sizeBytes }),
  }));
}

export function attachWorktreeFileSizes(
  root: string,
  changes: readonly WorktreePathChange[],
): readonly WorktreePathChange[] {
  return changes.map((change) => {
    try {
      const absolutePath = path.resolve(root, change.path);
      const relativePath = path.relative(root, absolutePath);
      if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) return change;
      const fileStatus = lstatSync(absolutePath);
      return { ...change, sizeBytes: fileStatus.isFile() ? fileStatus.size : 0 };
    } catch {
      return change;
    }
  });
}

export function formatWorktreeHealth(report: WorktreeHealthReport): string {
  const lines = [
    `Repository worktree health: ${report.health.toUpperCase()}`,
    `Dirty paths: ${report.totalPaths} (budget ${report.maxDirtyPaths})`,
    `States: staged ${report.stateCounts.staged}, unstaged ${report.stateCounts.unstaged}, untracked ${report.stateCounts.untracked}`,
  ];
  const populatedSurfaces = Object.entries(report.surfaceCounts).filter(([, count]) => count > 0);
  if (populatedSurfaces.length > 0) {
    lines.push(`Surfaces: ${populatedSurfaces.map(([surface, count]) => `${surface} ${count}`).join(", ")}`);
  }
  if (report.issueCounts.length > 0) {
    lines.push(`Issues: ${report.issueCounts.map(({ code, count }) => `${code} ${count}`).join(", ")}`);
  }
  if (report.recommendations.length > 0) {
    lines.push("Next safe actions:");
    for (const recommendation of report.recommendations) lines.push(`- ${recommendation}`);
  }
  return `${lines.join("\n")}\n`;
}
