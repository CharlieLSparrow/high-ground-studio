#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { chmod, readFile, stat, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

import { createScopedToken } from "./quipsly-app-store-connect-readback.mjs";

const execFileAsync = promisify(execFile);
const API_ORIGIN = "https://api.appstoreconnect.apple.com";
const DEFAULTS = Object.freeze({
  appId: "6780995957",
  marketingVersion: "1.0",
  buildNumber: "7",
  groupName: "Quipsly Capture Rehearsal",
  locale: "en-US",
  testerFirstName: "Homer",
  reviewerPasswordKeychainService: "quipsly-capture-reviewer",
  reviewerEmail: "codex@dev.test",
  reviewContactFirstName: "Charlie",
  reviewContactLastName: "Sparrow",
  reviewContactEmail: "charlie@highgroundodyssey.com",
  feedbackEmail: "charlie@highgroundodyssey.com",
  marketingUrl: "https://quipsly.com",
  privacyPolicyUrl: "https://quipsly.com/privacy",
});

export const BETA_DESCRIPTION = [
  "Quipsly Capture is the iPhone edge for Quipsly sessions, notes, tasks, goals, projects, and tags.",
  "It records locally only after an explicit consent step, preserves source media through interruptions,",
  "and syncs verified work to Nest for collaborative review and follow-through.",
].join(" ");

export const WHAT_TO_TEST = [
  "Sign in to your Quipsly account and open the supplied test Session.",
  "Confirm the visible consent gate before recording.",
  "Test a two-person audio room, local audio and iPhone video capture, pause/resume,",
  "and switching between front and back cameras while recording.",
  "End capture, reconnect if needed, confirm upload status, and open the assembled timeline or playback.",
  "Also create a disposable note and task and verify they remain after relaunch.",
  "Do not record anyone without their explicit permission.",
].join(" ");

export const REVIEW_NOTES = [
  "Quipsly Capture is an explicit-consent capture app for coaching, podcast, interview, and field-note sessions.",
  "The supplied reviewer account has a synthetic test Session and no private customer or unpublished media.",
  "Joining a provider room and starting a Quipsly recording are separate actions.",
  "The app preserves local originals until upload is verified and exposes privacy and account-deletion controls.",
].join(" ");

function fail(message) {
  throw new Error(message);
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function takeValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) fail(`${flag} requires a value.`);
  return value;
}

