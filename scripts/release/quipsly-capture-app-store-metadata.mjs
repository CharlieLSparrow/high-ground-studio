#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { QUIPSLY_CAPTURE_RELEASE_TARGET } from "./quipsly-capture-release-target.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const defaultMetadataPath = path.join(
  repositoryRoot,
  "release/app-store/quipsly-capture/en-US.json",
);

const acceptedPortraitSizes = new Set([
  "1260x2736",
  "1290x2796",
  "1320x2868",
]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function textLength(value) {
  return [...value].length;
}

function byteLength(value) {
  return Buffer.byteLength(value, "utf8");
}

function normalizedRepositoryPath(value) {
  return value.replaceAll("\\", "/").replace(/^(?:\.\/)+/, "");
}

function safeRepositoryPath(value) {
  return (
    typeof value === "string"
    && value.length > 0
    && value === normalizedRepositoryPath(value)
    && !value.startsWith("/")
    && !value.split("/").includes("..")
    && !/[\0\r\n\t*?[\]{}]/.test(value)
  );
}

function requireText(errors, value, label, { minimum = 1, maximum } = {}) {
  if (typeof value !== "string") {
    errors.push(`${label} must be a string.`);
    return;
  }
  const length = textLength(value);
  if (length < minimum) {
    errors.push(`${label} must contain at least ${minimum} character(s).`);
  }
  if (maximum !== undefined && length > maximum) {
    errors.push(`${label} is ${length} characters; maximum is ${maximum}.`);
  }
}

function requireHttpsUrl(errors, value, label, expected) {
  requireText(errors, value, label);
  if (typeof value !== "string") return;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    errors.push(`${label} must be a valid absolute URL.`);
    return;
  }
  if (
    parsed.protocol !== "https:"
    || parsed.username
    || parsed.password
    || parsed.port
    || parsed.hash
  ) {
    errors.push(`${label} must be a canonical HTTPS URL without credentials, a port, or a fragment.`);
  }
  if (expected && value !== expected) {
    errors.push(`${label} must equal ${expected}.`);
  }
}

function findSecretLikeKeys(value, trail = []) {
  const findings = [];
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      findings.push(...findSecretLikeKeys(entry, [...trail, String(index)]));
    });
    return findings;
  }
  if (!isRecord(value)) return findings;
  for (const [key, entry] of Object.entries(value)) {
    const nextTrail = [...trail, key];
    if (/(?:password|passcode|secret|token|api.?key|private.?key)/i.test(key)) {
      findings.push(nextTrail.join("."));
    }
    findings.push(...findSecretLikeKeys(entry, nextTrail));
  }
  return findings;
}

function imageDimensions(buffer, filename) {
  if (
    buffer.length >= 24
    && buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  ) {
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }

  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      if (marker === 0xd8 || marker === 0xd9) {
        offset += 2;
        continue;
      }
      const segmentLength = buffer.readUInt16BE(offset + 2);
      if (segmentLength < 2 || offset + 2 + segmentLength > buffer.length) break;
      if (
        (marker >= 0xc0 && marker <= 0xc3)
        || (marker >= 0xc5 && marker <= 0xc7)
        || (marker >= 0xc9 && marker <= 0xcb)
        || (marker >= 0xcd && marker <= 0xcf)
      ) {
        return {
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7),
        };
      }
      offset += 2 + segmentLength;
    }
  }

  throw new Error(`${filename} is not a readable PNG or JPEG screenshot.`);
}

