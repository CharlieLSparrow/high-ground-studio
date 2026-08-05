#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parseXmlPropertyList } from "../lib/parse-xml-property-list.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const defaultQuestionnairePath = path.join(
  repositoryRoot,
  "release/app-store/quipsly-capture/privacy-questionnaire.json",
);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function safeRepositoryPath(value) {
  return typeof value === "string"
    && value.length > 0
    && !value.startsWith("/")
    && !value.split("/").includes("..")
    && !/[\0\r\n\t*?[\]{}]/.test(value);
}

function walkFiles(root, filename, results = []) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const candidate = path.join(root, entry.name);
    if (entry.isDirectory()) walkFiles(candidate, filename, results);
    else if (entry.isFile() && entry.name === filename) results.push(candidate);
  }
  return results;
}

function resolveArchiveApp(archivePath) {
  const resolved = path.resolve(archivePath);
  if (!fs.existsSync(resolved)) throw new Error(`Archive evidence does not exist: ${resolved}`);
  if (resolved.endsWith(".app") && fs.statSync(resolved).isDirectory()) return resolved;
  if (!resolved.endsWith(".xcarchive") || !fs.statSync(resolved).isDirectory()) {
    throw new Error("--archive must identify a .xcarchive or extracted .app directory.");
  }
  const applications = path.join(resolved, "Products/Applications");
  const apps = fs.readdirSync(applications)
    .filter((name) => name.endsWith(".app"))
    .map((name) => path.join(applications, name));
  if (apps.length !== 1) throw new Error(`Expected one app in the archive; found ${apps.length}.`);
  return apps[0];
}

function normalizeDataType(entry) {
  return {
    identifier: entry.NSPrivacyCollectedDataType,
    linkedToUser: entry.NSPrivacyCollectedDataTypeLinked === true,
    tracking: entry.NSPrivacyCollectedDataTypeTracking === true,
    purposes: sortedUnique(entry.NSPrivacyCollectedDataTypePurposes || []),
  };
}

export function aggregatePrivacyManifests(appPath) {
  const manifests = walkFiles(appPath, "PrivacyInfo.xcprivacy").sort();
  if (manifests.length === 0) throw new Error("The app bundle contains no privacy manifests.");
  const types = new Map();
  const trackingDomains = new Set();
  let tracking = false;
  const digest = crypto.createHash("sha256");
  const manifestSummaries = [];

  for (const manifestPath of manifests) {
    const relativePath = path.relative(appPath, manifestPath).replaceAll(path.sep, "/");
    const raw = fs.readFileSync(manifestPath);
    digest.update(relativePath);
    digest.update("\0");
    digest.update(raw);
    digest.update("\0");
    const manifest = parseXmlPropertyList(raw.toString("utf8"));
    tracking ||= manifest.NSPrivacyTracking === true;
    for (const domain of manifest.NSPrivacyTrackingDomains || []) trackingDomains.add(domain);
    const declared = [];
    for (const value of manifest.NSPrivacyCollectedDataTypes || []) {
      const entry = normalizeDataType(value);
      if (!entry.identifier) continue;
      declared.push(entry.identifier);
      const current = types.get(entry.identifier) || {
        identifier: entry.identifier,
        linkedToUser: false,
        tracking: false,
        purposes: [],
        sources: [],
      };
      current.linkedToUser ||= entry.linkedToUser;
      current.tracking ||= entry.tracking;
      current.purposes = sortedUnique([...current.purposes, ...entry.purposes]);
      current.sources = sortedUnique([...current.sources, relativePath]);
      types.set(entry.identifier, current);
    }
    manifestSummaries.push({ path: relativePath, collectedDataTypes: sortedUnique(declared) });
  }

  return {
    manifestCount: manifests.length,
    aggregateSha256: digest.digest("hex"),
    tracking,
    trackingDomains: sortedUnique([...trackingDomains]),
    collectedDataTypes: [...types.values()].sort((left, right) => left.identifier.localeCompare(right.identifier)),
    manifests: manifestSummaries,
  };
}

