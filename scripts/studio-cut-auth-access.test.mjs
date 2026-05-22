import assert from "node:assert/strict";
import { test } from "node:test";

import {
  checkStudioCutEmailAccess,
  getAllowedAccessDescription,
  isStudioCutAccessConfigured,
  parseAllowedEmailDomains,
  parseAllowedEmails,
} from "../apps/studio-cut-web/src/authAccess.ts";

test("Studio Cut auth access parses exact emails and domains", () => {
  assert.deepEqual(
    parseAllowedEmails("Charlie@HighGroundOdyssey.com, homer@example.com"),
    ["charlie@highgroundodyssey.com", "homer@example.com"],
  );
  assert.deepEqual(
    parseAllowedEmailDomains("@HighGroundOdyssey.com, example.org"),
    ["highgroundodyssey.com", "example.org"],
  );
});

test("Studio Cut auth access allows exact email matches", () => {
  assert.deepEqual(
    checkStudioCutEmailAccess("CHARLIE@HIGHGROUNDODYSSEY.COM", {
      allowedEmails: ["charlie@highgroundodyssey.com"],
      allowedEmailDomains: [],
    }),
    { allowed: true, reason: "email" },
  );
});

test("Studio Cut auth access allows configured email domains", () => {
  assert.deepEqual(
    checkStudioCutEmailAccess("guest@highgroundodyssey.com", {
      allowedEmails: [],
      allowedEmailDomains: ["highgroundodyssey.com"],
    }),
    { allowed: true, reason: "domain" },
  );
});

test("Studio Cut auth access rejects unapproved domains", () => {
  assert.deepEqual(
    checkStudioCutEmailAccess("guest@example.com", {
      allowedEmails: [],
      allowedEmailDomains: ["highgroundodyssey.com"],
    }),
    { allowed: false, reason: "not_allowed" },
  );
});

test("Studio Cut auth access describes combined allow rules", () => {
  const accessConfig = {
    allowedEmails: ["charlie@highgroundodyssey.com"],
    allowedEmailDomains: ["highgroundodyssey.com"],
  };

  assert.equal(isStudioCutAccessConfigured(accessConfig), true);
  assert.equal(
    getAllowedAccessDescription(accessConfig),
    "an approved email address or approved High Ground Odyssey email domain",
  );
});
