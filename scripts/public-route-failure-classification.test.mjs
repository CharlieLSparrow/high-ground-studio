import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyPublicRouteFailure,
  summarizePublicRouteFailure,
} from "./lib/public-route-failure-classification.mjs";

function failedCheck(overrides = {}) {
  return {
    status: "fail",
    error: null,
    httpStatus: 503,
    server: "Google Frontend",
    contentType: "text/html; charset=UTF-8",
    finalHostMatches: true,
    finalHost: "nest.quipsly.com",
    expectedFinalHost: "nest.quipsly.com",
    presentStaleMarkers: [],
    missingMarkers: ["ok"],
    jsonMatches: false,
    ...overrides,
  };
}

const target = {
  id: "nestMobileCaptureReadiness",
  fixLane: "Deploy the current Nest service.",
};

test("classifies a provider 503 as service unavailable before marker drift", () => {
  const check = failedCheck();
  const classification = classifyPublicRouteFailure(check, target);

  assert.equal(classification.failureClass, "service-unavailable");
  assert.match(classification.likelyCause, /service-plane, billing, traffic, revision-readiness, or startup/);
  assert.match(classification.nextAction, /do not patch route copy or deploy blindly/);
  assert.equal(
    summarizePublicRouteFailure(check),
    "Google Frontend service unavailable (503); application contract was not reachable",
  );
});

test("keeps ordinary marker drift distinct once a route is reachable", () => {
  const classification = classifyPublicRouteFailure(
    failedCheck({ httpStatus: 200, server: null, jsonMatches: true }),
    target,
  );

  assert.equal(classification.failureClass, "contract-marker-drift");
});

test("host-boundary drift remains more specific than provider availability", () => {
  const classification = classifyPublicRouteFailure(
    failedCheck({ finalHostMatches: false, finalHost: "quipsly.com" }),
    target,
  );

  assert.equal(classification.failureClass, "host-boundary-drift");
});
