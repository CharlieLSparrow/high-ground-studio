import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import path from "node:path";

export const RELEASE_MANIFEST_IDS = [
  "capture",
  "nest",
  "hgo-web",
  "quipsly-studio",
  "quipsly-media-verifier",
  "quipsly-media-processor",
  "quipsly-transcript-worker",
] as const;

export type ReleaseManifestId = (typeof RELEASE_MANIFEST_IDS)[number];
export type ReleaseStatus = "active" | "operator-only";
export type ReleaseArtifactKind =
  | "ios-ipa"
  | "cloud-run-image"
  | "cloud-run-job-image"
  | "macos-application";
export type ReleaseDeliveryChannel =
  | "app-store-connect"
  | "cloud-run"
  | "cloud-run-job"
  | "operator";

export interface ReleasePathSet {
  readonly prefixes: readonly string[];
  readonly files: readonly string[];
}

export interface ReleaseChangeDetection {
  readonly deploy: ReleasePathSet;
  readonly validation: ReleasePathSet;
  readonly schema: ReleasePathSet;
}

export interface ReleaseArtifact {
  readonly kind: ReleaseArtifactKind;
  readonly identifier: string;
  readonly sourceRevision: "git-commit-sha";
  readonly materializer: string | null;
  readonly provenanceReceipt: string;
}

export interface ReleaseProofs {
  readonly source: readonly string[];
  readonly deterministic: readonly string[];
  readonly localRuntime: readonly string[];
  readonly credentialedRuntime: readonly string[];
  readonly deliveryReadback: readonly string[];
}

export interface ReleaseDelivery {
  readonly channel: ReleaseDeliveryChannel;
  readonly target: string;
  readonly promotion: "manual" | "operator";
}

export interface ReleaseContext {
  readonly maxMiB: number;
  readonly requiredPaths: readonly string[];
  readonly optionalPaths: readonly string[];
}

export interface ReleaseManifest {
  readonly $schema: "./schema.json";
  readonly schemaVersion: 1;
  readonly id: ReleaseManifestId;
  readonly displayName: string;
  readonly ownerSurface: ReleaseManifestId;
  readonly status: ReleaseStatus;
  readonly applicationRoot: string;
  readonly changeDetection: ReleaseChangeDetection;
  readonly artifact: ReleaseArtifact;
  readonly proofs: ReleaseProofs;
  readonly delivery: ReleaseDelivery;
  readonly releaseContext?: ReleaseContext;
}

export interface ReleaseManifestAudit {
  readonly manifests: readonly ReleaseManifest[];
  readonly errors: readonly string[];
}

export interface ChangedSurfacePlan {
  readonly web: boolean;
  readonly studio: boolean;
  readonly schema: boolean;
  readonly capture: boolean;
  readonly nativeStudio: boolean;
  readonly mediaVerifier: boolean;
  readonly mediaProcessor: boolean;
  readonly transcriptWorker: boolean;
  readonly quipsly: boolean;
  readonly deployTargets: readonly ("web" | "studio")[];
  readonly changedSurfaces: readonly (
    | "web"
    | "studio"
    | "capture"
    | "native-studio"
    | "media-verifier"
    | "media-processor"
    | "transcript-worker"
  )[];
  readonly changedPathCount: number;
  readonly paths: readonly string[];
  readonly matchedManifestIds: readonly ReleaseManifestId[];
  readonly summary: string;
}