function validateType(errors, entry, label) {
  if (!isRecord(entry)) {
    errors.push(`${label} must be an object.`);
    return;
  }
  if (typeof entry.identifier !== "string" || !/^NSPrivacyCollectedDataType[A-Za-z]+$/.test(entry.identifier)) {
    errors.push(`${label}.identifier must be an Apple collected-data identifier.`);
  }
  if (typeof entry.appStoreCategory !== "string" || !entry.appStoreCategory.trim()) {
    errors.push(`${label}.appStoreCategory is required.`);
  }
  if (typeof entry.appStoreType !== "string" || !entry.appStoreType.trim()) {
    errors.push(`${label}.appStoreType is required.`);
  }
  if (entry.linkedToUser !== true) errors.push(`${label}.linkedToUser must be true for this account-bound app.`);
  if (entry.tracking !== false) errors.push(`${label}.tracking must be false for the current binary.`);
  if (!Array.isArray(entry.purposes) || entry.purposes.length === 0) {
    errors.push(`${label}.purposes must not be empty.`);
  } else if (entry.purposes.some((purpose) => !/^NSPrivacyCollectedDataTypePurpose[A-Za-z]+$/.test(purpose))) {
    errors.push(`${label}.purposes contains an invalid Apple purpose identifier.`);
  }
  if (!Array.isArray(entry.sources) || entry.sources.length === 0) {
    errors.push(`${label}.sources must identify the app or SDK manifest boundary.`);
  }
}

function compareAggregate(errors, questionnaire, aggregate) {
  const expected = new Map(questionnaire.collectedDataTypes.map((entry) => [entry.identifier, entry]));
  const actual = new Map(aggregate.collectedDataTypes.map((entry) => [entry.identifier, entry]));
  for (const [identifier, entry] of actual) {
    const answer = expected.get(identifier);
    if (!answer) {
      errors.push(`Questionnaire omits archive-collected data type ${identifier}.`);
      continue;
    }
    if (answer.linkedToUser !== entry.linkedToUser) errors.push(`${identifier} linked-to-user answer differs from the archive aggregate.`);
    if (answer.tracking !== entry.tracking) errors.push(`${identifier} tracking answer differs from the archive aggregate.`);
    if (JSON.stringify(sortedUnique(answer.purposes)) !== JSON.stringify(entry.purposes)) {
      errors.push(`${identifier} purposes differ from the archive aggregate.`);
    }
  }
  for (const identifier of expected.keys()) {
    if (!actual.has(identifier)) errors.push(`Questionnaire declares ${identifier}, but the archive aggregate does not.`);
  }
  if (questionnaire.tracking.used !== aggregate.tracking) errors.push("Questionnaire tracking answer differs from the archive aggregate.");
  if (JSON.stringify(sortedUnique(questionnaire.tracking.domains)) !== JSON.stringify(aggregate.trackingDomains)) {
    errors.push("Questionnaire tracking domains differ from the archive aggregate.");
  }
  const evidence = questionnaire.archiveEvidence;
  if (evidence.manifestCount !== aggregate.manifestCount) errors.push("archiveEvidence.manifestCount differs from the inspected archive.");
  if (evidence.aggregateSha256 !== aggregate.aggregateSha256) errors.push("archiveEvidence.aggregateSha256 differs from the inspected archive.");
}

