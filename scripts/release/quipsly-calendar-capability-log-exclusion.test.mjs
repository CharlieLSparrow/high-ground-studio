import assert from "node:assert/strict";
import test from "node:test";

import {
  EXCLUSION_NAME,
  calendarCapabilityRequestLogFilter,
  inspectCalendarCapabilityExclusion,
} from "./quipsly-calendar-capability-log-exclusion.mjs";

test("calendar capability exclusion is limited to the Nest request-log route", () => {
  const filter = calendarCapabilityRequestLogFilter("studio");
  assert.match(filter, /resource\.type="cloud_run_revision"/);
  assert.match(filter, /resource\.labels\.service_name="studio"/);
  assert.match(filter, /LOG_ID\("run\.googleapis\.com\/requests"\)/);
  assert.ok(filter.includes("/api/calendar/feeds/[^/?#]+"));
  assert.doesNotMatch(filter, /calendar\/feeds"/);
});

test("calendar capability exclusion rejects missing, disabled, and drifted policy", () => {
  assert.equal(
    inspectCalendarCapabilityExclusion({ exclusions: [] }).reason,
    "missing",
  );
  assert.equal(
    inspectCalendarCapabilityExclusion({
      exclusions: [
        { name: EXCLUSION_NAME, disabled: true, filter: "anything" },
      ],
    }).reason,
    "disabled",
  );
  assert.equal(
    inspectCalendarCapabilityExclusion({
      exclusions: [{ name: EXCLUSION_NAME, filter: "resource.type=global" }],
    }).reason,
    "filter-mismatch",
  );
});

test("calendar capability exclusion accepts the exact enabled policy", () => {
  const result = inspectCalendarCapabilityExclusion({
    exclusions: [
      {
        name: EXCLUSION_NAME,
        filter: calendarCapabilityRequestLogFilter("studio"),
      },
    ],
  });
  assert.equal(result.ok, true);
  assert.equal(result.reason, "configured");
});
