export function summarizePublicRouteFailure(check) {
  if (check.error) return check.error;
  if (!check.finalHostMatches) {
    return `unexpected final host: ${check.finalHost || "unknown"}; expected ${check.expectedFinalHost}`;
  }
  if (check.httpStatus >= 500) {
    const provider = check.server ? `${check.server} ` : "";
    return `${provider}service unavailable (${check.httpStatus}); application contract was not reachable`;
  }
  if (check.httpStatus === 404) return "route is not deployed or is routed to an older app image";
  if (check.presentStaleMarkers.length) return `stale markers found: ${check.presentStaleMarkers.join(", ")}`;
  if (check.missingMarkers.length) return `missing markers: ${check.missingMarkers.join(", ")}`;
  if (!check.jsonMatches) return "JSON shape does not match the shared coaching packet contract";
  return `unexpected HTTP/content response: ${check.httpStatus}`;
}

export function classifyPublicRouteFailure(check, target) {
  if (check.status === "pass") {
    return {
      failureClass: null,
      likelyCause: "Route matches the current public-loop contract.",
      nextAction: "Keep monitoring during deploy and promotion.",
      fixLane: target.fixLane,
    };
  }

  if (!check.finalHostMatches) {
    return {
      failureClass: "host-boundary-drift",
      likelyCause: "Host-boundary drift or stale proxy image. The request landed on the wrong public/private surface.",
      nextAction: target.id === "quipslyMarketingCoaching"
        ? "Deploy/promote Quipsly/apps/quipsly, then verify quipsly.com/coaching final host is quipsly.com and page contains the coaching product markers."
        : "Check domain routing/proxy rules before treating content markers as meaningful.",
      fixLane: target.fixLane,
    };
  }

  if (check.httpStatus >= 500) {
    const provider = check.server ? ` from ${check.server}` : "";
    return {
      failureClass: "service-unavailable",
      likelyCause: `The public service returned HTTP ${check.httpStatus}${provider} before the application route contract could be evaluated. This is service-plane, billing, traffic, revision-readiness, or startup state—not missing page copy.`,
      nextAction: "Inspect project billing and Cloud Run service/revision readiness after operator auth is restored; do not patch route copy or deploy blindly.",
      fixLane: target.fixLane,
    };
  }

  if (check.httpStatus === 404 && String(check.contentType || "").includes("text/html")) {
    return {
      failureClass: "route-not-deployed",
      likelyCause: "The live service is serving an older app image without this route.",
      nextAction: target.fixLane,
      fixLane: target.fixLane,
    };
  }

  if (check.presentStaleMarkers.length > 0) {
    return {
      failureClass: "stale-deployment",
      likelyCause: "The live page is serving stale product copy from an older deployment.",
      nextAction: target.fixLane,
      fixLane: target.fixLane,
    };
  }

  if (check.missingMarkers.length > 0) {
    return {
      failureClass: "contract-marker-drift",
      likelyCause: "The route exists, but public-loop copy or contract markers drifted.",
      nextAction: "Compare the live page against the source contract and deploy the correct surface after local static smoke passes.",
      fixLane: target.fixLane,
    };
  }

  if (!check.jsonMatches) {
    return {
      failureClass: "json-contract-drift",
      likelyCause: "The JSON route exists, but does not match the shared coaching/capture contract.",
      nextAction: "Fix the route contract or deploy the current Nest source, then rerun the JSON smoke.",
      fixLane: target.fixLane,
    };
  }

  return {
    failureClass: "unexpected-response",
    likelyCause: "Unexpected response shape.",
    nextAction: target.fixLane,
    fixLane: target.fixLane,
  };
}
