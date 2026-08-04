import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const agentServer = await readFile(
  new URL(
    "../apps/QuipslyStudio/Sources/SharedUI/AgentServer.swift",
    import.meta.url,
  ),
  "utf8",
);
const agentctl = await readFile(
  new URL(
    "../apps/QuipslyStudio/script/agentctl.sh",
    import.meta.url,
  ),
  "utf8",
);

test("Mac agent authority is enforced at the loopback and browser-request boundaries", () => {
  assert.match(agentServer, /parameters\.acceptLocalOnly = true/);
  assert.match(
    agentServer,
    /parameters\.requiredLocalEndpoint = \.hostPort\([\s\S]*host: "127\.0\.0\.1"/,
  );
  assert.match(agentServer, /request\.headers\["sec-fetch-site"\]/);
  assert.match(agentServer, /fetchSite == "cross-site"/);
  assert.match(agentServer, /hasUntrustedBrowserOrigin/);
  assert.match(agentServer, /cross_site_agent_control_rejected/);
  assert.match(
    agentctl,
    /X-Quipsly-Agent-Control: local-control-v1/,
  );
});

test("Mac agent state returns cached bytes before optional external export reconciliation", () => {
  const stateCaseStart = agentServer.indexOf('case "/state":');
  const nextCaseStart = agentServer.indexOf(
    'case "/social_master_queue":',
    stateCaseStart,
  );
  assert.ok(stateCaseStart >= 0);
  assert.ok(nextCaseStart > stateCaseStart);

  const stateCase = agentServer.slice(stateCaseStart, nextCaseStart);
  assert.match(stateCase, /cachedStatusResponseData\(\)/);
  assert.match(stateCase, /sendJSONData\(connection, bodyData: cachedStatus\)/);
  assert.match(stateCase, /scheduleProxyShortExportReconciliation\(\)/);
  assert.doesNotMatch(stateCase, /proxyShortExportManifestSummary/);
  assert.ok(
    stateCase.indexOf("sendJSONData") <
      stateCase.indexOf("scheduleProxyShortExportReconciliation"),
    "the state response must be sent before optional filesystem reconciliation",
  );
});

test("Mac proxy export reconciliation is coalesced, off-request, and merges into fresh cached state", () => {
  assert.match(
    agentServer,
    /proxyShortReconciliationInFlight[\s\S]*proxyShortReconciliationNeeded/,
  );
  assert.match(
    agentServer,
    /DispatchQueue\.global\(qos: \.utility\)\.async[\s\S]*reconcileProxyShortExportIntoCachedStatus/,
  );
  assert.match(
    agentServer,
    /generation == proxyShortReconciliationGeneration/,
  );
  assert.match(
    agentServer,
    /let summary = proxyShortExportManifestSummary\([\s\S]*var status = cachedStatusDictionary\(\)/,
  );
});
