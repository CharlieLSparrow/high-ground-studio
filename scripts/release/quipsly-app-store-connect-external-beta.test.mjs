import assert from "node:assert/strict";
import test from "node:test";

import {
  assertBuildBetaMutationReady,
  assertExternalGroupMutationAuthorized,
  buildExternalGroupBody,
  buildPlan,
  buildTesterBody,
  parseExternalBetaArguments,
  resolveExternalBetaTargets,
} from "./quipsly-app-store-connect-external-beta.mjs";

const options = {
  appId: "6780995957",
  marketingVersion: "1.0",
  buildNumber: "7",
  groupName: "Quipsly Capture Rehearsal",
  locale: "en-US",
  testerEmail: "homer@example.test",
  testerFirstName: "Homer",
  testerLastName: "",
  reviewContactFirstName: "Charlie",
  reviewContactLastName: "Sparrow",
  reviewContactEmail: "charlie@example.test",
  reviewContactPhone: "",
  reviewerEmail: "reviewer@example.test",
  feedbackEmail: "feedback@example.test",
};

const buildDocument = {
  data: [{
    type: "builds",
    id: "build-7",
    attributes: { version: "7", processingState: "VALID" },
    relationships: {
      preReleaseVersion: {
        data: { type: "preReleaseVersions", id: "version-1" },
      },
      buildBetaDetail: {
        data: { type: "buildBetaDetails", id: "detail-7" },
      },
    },
  }],
  included: [
    {
      type: "preReleaseVersions",
      id: "version-1",
      attributes: { version: "1.0" },
    },
    {
      type: "buildBetaDetails",
      id: "detail-7",
      attributes: {
        autoNotifyEnabled: false,
        externalBuildState: "READY_FOR_BETA_SUBMISSION",
      },
    },
  ],
};

test("requires apply before a beta-review submission", () => {
  assert.throws(
    () => parseExternalBetaArguments(["--submit-for-review"]),
    /requires --apply/,
  );
});

test("requires a separate explicit authorization before creating an external group", () => {
  assert.equal(
    parseExternalBetaArguments(["--tester-email", "homer@example.test"])
      .allowCreateExternalGroup,
    false,
  );
  assert.equal(
    parseExternalBetaArguments([
      "--tester-email",
      "homer@example.test",
      "--allow-create-external-group",
    ]).allowCreateExternalGroup,
    true,
  );
  assert.throws(
    () => assertExternalGroupMutationAuthorized(
      {
        groupName: "Quipsly Capture Rehearsal",
        allowCreateExternalGroup: false,
      },
      { createExternalGroup: true },
    ),
    /empty provider read can be transient/,
  );
  assert.doesNotThrow(
    () => assertExternalGroupMutationAuthorized(
      {
        groupName: "Brand New Group",
        allowCreateExternalGroup: true,
      },
      { createExternalGroup: true },
    ),
  );
});

test("refuses every beta mutation until Apple publishes buildBetaDetail", () => {
  assert.throws(
    () => assertBuildBetaMutationReady({
      targets: { buildBetaDetailId: "" },
    }),
    /No beta metadata, group, tester, notification, or review mutation was attempted/,
  );
  assert.doesNotThrow(
    () => assertBuildBetaMutationReady({
      targets: { buildBetaDetailId: "detail-10" },
    }),
  );
});

test("resolves the exact external group, build, and tester idempotently", () => {
  const targets = resolveExternalBetaTargets({
    options,
    buildDocument,
    groupDocument: {
      data: [{
        type: "betaGroups",
        id: "external-group",
        attributes: {
          name: options.groupName,
          isInternalGroup: false,
        },
        relationships: {
          builds: { data: [{ type: "builds", id: "build-7" }] },
          betaTesters: { data: [{ type: "betaTesters", id: "homer" }] },
        },
      }],
    },
    testerDocument: {
      data: [{
        type: "betaTesters",
        id: "homer",
        attributes: { email: options.testerEmail },
      }],
    },
  });

  assert.equal(targets.buildId, "build-7");
  assert.equal(targets.buildBetaDetailId, "detail-7");
  assert.equal(targets.groupId, "external-group");
  assert.equal(targets.groupHasBuild, true);
  assert.equal(targets.testerId, "homer");
  assert.equal(targets.testerInGroup, true);
});

test("creates only an external, private group and assigns tester by relationship", () => {
  assert.deepEqual(buildExternalGroupBody(options), {
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
  });
  assert.deepEqual(buildTesterBody(options, "external-group"), {
    data: {
      type: "betaTesters",
      attributes: {
        email: options.testerEmail,
        firstName: "Homer",
      },
      relationships: {
        betaGroups: {
          data: [{ type: "betaGroups", id: "external-group" }],
        },
      },
    },
  });
});

test("plans missing setup and preserves the contact-phone gate", () => {
  const targets = resolveExternalBetaTargets({
    options,
    buildDocument,
    groupDocument: { data: [] },
    testerDocument: { data: [] },
  });
  const state = {
    builds: buildDocument,
    targets,
    appLocalization: null,
    buildLocalization: null,
    reviewDetail: {
      id: options.appId,
      attributes: {},
    },
    submissions: { data: [] },
  };
  const plan = buildPlan({
    options,
    state,
    reviewerPasswordPresent: true,
  });

  assert.equal(plan.createExternalGroup, true);
  assert.equal(plan.assignBuildToGroup, true);
  assert.equal(plan.createTester, true);
  assert.equal(plan.createBetaAppLocalization, true);
  assert.equal(plan.createBetaBuildLocalization, true);
  assert.equal(plan.enableAutoNotify, true);
  assert.equal(plan.updateReviewDetails, true);
  assert.equal(plan.submitForReview, true);
  assert.equal(plan.missingReviewContactPhone, true);
  assert.equal(plan.missingReviewerPassword, false);
});
