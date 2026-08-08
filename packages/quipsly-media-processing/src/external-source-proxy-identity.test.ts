import assert from "node:assert/strict";
import test from "node:test";

import {
  externalSourceProxyDerivativeId,
  externalSourceProxyIdentity,
  externalSourceProxyJobId,
} from "./external-source-proxy-identity.js";

const source = {
  projectId: "project_12345678",
  sourceRevisionId: "revision_12345678",
  identitySha256: "a".repeat(64),
};

test("executor custody gives each Mac an independent proxy identity", () => {
  const first = externalSourceProxyIdentity({
    ...source,
    custodianNodeId: "execution_worker_12345678",
    storageScopeId: "storage_scope_12345678",
  });
  const repeated = externalSourceProxyIdentity({
    ...source,
    custodianNodeId: "execution_worker_12345678",
    storageScopeId: "storage_scope_12345678",
  });
  const second = externalSourceProxyIdentity({
    ...source,
    custodianNodeId: "execution_worker_87654321",
    storageScopeId: "storage_scope_87654321",
  });

  assert.equal(first, repeated);
  assert.notEqual(first, second);
  assert.equal(
    externalSourceProxyJobId(first),
    externalSourceProxyJobId(repeated),
  );
  assert.notEqual(
    externalSourceProxyJobId(first),
    externalSourceProxyJobId(second),
  );
  assert.notEqual(
    externalSourceProxyDerivativeId(first),
    externalSourceProxyDerivativeId(second),
  );
});

test("proxy custody rejects a partially specified executor", () => {
  assert.throws(
    () =>
      externalSourceProxyIdentity({
        ...source,
        custodianNodeId: "execution_worker_12345678",
      }),
    /custody identity is invalid/,
  );
});