export function validateAppStoreMetadata(
  metadata,
  {
    root = repositoryRoot,
    requireSubmissionReady = false,
  } = {},
) {
  const errors = [];
  const metrics = {};

  if (!isRecord(metadata)) {
    return { ok: false, errors: ["Metadata root must be an object."], metrics };
  }
  if (metadata.schemaVersion !== 1) {
    errors.push("schemaVersion must equal 1.");
  }
  if (metadata.locale !== "en-US") {
    errors.push("The first canonical localization must be en-US.");
  }

  const app = isRecord(metadata.app) ? metadata.app : {};
  const version = isRecord(metadata.version) ? metadata.version : {};
  const review = isRecord(metadata.review) ? metadata.review : {};
  const privacy = isRecord(metadata.privacy) ? metadata.privacy : {};
  const compliance = isRecord(metadata.compliance) ? metadata.compliance : {};
  const screenshots = isRecord(metadata.screenshots) ? metadata.screenshots : {};
  const submission = isRecord(metadata.submission) ? metadata.submission : {};

  requireText(errors, app.name, "app.name", { minimum: 2, maximum: 30 });
  requireText(errors, app.subtitle, "app.subtitle", { maximum: 30 });
  requireText(errors, app.bundleId, "app.bundleId");
  requireText(errors, app.primaryCategory, "app.primaryCategory");
  requireHttpsUrl(
    errors,
    app.privacyPolicyUrl,
    "app.privacyPolicyUrl",
    "https://quipsly.com/privacy",
  );
  requireHttpsUrl(
    errors,
    app.privacyChoicesUrl,
    "app.privacyChoicesUrl",
    "https://quipsly.com/privacy/account-deletion",
  );

  requireText(errors, version.promotionalText, "version.promotionalText", {
    maximum: 170,
  });
  requireText(errors, version.description, "version.description", {
    maximum: 4_000,
  });
  requireText(errors, version.keywords, "version.keywords");
  requireText(errors, version.copyright, "version.copyright");
  requireHttpsUrl(
    errors,
    version.supportUrl,
    "version.supportUrl",
    "https://quipsly.com/support",
  );
  requireHttpsUrl(
    errors,
    version.marketingUrl,
    "version.marketingUrl",
    "https://quipsly.com",
  );
  if (version.releaseMethod !== "manual") {
    errors.push("version.releaseMethod must be manual for the first production release.");
  }

  if (typeof version.keywords === "string") {
    metrics.keywordsBytes = byteLength(version.keywords);
    if (metrics.keywordsBytes > 100) {
      errors.push(`version.keywords is ${metrics.keywordsBytes} UTF-8 bytes; maximum is 100.`);
    }
    const keywords = version.keywords.split(",").map((entry) => entry.trim());
    if (keywords.some((entry) => entry.length === 0)) {
      errors.push("version.keywords must be a comma-separated list without empty entries.");
    }
    if (new Set(keywords.map((entry) => entry.toLocaleLowerCase())).size !== keywords.length) {
      errors.push("version.keywords must not contain duplicates.");
    }
  }

  for (const [key, value] of [
    ["nameCharacters", app.name],
    ["subtitleCharacters", app.subtitle],
    ["promotionalTextCharacters", version.promotionalText],
    ["descriptionCharacters", version.description],
  ]) {
    if (typeof value === "string") metrics[key] = textLength(value);
  }

  if (review.demoAccountRequired !== true) {
    errors.push("review.demoAccountRequired must be true while sign-in gates core features.");
  }
  if (review.credentialsCommitted !== false) {
    errors.push("review.credentialsCommitted must remain false.");
  }
  if (
    typeof review.credentialStorage !== "string"
    || !/App Store Connect/i.test(review.credentialStorage)
  ) {
    errors.push("review.credentialStorage must name App Store Connect as the credential handoff.");
  }
  requireText(errors, review.whatToTest, "review.whatToTest", { maximum: 4_000 });
  if (!safeRepositoryPath(review.notesFile)) {
    errors.push("review.notesFile must be a safe repository-relative path.");
  } else if (!fs.existsSync(path.join(root, review.notesFile))) {
    errors.push(`review.notesFile does not exist: ${review.notesFile}.`);
  }

  if (!safeRepositoryPath(privacy.sourceManifest)) {
    errors.push("privacy.sourceManifest must be a safe repository-relative path.");
  } else {
    const manifestPath = path.join(root, privacy.sourceManifest);
    if (!fs.existsSync(manifestPath)) {
      errors.push(`privacy.sourceManifest does not exist: ${privacy.sourceManifest}.`);
    } else {
      const manifestText = fs.readFileSync(manifestPath, "utf8");
      const dataTypes = Array.isArray(privacy.collectedDataTypes) ? privacy.collectedDataTypes : [];
      for (const dataType of dataTypes) {
        if (typeof dataType !== "string" || !/^NSPrivacyCollectedDataType[A-Za-z]+$/.test(dataType)) {
          errors.push("privacy.collectedDataTypes must contain only Apple collected-data identifiers.");
        } else if (!manifestText.includes(`<string>${dataType}</string>`)) {
          errors.push(`privacy.sourceManifest does not declare ${dataType}.`);
        }
      }
      for (const match of manifestText.matchAll(/<string>(NSPrivacyCollectedDataType(?!Purpose)[A-Za-z]+)<\/string>/g)) {
        if (!dataTypes.includes(match[1])) errors.push(`privacy.collectedDataTypes omits ${match[1]} from the shipping manifest.`);
      }
    }
  }
  if (privacy.tracking !== false || !Array.isArray(privacy.trackingDomains) || privacy.trackingDomains.length !== 0) {
    errors.push("privacy must declare no tracking and no tracking domains for the current binary.");
  }
  if (privacy.linkedToUser !== true || privacy.purpose !== "App Functionality") {
    errors.push("privacy collection must remain linked to the user for App Functionality.");
  }
  if (privacy.publicationStatus !== "requires-account-holder-approval") {
    errors.push("privacy.publicationStatus must remain account-holder gated until provider publication is proved.");
  }

  const providerConfiguredFields = ["contentRights", "ageRating", "price", "territories"];
  const configuredFields = providerConfiguredFields.filter(
    (field) => compliance[field]?.status === "configured-and-read-back",
  );
  for (const field of providerConfiguredFields) {
    const status = compliance[field]?.status;
    if (!["requires-account-holder-approval", "configured-and-read-back"].includes(status)) {
      errors.push(`compliance.${field}.status must be account-holder gated or provider-read-back.`);
    }
  }
  if (configuredFields.length > 0) {
    const target = isRecord(compliance.providerTarget) ? compliance.providerTarget : {};
    if (
      target.appId !== QUIPSLY_CAPTURE_RELEASE_TARGET.appId
      || target.version !== QUIPSLY_CAPTURE_RELEASE_TARGET.marketingVersion
      || target.build !== QUIPSLY_CAPTURE_RELEASE_TARGET.buildNumber
      || !Number.isFinite(Date.parse(target.auditedAt))
    ) {
      errors.push(`compliance.providerTarget must bind provider readback to exact Quipsly Capture Build ${QUIPSLY_CAPTURE_RELEASE_TARGET.buildNumber} with a valid audit timestamp.`);
    }
  }
  const contentRightsReadback = compliance.contentRights?.providerReadback;
  if (
    compliance.contentRights?.status === "configured-and-read-back"
    && (!isRecord(contentRightsReadback)
      || contentRightsReadback.value !== "USES_THIRD_PARTY_CONTENT")
  ) {
    errors.push("compliance.contentRights.providerReadback must prove USES_THIRD_PARTY_CONTENT.");
  }
  const ageRatingReadback = compliance.ageRating?.providerReadback;
  if (
    compliance.ageRating?.status === "configured-and-read-back"
    && (!isRecord(ageRatingReadback)
      || ageRatingReadback.answeredQuestionCount !== 24
      || ageRatingReadback.expectedQuestionCount !== 24
      || ageRatingReadback.appStoreAgeRating !== "TWELVE_PLUS")
  ) {
    errors.push("compliance.ageRating.providerReadback must prove 24/24 answers and TWELVE_PLUS.");
  }
  const priceReadback = compliance.price?.providerReadback;
  if (
    compliance.price?.status === "configured-and-read-back"
    && (!isRecord(priceReadback)
      || priceReadback.customerPrice !== "0.0"
      || priceReadback.baseTerritory !== "USA")
  ) {
    errors.push("compliance.price.providerReadback must prove Free pricing with USA as base territory.");
  }
  const territoryReadback = compliance.territories?.providerReadback;
  if (
    compliance.territories?.status === "configured-and-read-back"
    && (!isRecord(territoryReadback)
      || territoryReadback.reportedTerritoryCount !== 175
      || territoryReadback.readTerritoryCount !== 175
      || JSON.stringify(territoryReadback.availableTerritoryIds) !== JSON.stringify(["USA"])
      || territoryReadback.availableInNewTerritories !== false
      || !Array.isArray(territoryReadback.blockingContentStatuses)
      || territoryReadback.blockingContentStatuses.length !== 0)
  ) {
    errors.push("compliance.territories.providerReadback must prove a complete 175-row USA-only availability matrix.");
  }
  if (compliance.digitalServicesAct?.status !== "requires-account-holder-approval") {
    errors.push("compliance.digitalServicesAct.status must remain requires-account-holder-approval until account-level verification is proved.");
  }
  const compatibility = isRecord(compliance.compatibility) ? compliance.compatibility : {};
  if (
    compatibility.iphone !== true
    || compatibility.appleSiliconMac !== false
    || compatibility.appleVisionPro !== false
    || compatibility.status !== "requires-provider-cleanup"
  ) {
    errors.push("compliance.compatibility must preserve the iPhone-only first-release posture until provider cleanup is proved.");
  }

  if (screenshots.deviceClass !== "iPhone 6.9-inch") {
    errors.push("screenshots.deviceClass must target the canonical iPhone 6.9-inch slot.");
  }
  if (screenshots.orientation !== "portrait") {
    errors.push("screenshots.orientation must be portrait.");
  }
  if (!safeRepositoryPath(screenshots.assetsDirectory)) {
    errors.push("screenshots.assetsDirectory must be a safe repository-relative path.");
  }

  const planned = Array.isArray(screenshots.planned) ? screenshots.planned : [];
  if (planned.length < 1 || planned.length > 10) {
    errors.push("screenshots.planned must contain between 1 and 10 screenshots.");
  }
  const filenames = new Set();
  planned.forEach((entry, index) => {
    const label = `screenshots.planned[${index}]`;
    if (!isRecord(entry)) {
      errors.push(`${label} must be an object.`);
      return;
    }
    if (entry.order !== index + 1) {
      errors.push(`${label}.order must equal ${index + 1}.`);
    }
    if (
      typeof entry.filename !== "string"
      || path.basename(entry.filename) !== entry.filename
      || !/\.(?:png|jpe?g)$/i.test(entry.filename)
    ) {
      errors.push(`${label}.filename must be one PNG or JPEG basename.`);
    } else if (filenames.has(entry.filename.toLocaleLowerCase())) {
      errors.push(`${label}.filename must be unique.`);
    } else {
      filenames.add(entry.filename.toLocaleLowerCase());
    }
    if (!acceptedPortraitSizes.has(`${entry.width}x${entry.height}`)) {
      errors.push(`${label} must use an accepted 6.9-inch portrait size.`);
    }
    requireText(errors, entry.headline, `${label}.headline`, { maximum: 60 });
    requireText(errors, entry.story, `${label}.story`, { maximum: 240 });
    if (!["pending", "approved"].includes(entry.status)) {
      errors.push(`${label}.status must be pending or approved.`);
    }

    if (
      requireSubmissionReady
      && safeRepositoryPath(screenshots.assetsDirectory)
      && typeof entry.filename === "string"
    ) {
      const screenshotPath = path.join(
        root,
        screenshots.assetsDirectory,
        entry.filename,
      );
      if (!fs.existsSync(screenshotPath)) {
        errors.push(`${label} is missing its approved screenshot: ${screenshotPath}.`);
      } else {
        try {
          const dimensions = imageDimensions(
            fs.readFileSync(screenshotPath),
            entry.filename,
          );
          if (
            dimensions.width !== entry.width
            || dimensions.height !== entry.height
          ) {
            errors.push(
              `${label} is ${dimensions.width}x${dimensions.height}; expected ${entry.width}x${entry.height}.`,
            );
          }
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
        }
      }
      if (entry.status !== "approved") {
        errors.push(`${label}.status must be approved for submission.`);
      }
    }
  });

  const secretLikeKeys = findSecretLikeKeys(metadata);
  if (secretLikeKeys.length > 0) {
    errors.push(`Secret-like metadata keys are forbidden: ${secretLikeKeys.join(", ")}.`);
  }

  if (!["blocked", "ready"].includes(submission.readiness)) {
    errors.push("submission.readiness must be blocked or ready.");
  }
  const blockers = Array.isArray(submission.blockers) ? submission.blockers : [];
  if (blockers.some((entry) => typeof entry !== "string" || entry.trim() === "")) {
    errors.push("submission.blockers must contain only non-empty strings.");
  }
  if (submission.readiness === "blocked" && blockers.length === 0) {
    errors.push("A blocked submission must list at least one blocker.");
  }
  if (submission.readiness === "ready" && blockers.length > 0) {
    errors.push("A ready submission must not list blockers.");
  }
  if (requireSubmissionReady && submission.readiness !== "ready") {
    errors.push("submission.readiness must be ready for --submission.");
  }

  return {
    ok: errors.length === 0,
    errors,
    metrics,
    screenshotCount: planned.length,
    blockerCount: blockers.length,
    submissionReadiness: submission.readiness ?? null,
  };
}