export function parseExternalBetaArguments(argv) {
  const options = {
    apiKeyPath: process.env.APP_STORE_CONNECT_API_KEY_PATH || "",
    appId: DEFAULTS.appId,
    marketingVersion: DEFAULTS.marketingVersion,
    buildNumber: DEFAULTS.buildNumber,
    groupName: DEFAULTS.groupName,
    locale: DEFAULTS.locale,
    testerEmail: process.env.QUIPSLY_CAPTURE_EXTERNAL_TESTER_EMAIL || "",
    testerFirstName: DEFAULTS.testerFirstName,
    testerLastName: "",
    reviewerEmail:
      process.env.QUIPSLY_CAPTURE_REVIEWER_EMAIL || DEFAULTS.reviewerEmail,
    reviewerPasswordKeychainService:
      process.env.QUIPSLY_CAPTURE_REVIEWER_PASSWORD_KEYCHAIN_SERVICE
      || DEFAULTS.reviewerPasswordKeychainService,
    reviewerPasswordKeychainAccount:
      process.env.QUIPSLY_CAPTURE_REVIEWER_PASSWORD_KEYCHAIN_ACCOUNT || "",
    reviewContactFirstName:
      process.env.QUIPSLY_CAPTURE_REVIEW_CONTACT_FIRST_NAME
      || DEFAULTS.reviewContactFirstName,
    reviewContactLastName:
      process.env.QUIPSLY_CAPTURE_REVIEW_CONTACT_LAST_NAME
      || DEFAULTS.reviewContactLastName,
    reviewContactEmail:
      process.env.QUIPSLY_CAPTURE_REVIEW_CONTACT_EMAIL
      || DEFAULTS.reviewContactEmail,
    reviewContactPhone:
      process.env.QUIPSLY_CAPTURE_REVIEW_CONTACT_PHONE || "",
    feedbackEmail:
      process.env.QUIPSLY_CAPTURE_FEEDBACK_EMAIL || DEFAULTS.feedbackEmail,
    outputPath: "",
    apply: false,
    submitForReview: false,
    allowCreateExternalGroup: false,
    publicLinkOnly: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--") continue;
    if (flag === "--help" || flag === "-h") {
      options.help = true;
      continue;
    }
    if (flag === "--apply") {
      options.apply = true;
      continue;
    }
    if (flag === "--submit-for-review") {
      options.submitForReview = true;
      continue;
    }
    if (flag === "--allow-create-external-group") {
      options.allowCreateExternalGroup = true;
      continue;
    }
    if (flag === "--public-link-only") {
      options.publicLinkOnly = true;
      continue;
    }

    const value = takeValue(argv, index, flag);
    if (flag === "--api-key-path") options.apiKeyPath = value;
    else if (flag === "--app-id") options.appId = value;
    else if (flag === "--version") options.marketingVersion = value;
    else if (flag === "--build") options.buildNumber = value;
    else if (flag === "--group") options.groupName = value;
    else if (flag === "--locale") options.locale = value;
    else if (flag === "--tester-email") options.testerEmail = value;
    else if (flag === "--tester-first-name") options.testerFirstName = value;
    else if (flag === "--tester-last-name") options.testerLastName = value;
    else if (flag === "--reviewer-email") options.reviewerEmail = value;
    else if (flag === "--reviewer-password-keychain-service") {
      options.reviewerPasswordKeychainService = value;
    } else if (flag === "--reviewer-password-keychain-account") {
      options.reviewerPasswordKeychainAccount = value;
    } else if (flag === "--review-contact-first-name") {
      options.reviewContactFirstName = value;
    } else if (flag === "--review-contact-last-name") {
      options.reviewContactLastName = value;
    } else if (flag === "--review-contact-email") {
      options.reviewContactEmail = value;
    } else if (flag === "--review-contact-phone") {
      options.reviewContactPhone = value;
    } else if (flag === "--feedback-email") options.feedbackEmail = value;
    else if (flag === "--output") options.outputPath = value;
    else fail(`Unknown argument: ${flag}`);
    index += 1;
  }

  if (options.submitForReview && !options.apply) {
    fail("--submit-for-review requires --apply.");
  }
  if (options.publicLinkOnly && clean(options.testerEmail)) {
    fail("--public-link-only cannot be combined with --tester-email.");
  }
  return options;
}

function usage() {
  return `Usage:
  APP_STORE_CONNECT_API_KEY_PATH=/absolute/private/key.json \\
    node scripts/release/quipsly-app-store-connect-external-beta.mjs \\
      (--tester-email <email> | --public-link-only) \\
      [--apply] [--submit-for-review] [options]

Without --apply, the command is a read-only plan.

Options:
  --api-key-path <path>                     Fastlane API-key JSON.
  --app-id <id>                             App Store Connect app ID.
  --version <version>                       Marketing version.
  --build <number>                          Build number.
  --group <name>                            External TestFlight group.
  --locale <locale>                         Beta metadata locale.
  --tester-email <email>                    External tester Apple Account.
  --tester-first-name <name>                Optional tester first name.
  --tester-last-name <name>                 Optional tester last name.
  --public-link-only                        Assign the build to an existing,
                                             already-enabled public-link group
                                             without creating or assigning a
                                             named tester.
  --reviewer-email <email>                  Quipsly demo-account email.
  --reviewer-password-keychain-service <s>  macOS Keychain service.
  --reviewer-password-keychain-account <a>  macOS Keychain account.
  --review-contact-first-name <name>         Apple review contact.
  --review-contact-last-name <name>          Apple review contact.
  --review-contact-email <email>             Apple review contact.
  --review-contact-phone <phone>             Apple review contact.
  --feedback-email <email>                   TestFlight feedback email.
  --allow-create-external-group              Explicitly authorize creating a
                                             missing external group. Omit for
                                             ordinary build assignment.
  --output <path>                            Redacted mode-0600 receipt.
  --apply                                    Apply idempotent changes.
  --submit-for-review                        Submit Build for beta review.
`;
}

