import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInvitationBody,
  parseArguments,
  resolveInvitationTarget,
} from "./quipsly-app-store-connect-resend-invitation.mjs";

function fixtures({ state = "INVITED", appIds = ["app-1"] } = {}) {
  const tester = {
    type: "betaTesters",
    id: "tester-1",
    attributes: {
      email: "tester@icloud.com",
      state,
      inviteType: "EMAIL",
    },
    relationships: {
      apps: { data: appIds.map((id) => ({ type: "apps", id })) },
      betaGroups: {
        data: [{ type: "betaGroups", id: "group-1" }],
      },
    },
  };
  return {
    appDocument: {
      data: {
        type: "apps",
        id: "app-1",
        attributes: {
          name: "Quipsly Capture",
          bundleId: "com.highgroundodyssey.HighGroundCapture",
        },
      },
    },
    testerListDocument: {
      data: [
        {
          type: "betaTesters",
          id: "tester-1",
          attributes: { email: "tester@icloud.com", state },
        },
      ],
    },
    testerDocument: { data: tester },
  };
}

test("invitation resend is read-only unless apply is explicit", () => {
  const plan = parseArguments(["--tester-email", "tester@icloud.com"]);
  assert.equal(plan.apply, false);
  assert.equal(plan.testerEmail, "tester@icloud.com");

  const apply = parseArguments([
    "--tester-email",
    "tester@icloud.com",
    "--apply",
  ]);
  assert.equal(apply.apply, true);
});

test("invitation body binds one exact app and tester", () => {
  assert.deepEqual(
    buildInvitationBody({ appId: "app-1", testerId: "tester-1" }),
    {
      data: {
        type: "betaTesterInvitations",
        relationships: {
          app: { data: { type: "apps", id: "app-1" } },
          betaTester: {
            data: { type: "betaTesters", id: "tester-1" },
          },
        },
      },
    },
  );
});

test("invitation target requires exact email and app assignment", () => {
  const target = resolveInvitationTarget({
    ...fixtures(),
    expectedAppId: "app-1",
    expectedEmail: "TESTER@icloud.com",
  });
  assert.equal(target.tester.id, "tester-1");
  assert.equal(target.state, "INVITED");
  assert.deepEqual(target.testerGroupIds, ["group-1"]);

  assert.throws(
    () =>
      resolveInvitationTarget({
        ...fixtures({ appIds: ["another-app"] }),
        expectedAppId: "app-1",
        expectedEmail: "tester@icloud.com",
      }),
    /not assigned to this app/,
  );
});

test("accepted or installed testers cannot be emailed again", () => {
  for (const state of ["ACCEPTED", "INSTALLED"]) {
    assert.throws(
      () =>
        resolveInvitationTarget({
          ...fixtures({ state }),
          expectedAppId: "app-1",
          expectedEmail: "tester@icloud.com",
        }),
      new RegExp(`state ${state} is not eligible`),
    );
  }
});

test("missing provider state fails closed", () => {
  assert.throws(
    () =>
      resolveInvitationTarget({
        ...fixtures({ state: "" }),
        expectedAppId: "app-1",
        expectedEmail: "tester@icloud.com",
      }),
    /state UNKNOWN is not eligible/,
  );
});