export function readAppStoreMetadata(metadataPath = defaultMetadataPath) {
  return JSON.parse(fs.readFileSync(metadataPath, "utf8"));
}

export function runAppStoreMetadataCli(argv = process.argv.slice(2)) {
  const requireSubmissionReady = argv.includes("--submission");
  const jsonOutput = argv.includes("--json");
  const explicitPath = argv.find((entry) => !entry.startsWith("--"));
  const metadataPath = explicitPath
    ? path.resolve(process.cwd(), explicitPath)
    : defaultMetadataPath;
  const result = validateAppStoreMetadata(readAppStoreMetadata(metadataPath), {
    root: repositoryRoot,
    requireSubmissionReady,
  });

  if (jsonOutput) {
    process.stdout.write(`${JSON.stringify({ metadataPath, ...result }, null, 2)}\n`);
  } else if (result.ok) {
    console.log(
      `PASS App Store metadata: ${result.screenshotCount} planned screenshots, `
      + `${result.blockerCount} explicit blockers, status ${result.submissionReadiness}.`,
    );
    console.log(
      `PASS Limits: name ${result.metrics.nameCharacters}/30, `
      + `subtitle ${result.metrics.subtitleCharacters}/30, `
      + `promotional text ${result.metrics.promotionalTextCharacters}/170, `
      + `description ${result.metrics.descriptionCharacters}/4000, `
      + `keywords ${result.metrics.keywordsBytes}/100 UTF-8 bytes.`,
    );
  } else {
    console.error("FAIL App Store metadata:");
    result.errors.forEach((error) => console.error(`- ${error}`));
  }
  return result.ok ? 0 : 1;
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  process.exitCode = runAppStoreMetadataCli();
}