function makeRequest(apiPath, searchEntries = [], method = "GET") {
  const url = new URL(apiPath, API_ORIGIN);
  for (const [key, value] of searchEntries) url.searchParams.append(key, value);
  const requestPath = `${url.pathname}${url.search}`;
  return {
    method,
    scope: `${method} ${decodeURIComponent(requestPath)}`,
    url: url.toString(),
  };
}

async function readApiKey(apiKeyPath) {
  if (!apiKeyPath) fail("APP_STORE_CONNECT_API_KEY_PATH is required.");
  const fileStat = await stat(apiKeyPath);
  if ((fileStat.mode & 0o077) !== 0) {
    fail(`API-key JSON must not be group- or world-readable: ${apiKeyPath}`);
  }
  const document = JSON.parse(await readFile(apiKeyPath, "utf8"));
  for (const field of ["key_id", "issuer_id", "key"]) {
    if (!clean(document[field])) fail(`API-key JSON is missing ${field}.`);
  }
  return {
    keyId: clean(document.key_id),
    issuerId: clean(document.issuer_id),
    privateKey: document.key,
  };
}

async function keychainPassword(service, account) {
  if (!clean(service) || !clean(account)) return "";
  try {
    const result = await execFileAsync(
      "/usr/bin/security",
      ["find-generic-password", "-w", "-s", service, "-a", account],
      { encoding: "utf8", maxBuffer: 64 * 1024 },
    );
    return clean(result.stdout);
  } catch {
    return "";
  }
}

async function requestJson(request, key, body) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = createScopedToken({
      ...key,
      ...(request.method === "GET" ? { scopes: [request.scope] } : {}),
    });
    const response = await fetch(request.url, {
      method: request.method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    const document = text ? JSON.parse(text) : null;
    if (response.ok) return document;
    const details = (document?.errors || []).map(
      ({ status, code, title, detail, source }) => ({
        status,
        code,
        title,
        detail,
        pointer: source?.pointer,
        parameter: source?.parameter,
      }),
    );
    lastError = new Error(
      `App Store Connect returned HTTP ${response.status}: ${JSON.stringify(details)}`,
    );
    if (response.status !== 429 && response.status < 500) break;
    await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
  }
  throw lastError;
}

function relationshipIds(resource, name) {
  const data = resource?.relationships?.[name]?.data;
  if (Array.isArray(data)) return data.map(({ id }) => id);
  return data?.id ? [data.id] : [];
}

function includedResource(document, type, id) {
  return (document.included || []).find(
    (resource) => resource.type === type && resource.id === id,
  );
}