export function validatePrivacyQuestionnaire(
  questionnaire,
  { root = repositoryRoot, archivePath = "" } = {},
) {
  const errors = [];
  if (!isRecord(questionnaire)) return { ok: false, errors: ["Questionnaire root must be an object."], aggregate: null };
  if (questionnaire.schemaVersion !== 1) errors.push("schemaVersion must equal 1.");
  if (!isRecord(questionnaire.target)) errors.push("target must be an object.");
  if (questionnaire.target?.appId !== "6780995957") errors.push("target.appId must identify Quipsly Capture.");
  if (questionnaire.target?.bundleId !== "com.highgroundodyssey.HighGroundCapture") errors.push("target.bundleId must identify Quipsly Capture.");
  if (!/^\d+$/.test(questionnaire.target?.build || "")) errors.push("target.build must be numeric.");
  if (!/^[0-9a-f]{40}$/.test(questionnaire.target?.sourceRevision || "")) errors.push("target.sourceRevision must be a full commit SHA.");
  if (questionnaire.publication?.status !== "requires-account-holder-approval") {
    errors.push("publication.status must remain account-holder gated until App Store Connect readback proves publication.");
  }
  if (questionnaire.publication?.providerPublished !== false) errors.push("publication.providerPublished must remain false until read back.");
  if (questionnaire.tracking?.used !== false || !Array.isArray(questionnaire.tracking?.domains) || questionnaire.tracking.domains.length !== 0) {
    errors.push("tracking must declare no tracking and no tracking domains for the current binary.");
  }

  const dataTypes = Array.isArray(questionnaire.collectedDataTypes) ? questionnaire.collectedDataTypes : [];
  if (dataTypes.length === 0) errors.push("collectedDataTypes must not be empty.");
  const identifiers = [];
  dataTypes.forEach((entry, index) => {
    validateType(errors, entry, `collectedDataTypes[${index}]`);
    if (entry?.identifier) identifiers.push(entry.identifier);
  });
  if (new Set(identifiers).size !== identifiers.length) errors.push("collectedDataTypes identifiers must be unique.");
  const reviewedSDKTypes = questionnaire.sourceContracts?.reviewedSDKCollectedDataTypes;
  if (!Array.isArray(reviewedSDKTypes) || reviewedSDKTypes.length === 0) {
    errors.push("sourceContracts.reviewedSDKCollectedDataTypes must preserve the reviewed third-party manifest contract.");
  } else {
    for (const identifier of reviewedSDKTypes) {
      if (!identifiers.includes(identifier)) errors.push(`Questionnaire omits reviewed SDK data type ${identifier}.`);
    }
  }

  for (const field of ["appManifestPath", "packageResolvedPath"]) {
    const value = questionnaire.sourceContracts?.[field];
    if (!safeRepositoryPath(value) || !fs.existsSync(path.join(root, value))) {
      errors.push(`sourceContracts.${field} must identify an existing repository file.`);
    }
  }
  const pinPath = path.join(root, questionnaire.sourceContracts?.packageResolvedPath || "missing");
  if (fs.existsSync(pinPath)) {
    const resolved = JSON.parse(fs.readFileSync(pinPath, "utf8"));
    const pins = new Map((resolved.pins || []).map((pin) => [pin.identity, pin.state?.version]));
    for (const sdk of questionnaire.sdkInventory || []) {
      if (pins.get(sdk.identity) !== sdk.version) errors.push(`SDK pin ${sdk.identity} must remain at reviewed version ${sdk.version}.`);
    }
  }

  const appManifestPath = path.join(root, questionnaire.sourceContracts?.appManifestPath || "missing");
  if (fs.existsSync(appManifestPath)) {
    const appManifest = parseXmlPropertyList(fs.readFileSync(appManifestPath, "utf8"));
    const answers = new Map(dataTypes.map((entry) => [entry.identifier, entry]));
    for (const raw of appManifest.NSPrivacyCollectedDataTypes || []) {
      const declared = normalizeDataType(raw);
      const answer = answers.get(declared.identifier);
      if (!answer) errors.push(`Questionnaire omits app-manifest data type ${declared.identifier}.`);
      else if (!declared.purposes.every((purpose) => answer.purposes.includes(purpose))) {
        errors.push(`${declared.identifier} omits an app-manifest purpose.`);
      }
    }
  }

  let aggregate = null;
  if (archivePath) {
    aggregate = aggregatePrivacyManifests(resolveArchiveApp(archivePath));
    compareAggregate(errors, questionnaire, aggregate);
  }
  return { ok: errors.length === 0, errors, aggregate };
}

function parseArguments(argv) {
  const options = { questionnairePath: defaultQuestionnairePath, archivePath: "", outputPath: "", strict: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--") continue;
    if (flag === "--strict") { options.strict = true; continue; }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
    if (flag === "--questionnaire") options.questionnairePath = value;
    else if (flag === "--archive") options.archivePath = value;
    else if (flag === "--output") options.outputPath = value;
    else throw new Error(`Unknown argument: ${flag}`);
    index += 1;
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const questionnaire = JSON.parse(fs.readFileSync(options.questionnairePath, "utf8"));
  const result = validatePrivacyQuestionnaire(questionnaire, { archivePath: options.archivePath });
  const receipt = {
    schema: "quipsly-capture-privacy-questionnaire-readback-v1",
    checkedAt: new Date().toISOString(),
    ok: result.ok,
    questionnaire: path.relative(repositoryRoot, path.resolve(options.questionnairePath)),
    target: questionnaire.target,
    publication: questionnaire.publication,
    declaredDataTypeCount: questionnaire.collectedDataTypes?.length || 0,
    archiveInspected: Boolean(options.archivePath),
    archiveAggregate: result.aggregate,
    errors: result.errors,
  };
  if (options.outputPath) {
    fs.writeFileSync(options.outputPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
    fs.chmodSync(options.outputPath, 0o600);
  }
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  if (options.strict && !result.ok) process.exitCode = 2;
}

export { parseArguments };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`QUIPSLY_CAPTURE_PRIVACY_FAIL ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