const ROOT_KEYS = new Set([
  "$schema",
  "schemaVersion",
  "id",
  "displayName",
  "ownerSurface",
  "status",
  "applicationRoot",
  "changeDetection",
  "artifact",
  "proofs",
  "delivery",
  "releaseContext",
]);
const CHANGE_KEYS = new Set(["deploy", "validation", "schema"]);
const PATH_SET_KEYS = new Set(["prefixes", "files"]);
const ARTIFACT_KEYS = new Set([
  "kind",
  "identifier",
  "sourceRevision",
  "materializer",
  "provenanceReceipt",
]);
const PROOF_KEYS = new Set([
  "source",
  "deterministic",
  "localRuntime",
  "credentialedRuntime",
  "deliveryReadback",
]);
const DELIVERY_KEYS = new Set(["channel", "target", "promotion"]);
const CONTEXT_KEYS = new Set(["maxMiB", "requiredPaths", "optionalPaths"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizedRepositoryPath(filePath: string): string {
  return filePath.trim().replaceAll("\\", "/").replace(/^(?:\.\/)+/, "");
}

function unknownKeyErrors(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  label: string,
): readonly string[] {
  return Object.keys(value)
    .filter((key) => !allowed.has(key))
    .sort()
    .map((key) => `${label}: unknown property ${key}`);
}

function stringValue(
  value: unknown,
  label: string,
  errors: string[],
): string | null {
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`${label}: expected a non-empty string`);
    return null;
  }
  return value;
}

function stringArray(
  value: unknown,
  label: string,
  errors: string[],
  minimum = 0,
): readonly string[] {
  if (!Array.isArray(value)) {
    errors.push(`${label}: expected an array`);
    return [];
  }
  const values: string[] = [];
  for (const [index, entry] of value.entries()) {
    const parsed = stringValue(entry, `${label}[${index}]`, errors);
    if (parsed !== null) values.push(parsed);
  }
  if (values.length < minimum) {
    errors.push(`${label}: expected at least ${minimum} entr${minimum === 1 ? "y" : "ies"}`);
  }
  const duplicates = values.filter((entry, index) => values.indexOf(entry) !== index);
  for (const duplicate of [...new Set(duplicates)].sort()) {
    errors.push(`${label}: duplicate entry ${duplicate}`);
  }
  return values;
}

function repositoryPathErrors(
  value: string,
  label: string,
  kind: "file" | "prefix",
): readonly string[] {
  const errors: string[] = [];
  if (
    value !== normalizedRepositoryPath(value)
    || value.startsWith("/")
    || value.includes("\0")
    || /[\r\n\t]/.test(value)
    || value.split("/").includes("..")
    || /[*?[\]{}]/.test(value)
  ) {
    errors.push(`${label}: expected a normalized, repository-relative path without traversal, control characters, or globs`);
  }
  if (kind === "file" && value.endsWith("/")) {
    errors.push(`${label}: exact file paths must not end with /`);
  }
  return errors;
}

function parsePathSet(
  value: unknown,
  label: string,
  errors: string[],
): ReleasePathSet {
  if (!isRecord(value)) {
    errors.push(`${label}: expected an object`);
    return { prefixes: [], files: [] };
  }
  errors.push(...unknownKeyErrors(value, PATH_SET_KEYS, label));
  const prefixes = stringArray(value.prefixes, `${label}.prefixes`, errors);
  const files = stringArray(value.files, `${label}.files`, errors);
  for (const [index, prefix] of prefixes.entries()) {
    errors.push(...repositoryPathErrors(prefix, `${label}.prefixes[${index}]`, "prefix"));
  }
  for (const [index, file] of files.entries()) {
    errors.push(...repositoryPathErrors(file, `${label}.files[${index}]`, "file"));
  }
  return { prefixes, files };
}

function pathExists(root: string, repositoryPath: string): boolean {
  const absolutePath = path.resolve(root, repositoryPath);
  const relativePath = path.relative(root, absolutePath);
  return (
    !relativePath.startsWith("..")
    && !path.isAbsolute(relativePath)
    && existsSync(absolutePath)
  );
}