function emailDigest(email) {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

export function resolveExternalBetaTargets({
  options,
  buildDocument,
  groupDocument,
  testerDocument,
}) {
  const build = (buildDocument.data || []).find((candidate) => {
    if (candidate.attributes?.version !== options.buildNumber) return false;
    const preRelease = includedResource(
      buildDocument,
      "preReleaseVersions",
      relationshipIds(candidate, "preReleaseVersion")[0],
    );
    return preRelease?.attributes?.version === options.marketingVersion;
  });
  if (!build) {
    fail(`Build ${options.marketingVersion} (${options.buildNumber}) was not found.`);
  }
  if (build.attributes?.processingState !== "VALID") {
    fail(`Build ${options.marketingVersion} (${options.buildNumber}) is not VALID.`);
  }

  const duplicateGroups = (groupDocument.data || []).filter(
    (candidate) =>
      candidate.attributes?.name === options.groupName
      && candidate.attributes?.isInternalGroup === false,
  );
  if (duplicateGroups.length > 1) {
    fail(`More than one external beta group is named ${options.groupName}.`);
  }
  const group = duplicateGroups[0] || null;

  const matchingTesters = (testerDocument.data || []).filter(
    (candidate) =>
      clean(candidate.attributes?.email).toLowerCase()
      === clean(options.testerEmail).toLowerCase(),
  );
  if (matchingTesters.length > 1) {
    fail("More than one external tester has the requested email address.");
  }
  const tester = matchingTesters[0] || null;

  return {
    build,
    buildId: build.id,
    buildBetaDetailId: relationshipIds(build, "buildBetaDetail")[0] || "",
    group,
    groupId: group?.id || "",
    groupHasBuild: Boolean(group && relationshipIds(group, "builds").includes(build.id)),
    tester,
    testerId: tester?.id || "",
    testerInGroup: Boolean(
      group && tester && relationshipIds(group, "betaTesters").includes(tester.id),
    ),
  };
}

function localizationForLocale(document, locale) {
  const matches = (document.data || []).filter(
    (candidate) => candidate.attributes?.locale === locale,
  );
  if (matches.length > 1) fail(`More than one localization exists for ${locale}.`);
  return matches[0] || null;
}

export function buildExternalGroupBody(options) {
  return {
    data: {
      type: "betaGroups",
      attributes: {
        name: options.groupName,
        isInternalGroup: false,
        hasAccessToAllBuilds: false,
        publicLinkEnabled: false,
        feedbackEnabled: true,
      },
      relationships: {
        app: { data: { type: "apps", id: options.appId } },
      },
    },
  };
}

export function buildTesterBody(options, groupId) {
  const attributes = {
    email: clean(options.testerEmail).toLowerCase(),
  };
  if (clean(options.testerFirstName)) attributes.firstName = clean(options.testerFirstName);
  if (clean(options.testerLastName)) attributes.lastName = clean(options.testerLastName);
  return {
    data: {
      type: "betaTesters",
      attributes,
      relationships: {
        betaGroups: {
          data: [{ type: "betaGroups", id: groupId }],
        },
      },
    },
  };
}

function buildBetaAppLocalizationBody(options) {
  return {
    data: {
      type: "betaAppLocalizations",
      attributes: {
        locale: options.locale,
        description: BETA_DESCRIPTION,
        feedbackEmail: options.feedbackEmail,
        marketingUrl: DEFAULTS.marketingUrl,
        privacyPolicyUrl: DEFAULTS.privacyPolicyUrl,
      },
      relationships: {
        app: { data: { type: "apps", id: options.appId } },
      },
    },
  };
}

function updateBetaAppLocalizationBody(localizationId, options) {
  const body = buildBetaAppLocalizationBody(options);
  body.data.id = localizationId;
  delete body.data.relationships;
  return body;
}

function buildBetaBuildLocalizationBody(options, buildId) {
  return {
    data: {
      type: "betaBuildLocalizations",
      attributes: {
        locale: options.locale,
        whatsNew: WHAT_TO_TEST,
      },
      relationships: {
        build: { data: { type: "builds", id: buildId } },
      },
    },
  };
}

function updateBetaBuildLocalizationBody(localizationId) {
  return {
    data: {
      type: "betaBuildLocalizations",
      id: localizationId,
      attributes: { whatsNew: WHAT_TO_TEST },
    },
  };
}

function buildReviewDetailBody(reviewDetailId, options, reviewerPassword) {
  const attributes = {
    contactFirstName: options.reviewContactFirstName,
    contactLastName: options.reviewContactLastName,
    contactEmail: options.reviewContactEmail,
    demoAccountRequired: true,
    demoAccountName: options.reviewerEmail,
    demoAccountPassword: reviewerPassword,
    notes: REVIEW_NOTES,
  };
  if (clean(options.reviewContactPhone)) {
    attributes.contactPhone = clean(options.reviewContactPhone);
  }
  return {
    data: {
      type: "betaAppReviewDetails",
      id: reviewDetailId,
      attributes,
    },
  };
}

function needsObjectUpdate(actual, desired, keys) {
  return keys.some((key) => actual?.[key] !== desired?.[key]);
}

async function discover(options, key) {
  const requests = {
    builds: makeRequest("/v1/builds", [
      ["filter[app]", options.appId],
      ["filter[version]", options.buildNumber],
      ["include", "preReleaseVersion,buildBetaDetail"],
      ["limit", "10"],
    ]),
    groups: makeRequest("/v1/betaGroups", [
      ["filter[app]", options.appId],
      ["include", "builds,betaTesters"],
      ["limit", "50"],
    ]),
    testers: options.publicLinkOnly
      ? null
      : makeRequest("/v1/betaTesters", [
        ["filter[email]", options.testerEmail],
        ["include", "betaGroups"],
        ["limit", "10"],
      ]),
    appLocalizations: makeRequest("/v1/betaAppLocalizations", [
      ["filter[app]", options.appId],
      ["filter[locale]", options.locale],
      ["limit", "10"],
    ]),
    buildLocalizations: null,
    reviewDetails: makeRequest("/v1/betaAppReviewDetails", [
      ["filter[app]", options.appId],
      ["limit", "10"],
    ]),
    submissions: null,
  };

  const [builds, groups, testers, appLocalizations, reviewDetails] =
    await Promise.all([
      requestJson(requests.builds, key),
      requestJson(requests.groups, key),
      requests.testers
        ? requestJson(requests.testers, key)
        : Promise.resolve({ data: [] }),
      requestJson(requests.appLocalizations, key),
      requestJson(requests.reviewDetails, key),
    ]);
  const targets = resolveExternalBetaTargets({
    options,
    buildDocument: builds,
    groupDocument: groups,
    testerDocument: testers,
  });
  requests.buildLocalizations = makeRequest("/v1/betaBuildLocalizations", [
    ["filter[build]", targets.buildId],
    ["filter[locale]", options.locale],
    ["limit", "10"],
  ]);
  requests.submissions = makeRequest("/v1/betaAppReviewSubmissions", [
    ["filter[build]", targets.buildId],
    ["limit", "10"],
  ]);
  const [buildLocalizations, submissions] = await Promise.all([
    requestJson(requests.buildLocalizations, key),
    requestJson(requests.submissions, key),
  ]);

  const reviewDetailsForApp = reviewDetails.data || [];
  if (reviewDetailsForApp.length !== 1) {
    fail(`Expected exactly one beta app review detail; found ${reviewDetailsForApp.length}.`);
  }
  return {
    requests,
    builds,
    groups,
    testers,
    appLocalizations,
    buildLocalizations,
    reviewDetails,
    submissions,
    targets,
    appLocalization: localizationForLocale(appLocalizations, options.locale),
    buildLocalization: localizationForLocale(buildLocalizations, options.locale),
    reviewDetail: reviewDetailsForApp[0],
  };
}

export function buildPlan({ options, state, reviewerPasswordPresent }) {
  const desiredAppAttributes =
    buildBetaAppLocalizationBody(options).data.attributes;
  const desiredReviewAttributes = {
    contactFirstName: options.reviewContactFirstName,
    contactLastName: options.reviewContactLastName,
    contactEmail: options.reviewContactEmail,
    demoAccountRequired: true,
    demoAccountName: options.reviewerEmail,
    notes: REVIEW_NOTES,
  };
  if (clean(options.reviewContactPhone)) {
    desiredReviewAttributes.contactPhone = clean(options.reviewContactPhone);
  }

  const existingSubmission = (state.submissions.data || [])[0] || null;
  return {
    createExternalGroup: !state.targets.group,
    assignBuildToGroup: !state.targets.groupHasBuild,
    createTester: !options.publicLinkOnly && !state.targets.tester,
    assignTesterToGroup: Boolean(
      !options.publicLinkOnly
      && state.targets.tester
      && !state.targets.testerInGroup
    ),
    createBetaAppLocalization: !state.appLocalization,
    updateBetaAppLocalization: Boolean(
      state.appLocalization
      && needsObjectUpdate(
        state.appLocalization.attributes,
        desiredAppAttributes,
        [
          "description",
          "feedbackEmail",
          "locale",
          "marketingUrl",
          "privacyPolicyUrl",
        ],
      ),
    ),
    createBetaBuildLocalization: !state.buildLocalization,
    updateBetaBuildLocalization: Boolean(
      state.buildLocalization?.attributes?.whatsNew !== WHAT_TO_TEST,
    ),
    enableAutoNotify: (
      includedResource(
        state.builds,
        "buildBetaDetails",
        state.targets.buildBetaDetailId,
      )?.attributes?.autoNotifyEnabled !== true
    ),
    updateReviewDetails: needsObjectUpdate(
      state.reviewDetail.attributes,
      desiredReviewAttributes,
      Object.keys(desiredReviewAttributes),
    ) || (
      reviewerPasswordPresent
      && !clean(state.reviewDetail.attributes?.demoAccountPassword)
    ),
    submitForReview: !existingSubmission,
    existingReviewState: existingSubmission?.attributes?.betaReviewState || null,
    missingReviewContactPhone: !clean(options.reviewContactPhone)
      && !clean(state.reviewDetail.attributes?.contactPhone),
    missingReviewerPassword: !reviewerPasswordPresent
      && !clean(state.reviewDetail.attributes?.demoAccountPassword),
  };
}

export function assertExternalGroupMutationAuthorized(options, plan) {
  if (!plan.createExternalGroup || options.allowCreateExternalGroup) return;
  fail(
    `External group "${options.groupName}" was not visible. `
    + "No mutations were attempted because an empty provider read can be transient. "
    + "Verify the group in App Store Connect and retry. Use "
    + "--allow-create-external-group only when creating a genuinely new group.",
  );
}

export function assertBuildBetaMutationReady(state) {
  if (state.targets.buildBetaDetailId) return;
  fail(
    "Build is VALID but Apple has not published its buildBetaDetail relationship. "
    + "No beta metadata, group, tester, notification, or review mutation was attempted. "
    + "Wait for App Store Connect processing and obtain a fresh provider read.",
  );
}

export function assertPublicLinkDistributionReady(options, state) {
  if (!options.publicLinkOnly) return;
  if (!state.targets.group) {
    fail(
      `Public-link-only distribution requires the existing external group `
      + `"${options.groupName}". No mutations were attempted.`,
    );
  }
  if (state.targets.group.attributes?.publicLinkEnabled !== true) {
    fail(
      `External group "${options.groupName}" does not have its public link enabled. `
      + "Enable and verify the link in App Store Connect before assigning a build. "
      + "No mutations were attempted.",
    );
  }
}

async function applyChanges(options, key, initialState, reviewerPassword) {
  const operations = [];
  let state = initialState;

  const apply = async (name, request, body) => {
    await requestJson(request, key, body);
    operations.push(name);
  };

  let plan = buildPlan({
    options,
    state,
    reviewerPasswordPresent: Boolean(reviewerPassword),
  });
  assertBuildBetaMutationReady(state);
  assertExternalGroupMutationAuthorized(options, plan);
  assertPublicLinkDistributionReady(options, state);
  if (plan.createBetaAppLocalization) {
    await apply(
      "create-beta-app-localization",
      makeRequest("/v1/betaAppLocalizations", [], "POST"),
      buildBetaAppLocalizationBody(options),
    );
  } else if (plan.updateBetaAppLocalization) {
    await apply(
      "update-beta-app-localization",
      makeRequest(`/v1/betaAppLocalizations/${state.appLocalization.id}`, [], "PATCH"),
      updateBetaAppLocalizationBody(state.appLocalization.id, options),
    );
  }

  if (plan.createBetaBuildLocalization) {
    await apply(
      "create-beta-build-localization",
      makeRequest("/v1/betaBuildLocalizations", [], "POST"),
      buildBetaBuildLocalizationBody(options, state.targets.buildId),
    );
  } else if (plan.updateBetaBuildLocalization) {
    await apply(
      "update-beta-build-localization",
      makeRequest(
        `/v1/betaBuildLocalizations/${state.buildLocalization.id}`,
        [],
        "PATCH",
      ),
      updateBetaBuildLocalizationBody(state.buildLocalization.id),
    );
  }

  if (plan.enableAutoNotify) {
    if (!state.targets.buildBetaDetailId) {
      fail("Build has no buildBetaDetail relationship.");
    }
    await apply(
      "enable-auto-notify",
      makeRequest(
        `/v1/buildBetaDetails/${state.targets.buildBetaDetailId}`,
        [],
        "PATCH",
      ),
      {
        data: {
          type: "buildBetaDetails",
          id: state.targets.buildBetaDetailId,
          attributes: { autoNotifyEnabled: true },
        },
      },
    );
  }

  if (
    plan.updateReviewDetails
    && !plan.missingReviewContactPhone
    && !plan.missingReviewerPassword
  ) {
    const password =
      reviewerPassword || state.reviewDetail.attributes?.demoAccountPassword || "";
    if (!password) fail("Reviewer password is required to update beta review details.");
    await apply(
      "update-beta-app-review-detail",
      makeRequest(`/v1/betaAppReviewDetails/${state.reviewDetail.id}`, [], "PATCH"),
      buildReviewDetailBody(state.reviewDetail.id, options, password),
    );
  }

  if (plan.createExternalGroup) {
    await apply(
      "create-external-group",
      makeRequest("/v1/betaGroups", [], "POST"),
      buildExternalGroupBody(options),
    );
    state = await discover(options, key);
    plan = buildPlan({
      options,
      state,
      reviewerPasswordPresent: Boolean(reviewerPassword),
    });
  }

  if (plan.assignBuildToGroup) {
    await apply(
      "assign-build-to-external-group",
      makeRequest(
        `/v1/betaGroups/${state.targets.groupId}/relationships/builds`,
        [],
        "POST",
      ),
      { data: [{ type: "builds", id: state.targets.buildId }] },
    );
  }

  if (plan.createTester) {
    await apply(
      "create-external-tester",
      makeRequest("/v1/betaTesters", [], "POST"),
      buildTesterBody(options, state.targets.groupId),
    );
  } else if (plan.assignTesterToGroup) {
    await apply(
      "assign-tester-to-external-group",
      makeRequest(
        `/v1/betaGroups/${state.targets.groupId}/relationships/betaTesters`,
        [],
        "POST",
      ),
      { data: [{ type: "betaTesters", id: state.targets.testerId }] },
    );
  }

  state = await discover(options, key);
  plan = buildPlan({
    options,
    state,
    reviewerPasswordPresent: Boolean(reviewerPassword),
  });

  if (options.submitForReview && plan.submitForReview) {
    if (plan.missingReviewContactPhone) {
      fail(
        "Beta review submission needs a review contact phone. "
        + "Set QUIPSLY_CAPTURE_REVIEW_CONTACT_PHONE or --review-contact-phone.",
      );
    }
    if (plan.missingReviewerPassword) {
      fail("Beta review submission needs the reviewer password in macOS Keychain.");
    }
    await apply(
      "submit-build-for-beta-review",
      makeRequest("/v1/betaAppReviewSubmissions", [], "POST"),
      {
        data: {
          type: "betaAppReviewSubmissions",
          relationships: {
            build: { data: { type: "builds", id: state.targets.buildId } },
          },
        },
      },
    );
    state = await discover(options, key);
    plan = buildPlan({
      options,
      state,
      reviewerPasswordPresent: Boolean(reviewerPassword),
    });
  }

  return { state, plan, operations };
}

function receiptFor(options, state, plan, operations, mode) {
  const betaDetail = includedResource(
    state.builds,
    "buildBetaDetails",
    state.targets.buildBetaDetailId,
  );
  const submission = (state.submissions.data || [])[0] || null;
  return {
    schema: "quipsly-app-store-connect-external-beta-v1",
    auditedAt: new Date().toISOString(),
    mode,
    appId: options.appId,
    marketingVersion: options.marketingVersion,
    buildNumber: options.buildNumber,
    buildId: state.targets.buildId,
    groupName: options.groupName,
    groupId: state.targets.groupId || null,
    distributionMode: options.publicLinkOnly ? "public-link-only" : "named-tester",
    publicLinkEnabled:
      state.targets.group?.attributes?.publicLinkEnabled === true,
    testerEmailDigest: options.publicLinkOnly
      ? null
      : emailDigest(options.testerEmail),
    testerId: state.targets.testerId || null,
    testerState: state.targets.tester?.attributes?.state || null,
    testerInviteType: state.targets.tester?.attributes?.inviteType || null,
    groupHasBuild: state.targets.groupHasBuild,
    testerInGroup: state.targets.testerInGroup,
    betaAppLocalizationReady: Boolean(state.appLocalization),
    betaBuildLocalizationReady: Boolean(state.buildLocalization),
    autoNotifyEnabled: betaDetail?.attributes?.autoNotifyEnabled === true,
    externalBuildState: betaDetail?.attributes?.externalBuildState || null,
    betaReviewSubmissionId: submission?.id || null,
    betaReviewState: submission?.attributes?.betaReviewState || null,
    providerBuildReadyForBetaMutation: Boolean(state.targets.buildBetaDetailId),
    operations,
    plan,
    externalGroupCreationAuthorized: options.allowCreateExternalGroup === true,
    passed: Boolean(
      state.targets.group
      && state.targets.groupHasBuild
      && (
        options.publicLinkOnly
          ? state.targets.group.attributes?.publicLinkEnabled === true
          : state.targets.tester && state.targets.testerInGroup
      )
      && state.appLocalization
      && state.buildLocalization
      && betaDetail?.attributes?.autoNotifyEnabled === true
      && (!options.submitForReview || submission),
    ),
  };
}

async function writeReceipt(outputPath, receipt) {
  const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
  if (outputPath) {
    await writeFile(outputPath, serialized, { mode: 0o600 });
    await chmod(outputPath, 0o600);
  }
  process.stdout.write(serialized);
}

async function main() {
  const options = parseExternalBetaArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  if (!options.publicLinkOnly && !clean(options.testerEmail)) {
    fail("--tester-email or --public-link-only is required.");
  }
  if (
    !options.publicLinkOnly
    && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(options.testerEmail)
  ) {
    fail("--tester-email must be a valid email address.");
  }
  options.reviewerPasswordKeychainAccount =
    clean(options.reviewerPasswordKeychainAccount) || options.reviewerEmail;

  const key = await readApiKey(options.apiKeyPath);
  const reviewerPassword = await keychainPassword(
    options.reviewerPasswordKeychainService,
    options.reviewerPasswordKeychainAccount,
  );
  const initialState = await discover(options, key);
  let state = initialState;
  let plan = buildPlan({
    options,
    state,
    reviewerPasswordPresent: Boolean(reviewerPassword),
  });
  let operations = [];
  if (options.apply) {
    ({ state, plan, operations } = await applyChanges(
      options,
      key,
      initialState,
      reviewerPassword,
    ));
  }

  const receipt = receiptFor(
    options,
    state,
    plan,
    operations,
    options.apply ? "apply" : "plan",
  );
  await writeReceipt(options.outputPath, receipt);
  if (options.apply && !receipt.passed) process.exitCode = 1;
}

const isMain =
  process.argv[1]
  && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  main().catch((error) => {
    process.stderr.write(`FAIL ${error.message}\n`);
    process.exitCode = 1;
  });
}