export function validateReleaseManifest(
  input: unknown,
  {
    root,
    manifestPath,
  }: {
    readonly root: string;
    readonly manifestPath: string;
  },
): readonly string[] {
  const errors: string[] = [];
  if (!isRecord(input)) return [`${manifestPath}: expected a JSON object`];
  errors.push(...unknownKeyErrors(input, ROOT_KEYS, manifestPath));

  if (input.$schema !== "./schema.json") {
    errors.push(`${manifestPath}.$schema: expected ./schema.json`);
  }
  if (input.schemaVersion !== 1) {
    errors.push(`${manifestPath}.schemaVersion: expected 1`);
  }

  const id = stringValue(input.id, `${manifestPath}.id`, errors);
  if (id !== null && !RELEASE_MANIFEST_IDS.includes(id as ReleaseManifestId)) {
    errors.push(`${manifestPath}.id: unsupported release manifest id ${id}`);
  }
  stringValue(input.displayName, `${manifestPath}.displayName`, errors);
  const ownerSurface = stringValue(input.ownerSurface, `${manifestPath}.ownerSurface`, errors);
  if (id !== null && ownerSurface !== null && id !== ownerSurface) {
    errors.push(`${manifestPath}.ownerSurface: expected ${id}`);
  }
  if (!["active", "operator-only"].includes(String(input.status))) {
    errors.push(`${manifestPath}.status: expected active or operator-only`);
  }

  const applicationRoot = stringValue(
    input.applicationRoot,
    `${manifestPath}.applicationRoot`,
    errors,
  );
  if (applicationRoot !== null) {
    errors.push(...repositoryPathErrors(
      applicationRoot,
      `${manifestPath}.applicationRoot`,
      "prefix",
    ));
    if (!pathExists(root, applicationRoot)) {
      errors.push(`${manifestPath}.applicationRoot: path does not exist: ${applicationRoot}`);
    }
  }

  let deploy: ReleasePathSet = { prefixes: [], files: [] };
  if (!isRecord(input.changeDetection)) {
    errors.push(`${manifestPath}.changeDetection: expected an object`);
  } else {
    errors.push(...unknownKeyErrors(
      input.changeDetection,
      CHANGE_KEYS,
      `${manifestPath}.changeDetection`,
    ));
    deploy = parsePathSet(
      input.changeDetection.deploy,
      `${manifestPath}.changeDetection.deploy`,
      errors,
    );
    parsePathSet(
      input.changeDetection.validation,
      `${manifestPath}.changeDetection.validation`,
      errors,
    );
    parsePathSet(
      input.changeDetection.schema,
      `${manifestPath}.changeDetection.schema`,
      errors,
    );
  }
  if (deploy.prefixes.length + deploy.files.length === 0) {
    errors.push(`${manifestPath}.changeDetection.deploy: expected at least one path`);
  }
  if (!deploy.files.includes(manifestPath)) {
    errors.push(`${manifestPath}.changeDetection.deploy.files: must include ${manifestPath}`);
  }

  if (!isRecord(input.artifact)) {
    errors.push(`${manifestPath}.artifact: expected an object`);
  } else {
    errors.push(...unknownKeyErrors(input.artifact, ARTIFACT_KEYS, `${manifestPath}.artifact`));
    if (![
      "ios-ipa",
      "cloud-run-image",
      "cloud-run-job-image",
      "macos-application",
    ].includes(String(input.artifact.kind))) {
      errors.push(`${manifestPath}.artifact.kind: unsupported artifact kind`);
    }
    stringValue(input.artifact.identifier, `${manifestPath}.artifact.identifier`, errors);
    if (input.artifact.sourceRevision !== "git-commit-sha") {
      errors.push(`${manifestPath}.artifact.sourceRevision: expected git-commit-sha`);
    }
    if (input.artifact.materializer !== null) {
      const materializer = stringValue(
        input.artifact.materializer,
        `${manifestPath}.artifact.materializer`,
        errors,
      );
      if (materializer !== null) {
        errors.push(...repositoryPathErrors(
          materializer,
          `${manifestPath}.artifact.materializer`,
          "file",
        ));
        if (!pathExists(root, materializer)) {
          errors.push(`${manifestPath}.artifact.materializer: path does not exist: ${materializer}`);
        }
      }
    } else if (input.status === "active") {
      errors.push(`${manifestPath}.artifact.materializer: active releases require a materializer`);
    }
    stringValue(
      input.artifact.provenanceReceipt,
      `${manifestPath}.artifact.provenanceReceipt`,
      errors,
    );
  }

  if (!isRecord(input.proofs)) {
    errors.push(`${manifestPath}.proofs: expected an object`);
  } else {
    errors.push(...unknownKeyErrors(input.proofs, PROOF_KEYS, `${manifestPath}.proofs`));
    for (const proofKey of PROOF_KEYS) {
      stringArray(
        input.proofs[proofKey],
        `${manifestPath}.proofs.${proofKey}`,
        errors,
        1,
      );
    }
  }

  if (!isRecord(input.delivery)) {
    errors.push(`${manifestPath}.delivery: expected an object`);
  } else {
    errors.push(...unknownKeyErrors(input.delivery, DELIVERY_KEYS, `${manifestPath}.delivery`));
    if (![
      "app-store-connect",
      "cloud-run",
      "cloud-run-job",
      "operator",
    ].includes(String(input.delivery.channel))) {
      errors.push(`${manifestPath}.delivery.channel: unsupported delivery channel`);
    }
    stringValue(input.delivery.target, `${manifestPath}.delivery.target`, errors);
    if (!["manual", "operator"].includes(String(input.delivery.promotion))) {
      errors.push(`${manifestPath}.delivery.promotion: expected manual or operator`);
    }
  }

  if (input.releaseContext !== undefined) {
    if (!isRecord(input.releaseContext)) {
      errors.push(`${manifestPath}.releaseContext: expected an object`);
    } else {
      errors.push(...unknownKeyErrors(
        input.releaseContext,
        CONTEXT_KEYS,
        `${manifestPath}.releaseContext`,
      ));
      if (
        typeof input.releaseContext.maxMiB !== "number"
        || !Number.isFinite(input.releaseContext.maxMiB)
        || input.releaseContext.maxMiB <= 0
      ) {
        errors.push(`${manifestPath}.releaseContext.maxMiB: expected a positive number`);
      }
      const requiredPaths = stringArray(
        input.releaseContext.requiredPaths,
        `${manifestPath}.releaseContext.requiredPaths`,
        errors,
        1,
      );
      const optionalPaths = stringArray(
        input.releaseContext.optionalPaths,
        `${manifestPath}.releaseContext.optionalPaths`,
        errors,
      );
      for (const [index, requiredPath] of requiredPaths.entries()) {
        errors.push(...repositoryPathErrors(
          requiredPath,
          `${manifestPath}.releaseContext.requiredPaths[${index}]`,
          "file",
        ));
        if (!pathExists(root, requiredPath)) {
          errors.push(`${manifestPath}.releaseContext.requiredPaths[${index}]: path does not exist: ${requiredPath}`);
        }
      }
      for (const [index, optionalPath] of optionalPaths.entries()) {
        errors.push(...repositoryPathErrors(
          optionalPath,
          `${manifestPath}.releaseContext.optionalPaths[${index}]`,
          "file",
        ));
      }
      if (!requiredPaths.includes(manifestPath)) {
        errors.push(`${manifestPath}.releaseContext.requiredPaths: must include ${manifestPath}`);
      }
    }
  }

  for (const pathSet of [
    isRecord(input.changeDetection) ? input.changeDetection.deploy : undefined,
    isRecord(input.changeDetection) ? input.changeDetection.validation : undefined,
    isRecord(input.changeDetection) ? input.changeDetection.schema : undefined,
  ]) {
    if (!isRecord(pathSet) || !Array.isArray(pathSet.files)) continue;
    for (const exactPath of pathSet.files) {
      if (typeof exactPath === "string" && !pathExists(root, exactPath)) {
        errors.push(`${manifestPath}: declared exact change path does not exist: ${exactPath}`);
      }
    }
  }

  return [...new Set(errors)];
}

export function parseReleaseManifest(
  input: unknown,
  options: {
    readonly root: string;
    readonly manifestPath: string;
  },
): ReleaseManifest {
  const errors = validateReleaseManifest(input, options);
  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }
  return input as ReleaseManifest;
}

export function auditReleaseManifests(root: string): ReleaseManifestAudit {
  const manifestDirectory = path.join(root, "release", "manifests");
  if (!existsSync(manifestDirectory) || !statSync(manifestDirectory).isDirectory()) {
    return {
      manifests: [],
      errors: ["release/manifests: directory does not exist"],
    };
  }

  const manifests: ReleaseManifest[] = [];
  const errors: string[] = [];
  const schemaPath = path.join(manifestDirectory, "schema.json");
  try {
    const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as unknown;
    if (!isRecord(schema) || schema.$schema !== "https://json-schema.org/draft/2020-12/schema") {
      errors.push("release/manifests/schema.json: expected a Draft 2020-12 JSON Schema");
    }
  } catch (error) {
    errors.push(`release/manifests/schema.json: invalid or missing JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  for (const filename of readdirSync(manifestDirectory).sort()) {
    if (!filename.endsWith(".json") || filename === "schema.json") continue;
    const manifestPath = `release/manifests/${filename}`;
    let input: unknown;
    try {
      input = JSON.parse(readFileSync(path.join(root, manifestPath), "utf8"));
    } catch (error) {
      errors.push(`${manifestPath}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    const manifestErrors = validateReleaseManifest(input, { root, manifestPath });
    if (manifestErrors.length > 0) {
      errors.push(...manifestErrors);
      continue;
    }
    const manifest = input as ReleaseManifest;
    if (manifestPath !== `release/manifests/${manifest.id}.json`) {
      errors.push(`${manifestPath}: filename must match release id ${manifest.id}`);
      continue;
    }
    manifests.push(manifest);
  }

  const idCounts = new Map<string, number>();
  for (const manifest of manifests) {
    idCounts.set(manifest.id, (idCounts.get(manifest.id) ?? 0) + 1);
  }
  for (const id of RELEASE_MANIFEST_IDS) {
    const count = idCounts.get(id) ?? 0;
    if (count !== 1) errors.push(`release/manifests: expected exactly one ${id} manifest, found ${count}`);
  }

  return {
    manifests: manifests.sort((left, right) => left.id.localeCompare(right.id)),
    errors: [...new Set(errors)].sort(),
  };
}

export function loadReleaseManifests(root: string): readonly ReleaseManifest[] {
  const audit = auditReleaseManifests(root);
  if (audit.errors.length > 0) throw new Error(audit.errors.join("\n"));
  return audit.manifests;
}

export function releasePathSetMatches(filePath: string, pathSet: ReleasePathSet): boolean {
  const normalizedPath = normalizedRepositoryPath(filePath);
  return (
    pathSet.files.includes(normalizedPath)
    || pathSet.prefixes.some((prefix) => normalizedPath.startsWith(prefix))
  );
}

function normalizedPaths(paths: readonly string[]): readonly string[] {
  return [...new Set(paths.map(normalizedRepositoryPath).filter(Boolean))].sort();
}

function manifestById(
  manifests: readonly ReleaseManifest[],
  id: ReleaseManifestId,
): ReleaseManifest {
  const manifest = manifests.find((candidate) => candidate.id === id);
  if (!manifest) throw new Error(`Missing ${id} release manifest.`);
  return manifest;
}

function anyPathMatches(paths: readonly string[], pathSet: ReleasePathSet): boolean {
  return paths.some((filePath) => releasePathSetMatches(filePath, pathSet));
}

function deployablePaths(
  paths: readonly string[],
  manifests: readonly ReleaseManifest[],
): readonly string[] {
  return paths.filter((filePath) =>
    !manifests.some((manifest) =>
      releasePathSetMatches(filePath, manifest.changeDetection.validation)));
}

export function planChangedSurfaces(
  inputPaths: readonly string[],
  manifests: readonly ReleaseManifest[],
): ChangedSurfacePlan {
  const paths = normalizedPaths(inputPaths);
  // Validation declarations are global ownership: proof/tooling paths must not
  // wake another app merely because they sit below an older broad prefix.
  const deployPaths = deployablePaths(paths, manifests);
  const captureManifest = manifestById(manifests, "capture");
  const nestManifest = manifestById(manifests, "nest");
  const webManifest = manifestById(manifests, "hgo-web");
  const nativeStudioManifest = manifestById(manifests, "quipsly-studio");
  const mediaVerifierManifest = manifestById(
    manifests,
    "quipsly-media-verifier",
  );
  const mediaProcessorManifest = manifestById(
    manifests,
    "quipsly-media-processor",
  );
  const transcriptWorkerManifest = manifestById(
    manifests,
    "quipsly-transcript-worker",
  );

  const web = anyPathMatches(deployPaths, webManifest.changeDetection.deploy);
  const studio = anyPathMatches(deployPaths, nestManifest.changeDetection.deploy);
  const schema = manifests.some((manifest) =>
    anyPathMatches(paths, manifest.changeDetection.schema));
  const capture =
    anyPathMatches(deployPaths, captureManifest.changeDetection.deploy)
    || anyPathMatches(paths, captureManifest.changeDetection.validation);
  const nativeStudio = anyPathMatches(
    deployPaths,
    nativeStudioManifest.changeDetection.deploy,
  );
  const mediaVerifier =
    anyPathMatches(deployPaths, mediaVerifierManifest.changeDetection.deploy)
    || anyPathMatches(
      paths,
      mediaVerifierManifest.changeDetection.validation,
    );
  const mediaProcessor =
    anyPathMatches(deployPaths, mediaProcessorManifest.changeDetection.deploy)
    || anyPathMatches(
      paths,
      mediaProcessorManifest.changeDetection.validation,
    );
  const transcriptWorker =
    anyPathMatches(
      deployPaths,
      transcriptWorkerManifest.changeDetection.deploy,
    )
    || anyPathMatches(
      paths,
      transcriptWorkerManifest.changeDetection.validation,
    );
  const quipsly = studio || anyPathMatches(paths, nestManifest.changeDetection.validation);

  const deployTargets: ("web" | "studio")[] = [
    ...(web ? ["web" as const] : []),
    ...(studio ? ["studio" as const] : []),
  ];
  const changedSurfaces: (
    | "web"
    | "studio"
    | "capture"
    | "native-studio"
    | "media-verifier"
    | "media-processor"
    | "transcript-worker"
  )[] = [
    ...deployTargets,
    ...(capture ? ["capture" as const] : []),
    ...(nativeStudio ? ["native-studio" as const] : []),
    ...(mediaVerifier ? ["media-verifier" as const] : []),
    ...(mediaProcessor ? ["media-processor" as const] : []),
    ...(transcriptWorker ? ["transcript-worker" as const] : []),
  ];
  const matchedManifestIds = [
    ...(capture ? ["capture" as const] : []),
    ...(quipsly ? ["nest" as const] : []),
    ...(web ? ["hgo-web" as const] : []),
    ...(nativeStudio ? ["quipsly-studio" as const] : []),
    ...(mediaVerifier ? ["quipsly-media-verifier" as const] : []),
    ...(mediaProcessor ? ["quipsly-media-processor" as const] : []),
    ...(transcriptWorker ? ["quipsly-transcript-worker" as const] : []),
  ];

  return {
    web,
    studio,
    schema,
    capture,
    nativeStudio,
    mediaVerifier,
    mediaProcessor,
    transcriptWorker,
    quipsly,
    deployTargets,
    changedSurfaces,
    changedPathCount: paths.length,
    paths,
    matchedManifestIds,
    summary: deployTargets.length
      ? `Auto deploy planned for ${deployTargets.join(" and ")} from validated release manifests.`
      : [mediaVerifier, mediaProcessor, transcriptWorker].filter(Boolean).length > 1
        ? "Manual Quipsly worker release validation is required for every changed worker surface."
        : mediaVerifier
          ? "Manual Quipsly media-verifier release validation is required."
          : mediaProcessor
            ? "Manual Quipsly media-processor release validation is required."
            : transcriptWorker
              ? "Manual Quipsly transcript-worker release validation is required."
            : "No deployable app changes detected.",
  };
}
